import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFile, rm, access, mkdtemp, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { PDFDocument } from 'pdf-lib';
import { checkPoppler, extractBbox, extractSvg, getPageCount } from '../src/poppler.js';
import { extractBoxes } from '../src/extract-boxes.js';
import { extractLabels } from '../src/extract-labels.js';
import { groupBoxesIntoFields } from '../src/group-rows.js';
import { mapLabelsToFields } from '../src/map-labels.js';
import { injectFields } from '../src/inject-fields.js';
import type { Field, FieldOutput } from '../src/types.js';

const FIXTURES = join(import.meta.dirname, 'fixtures');
const INPUT_PDF = join(FIXTURES, 'sample-cerfa.pdf');

describe('E2E: full pipeline on sample CERFA', () => {
  let allFields: Field[];
  let output: FieldOutput;
  let tmpDir: string;
  let outputPdf: string;
  let outputJson: string;

  beforeAll(async () => {
    await checkPoppler();
    tmpDir = await mkdtemp(join(tmpdir(), 'cerfaparse-test-'));
    outputPdf = join(tmpDir, 'output-fillable.pdf');
    outputJson = join(tmpDir, 'output-fillable.fields.json');

    const pageCount = await getPageCount(INPUT_PDF);
    const bboxHtml = await extractBbox(INPUT_PDF);
    const labelsByPage = extractLabels(bboxHtml);

    allFields = [];
    for (let page = 1; page <= pageCount; page++) {
      const svgXml = await extractSvg(INPUT_PDF, page);
      const { boxes, transform, pageHeight } = extractBoxes(svgXml);
      const fieldGroups = groupBoxesIntoFields(boxes, page);
      const labels = labelsByPage.get(page) ?? [];
      const fields = mapLabelsToFields(fieldGroups, labels, transform, page, pageHeight);
      allFields.push(...fields);
    }

    // Write output PDF
    const pdfBytes = new Uint8Array(await readFile(INPUT_PDF));
    const filledPdf = await injectFields(pdfBytes, allFields);
    await writeFile(outputPdf, filledPdf);

    // Write output JSON
    output = {
      pages: Array.from({ length: pageCount }, (_, i) => ({
        pageNumber: i + 1,
        fields: allFields.filter((f) => f.props.page === i + 1),
      })),
    };
    await writeFile(outputJson, JSON.stringify(output, null, 2));
  });

  afterAll(async () => {
    if (tmpDir) {
      await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }
  });

  it('produces output PDF file', async () => {
    await expect(access(outputPdf)).resolves.toBeUndefined();
  });

  it('produces output JSON file', async () => {
    await expect(access(outputJson)).resolves.toBeUndefined();
  });

  it('JSON has 2 pages', () => {
    expect(output.pages).toHaveLength(2);
  });

  it('page 1 has reasonable field count (20-70)', () => {
    const page1 = output.pages[0].fields;
    expect(page1.length).toBeGreaterThanOrEqual(20);
    expect(page1.length).toBeLessThanOrEqual(70);
  });

  it('page 2 has reasonable field count (50-130)', () => {
    const page2 = output.pages[1].fields;
    expect(page2.length).toBeGreaterThanOrEqual(50);
    expect(page2.length).toBeLessThanOrEqual(130);
  });

  it('all fields have non-empty keys', () => {
    for (const field of allFields) {
      expect(field.key).toBeTruthy();
    }
  });

  it('all field keys are unique', () => {
    const keys = allFields.map((f) => f.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('all pdfRects have positive dimensions', () => {
    for (const field of allFields) {
      expect(field.props.pdfRect.width).toBeGreaterThan(0);
      expect(field.props.pdfRect.height).toBeGreaterThan(0);
    }
  });

  it('input fields have maxLength > 0', () => {
    const cells = allFields.filter((f) => f.type === 'input');
    expect(cells.length).toBeGreaterThan(0);
    for (const cell of cells) {
      expect(cell.props.maxLength).toBeGreaterThan(0);
    }
  });

  it('output PDF has AcroForm with correct field count', async () => {
    const pdfBytes = await readFile(outputPdf);
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const form = pdfDoc.getForm();
    const formFields = form.getFields();
    expect(formFields.length).toBe(allFields.length);
  });
});
