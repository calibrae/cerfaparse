import type { Field, FieldType, Label, PdfRect } from './types.js';
import type { FieldGroup } from './group-rows.js';
import { svgBoxToPdfRect } from './transform.js';
import type { TransformMatrix } from './types.js';

/** Map internal box type to formly-compatible field type */
function toFieldType(boxType: 'cell' | 'checkbox'): FieldType {
  return boxType === 'cell' ? 'input' : 'checkbox';
}

/** Max Y-distance (PDF pts) for a label to be considered "above" a field row */
const LABEL_Y_MAX_DISTANCE = 25;

/** Convert pdftotext label coords (top-left origin, Y-down) to PDF coords (bottom-left, Y-up) */
function labelToPdfCoords(label: Label, pageHeight: number): {
  xMin: number; xMax: number; yBottom: number; yTop: number;
} {
  return {
    xMin: label.xMin,
    xMax: label.xMax,
    yBottom: pageHeight - label.yMax,  // bottom edge in PDF
    yTop: pageHeight - label.yMin,     // top edge in PDF
  };
}

/**
 * Map labels to field groups and produce Field definitions.
 * Labels are in pdftotext coords (viewport); boxes are in SVG content coords.
 * Both are converted to PDF coords (bottom-left, Y-up) before matching.
 */
export function mapLabelsToFields(
  fieldGroups: FieldGroup[],
  labels: Label[],
  transform: TransformMatrix,
  page: number,
  pageHeight: number,
): Field[] {
  const fields: Field[] = [];
  const usedNames = new Set<string>();

  for (const group of fieldGroups) {
    const pdfRect = computeGroupPdfRect(group, transform, pageHeight);
    const bestLabel = findBestLabel(pdfRect, labels, pageHeight);
    const labelText = bestLabel?.text ?? '';

    const baseName = generateFieldName(labelText, group.row.type, page);
    const name = deduplicateName(baseName, usedNames);
    usedNames.add(name);

    const field: Field = {
      key: name,
      type: toFieldType(group.row.type),
      props: {
        label: labelText,
        page,
        pdfRect,
        ...(group.row.type === 'cell' ? { maxLength: group.boxCount } : {}),
      },
    };

    fields.push(field);
  }

  return fields;
}

function computeGroupPdfRect(
  group: FieldGroup,
  transform: TransformMatrix,
  pageHeight: number,
): PdfRect {
  const rects = group.boxes.map((box) => svgBoxToPdfRect(box, transform, pageHeight));
  let x = Infinity, y = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const r of rects) {
    if (r.x < x) x = r.x;
    if (r.y < y) y = r.y;
    const rx = r.x + r.width;
    const ry = r.y + r.height;
    if (rx > maxX) maxX = rx;
    if (ry > maxY) maxY = ry;
  }
  return { x, y, width: maxX - x, height: maxY - y };
}

function findBestLabel(fieldRect: PdfRect, labels: Label[], pageHeight: number): Label | null {
  const fieldTop = fieldRect.y + fieldRect.height;
  const fieldLeft = fieldRect.x;
  const fieldRight = fieldRect.x + fieldRect.width;

  let bestLabel: Label | null = null;
  let bestScore = Infinity;

  for (const label of labels) {
    const pdfLabel = labelToPdfCoords(label, pageHeight);

    // Label should be above the field: label bottom > field top
    // yDistance > 0 means label is above the field (correct position)
    const yDistance = pdfLabel.yBottom - fieldTop;

    if (yDistance < 0 || yDistance > LABEL_Y_MAX_DISTANCE) continue;

    // Check horizontal overlap or proximity
    const hasOverlap = pdfLabel.xMin < fieldRight && pdfLabel.xMax > fieldLeft;
    const isLeftOf =
      pdfLabel.xMax <= fieldLeft && fieldLeft - pdfLabel.xMax < 50;

    if (!hasOverlap && !isLeftOf) continue;

    // Score: prefer labels that are close vertically and overlap horizontally
    const score = yDistance + (hasOverlap ? 0 : 20);
    if (score < bestScore) {
      bestScore = score;
      bestLabel = label;
    }
  }

  return bestLabel;
}

function generateFieldName(
  labelText: string,
  _type: 'cell' | 'checkbox',
  page: number,
): string {
  if (!labelText) {
    return `p${page}_field`;
  }

  const cleaned = labelText.replace(/\s*:\s*$/, '').trim();

  const camel = cleaned
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9\s]/g, '')
    .trim()
    .split(/\s+/)
    .map((word, i) =>
      i === 0
        ? word.toLowerCase()
        : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase(),
    )
    .join('');

  if (!camel) {
    return `p${page}_field`;
  }

  return `p${page}_${camel}`;
}

function deduplicateName(baseName: string, used: Set<string>): string {
  if (!used.has(baseName)) return baseName;
  let counter = 2;
  while (used.has(`${baseName}_${counter}`)) counter++;
  return `${baseName}_${counter}`;
}
