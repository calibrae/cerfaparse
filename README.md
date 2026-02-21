# cerfaparse

Convert flat (non-interactive) French CERFA PDF forms into fillable AcroForm PDFs with JSON field definitions.

## What it does

1. Extracts character cells and checkboxes from the PDF geometry (via SVG)
2. Extracts labels from the PDF text layer
3. Maps labels to field groups to generate meaningful field names
4. Injects AcroForm fields (combed text fields + checkboxes) into the PDF
5. Outputs a `.fields.json` with all field definitions (name, type, label, position, maxLength)

## Prerequisites

- Node.js >= 20
- [Poppler](https://poppler.freedesktop.org/) CLI tools (`pdftocairo`, `pdftotext`, `pdfinfo`)

```bash
# macOS
brew install poppler

# Debian/Ubuntu
sudo apt-get install poppler-utils
```

## Install

```bash
npm install
```

## CLI Usage

```bash
npx tsx src/cli.ts convert <input.pdf> [-o <output.pdf>]
```

Example:

```bash
npx tsx src/cli.ts convert docs/pdf-cerfa_cs8_bleu-recto-verso-140x202mm.pdf -o /tmp/cs8-fillable.pdf
```

This produces:
- `/tmp/cs8-fillable.pdf` — the original PDF with overlay AcroForm fields
- `/tmp/cs8-fillable.fields.json` — JSON field definitions

## JSON Output Format

```json
{
  "pages": [
    {
      "pageNumber": 1,
      "fields": [
        {
          "name": "p1_nom",
          "type": "cell",
          "label": "Nom :",
          "page": 1,
          "pdfRect": { "x": 50.4, "y": 505.6, "width": 104.1, "height": 10.9 },
          "maxLength": 9
        },
        {
          "name": "p1_oui",
          "type": "checkbox",
          "label": "Oui",
          "page": 1,
          "pdfRect": { "x": 288.1, "y": 472.3, "width": 8.0, "height": 8.0 }
        }
      ]
    }
  ]
}
```

### Field types

| Type | Description | Extra fields |
|------|-------------|-------------|
| `cell` | Character cell input (one char per box) | `maxLength` — number of character cells |
| `checkbox` | Checkbox | — |

## Library Usage (Node.js)

```typescript
import { convert } from 'cerfaparse';

const { pdfOut, jsonOut, fields } = await convert('input.pdf', 'output.pdf');
```

Or use individual functions:

```typescript
import { extractBoxes } from 'cerfaparse';
import { extractSvg } from 'cerfaparse';
```

## Using with Angular / ngx-formly

The JSON output is designed to drive dynamic forms. Run `convert` at build time, then use the JSON in your Angular app:

```typescript
// Load the generated JSON
import fieldDefs from './assets/cerfa-cs8.fields.json';

// Map to ngx-formly field config
const formlyFields = fieldDefs.pages.flatMap(page =>
  page.fields.map(field => ({
    key: field.name,
    type: field.type === 'cell' ? 'input' : 'checkbox',
    props: {
      label: field.label,
      maxLength: field.maxLength,
    },
  }))
);
```

To fill the PDF client-side with [pdf-lib](https://pdf-lib.js.org/) (works in the browser):

```typescript
import { PDFDocument } from 'pdf-lib';

const pdfBytes = await fetch('/assets/cerfa-cs8-fillable.pdf').then(r => r.arrayBuffer());
const pdfDoc = await PDFDocument.load(pdfBytes);
const form = pdfDoc.getForm();

for (const [key, value] of Object.entries(formValues)) {
  const field = fieldDefs.pages.flatMap(p => p.fields).find(f => f.name === key);
  if (!field) continue;
  if (field.type === 'cell') {
    form.getTextField(key).setText(String(value));
  } else {
    const cb = form.getCheckBox(key);
    value ? cb.check() : cb.uncheck();
  }
}

const filledBytes = await pdfDoc.save();
// Trigger download or display
```

## Tests

```bash
npx vitest run
```

## How it works

1. **pdftocairo** converts each PDF page to SVG
2. SVG `<path>` elements with white fill are classified as character cells (white stroke, stroke-width ~1) or checkboxes (dark stroke, stroke-width ~0.5)
3. SVG affine transform matrices (including ancestor `<g>`/`<use>` transforms) are composed to convert from SVG content coordinates to PDF coordinates (bottom-left origin, Y-up)
4. Boxes are grouped into rows by Y-proximity, then split into fields by X-gaps
5. **pdftotext** bbox output provides label text and positions, matched to field groups by spatial proximity
6. **pdf-lib** injects AcroForm fields with transparent backgrounds at the computed PDF coordinates
