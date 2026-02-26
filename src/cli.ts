import { program } from 'commander';
import { readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { checkPoppler, extractBbox, extractSvg, getPageCount } from './poppler.js';
import { extractBoxes } from './extract-boxes.js';
import { extractLabels } from './extract-labels.js';
import { groupBoxesIntoFields } from './group-rows.js';
import { mapLabelsToFields, generateFieldName, deduplicateName } from './map-labels.js';
import { injectFields } from './inject-fields.js';
import { extractDotLineFields } from './extract-dot-lines.js';
import type { Field, FieldOutput } from './types.js';

export async function convert(inputPath: string, outputPath?: string): Promise<{
  pdfOut: string;
  jsonOut: string;
  fields: Field[];
}> {
  // 1. Check dependencies
  await checkPoppler();

  // 2. Resolve output paths
  const dir = dirname(inputPath);
  const base = basename(inputPath, '.pdf');
  const pdfOut = outputPath ?? join(dir, `${base}-fillable.pdf`);
  const jsonOut = join(dirname(pdfOut), `${basename(pdfOut, '.pdf')}.fields.json`);

  // 3. Get page count
  const pageCount = await getPageCount(inputPath);
  console.log(`Processing ${pageCount} page(s)...`);

  // 4. Extract bbox labels (all pages at once)
  const bboxHtml = await extractBbox(inputPath);
  const labelsByPage = extractLabels(bboxHtml);

  // 5. Process each page: SVG → boxes → groups → fields
  const allFields: Field[] = [];

  for (let page = 1; page <= pageCount; page++) {
    console.log(`  Page ${page}: extracting geometry...`);

    const svgXml = await extractSvg(inputPath, page);
    const { boxes, transform, pageHeight } = extractBoxes(svgXml);

    const labels = labelsByPage.get(page) ?? [];

    // Detect dot-line free-text fields
    const usedNames = new Set<string>(allFields.map((f) => f.key));
    const { fields: dotFields, consumedLabelIndices } = extractDotLineFields(
      labels, page, pageHeight, usedNames,
    );

    // Filter consumed dot labels before passing to SVG-based pipeline
    const remainingLabels = labels.filter((_, i) => !consumedLabelIndices.has(i));

    if (!transform || boxes.length === 0) {
      if (dotFields.length === 0) {
        console.log(`  Page ${page}: no input boxes found, skipping`);
        continue;
      }
      // Page has dot-line fields but no SVG boxes
      const freeTextCount = dotFields.length;
      console.log(`  Page ${page}: ${freeTextCount} free-text field(s)`);
      allFields.push(...dotFields);
      continue;
    }

    const fieldGroups = groupBoxesIntoFields(boxes, page);
    // Add dot-line names to usedNames so SVG fields don't collide
    for (const f of dotFields) usedNames.add(f.key);
    const fields = mapLabelsToFields(fieldGroups, remainingLabels, transform, page, pageHeight, usedNames);

    const cellCount = fields.filter((f) => f.type === 'input').length;
    const checkboxCount = fields.filter((f) => f.type === 'checkbox').length;
    const freeTextCount = dotFields.length;
    console.log(`  Page ${page}: ${cellCount} text fields, ${checkboxCount} checkboxes${freeTextCount ? `, ${freeTextCount} free-text field(s)` : ''}`);

    allFields.push(...fields, ...dotFields);
  }

  // 6. Inject AcroForm fields into PDF
  console.log('Injecting AcroForm fields...');
  const pdfBytes = new Uint8Array(await readFile(inputPath));
  const filledPdf = await injectFields(pdfBytes, allFields);
  await writeFile(pdfOut, filledPdf);

  // 7. Write JSON field definitions
  const output: FieldOutput = {
    pages: Array.from({ length: pageCount }, (_, i) => ({
      pageNumber: i + 1,
      fields: allFields.filter((f) => f.props.page === i + 1),
    })),
  };
  await writeFile(jsonOut, JSON.stringify(output, null, 2));

  console.log(`\nDone!`);
  console.log(`  PDF:  ${pdfOut}`);
  console.log(`  JSON: ${jsonOut}`);
  console.log(`  Total fields: ${allFields.length}`);

  return { pdfOut, jsonOut, fields: allFields };
}

function main() {
  program
    .name('cerfaparse')
    .description('Convert flat CERFA PDFs into fillable AcroForm PDFs with field definitions')
    .version('0.1.0');

  program
    .command('convert')
    .description('Convert a flat CERFA PDF to a fillable AcroForm PDF + JSON field definitions')
    .argument('<input>', 'Path to the input CERFA PDF')
    .option('-o, --output <path>', 'Output PDF path')
    .action(async (input: string, opts: { output?: string }) => {
      try {
        await convert(input, opts.output);
      } catch (err) {
        console.error(`Error: ${(err as Error).message}`);
        process.exit(1);
      }
    });

  if (process.argv.length <= 2) {
    program.help();
  }

  program.parse();
}

// Only run CLI when executed directly (not imported as library)
const isMainModule = process.argv[1] && (
  import.meta.url.endsWith(process.argv[1]) ||
  import.meta.url === `file://${process.argv[1]}`
);
if (isMainModule) {
  main();
}
