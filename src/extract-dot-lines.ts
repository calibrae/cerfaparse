import type { Field, Label, PdfRect } from './types.js';
import { generateFieldName, deduplicateName } from './map-labels.js';

/** Minimum number of period characters for a label to be considered a dot line */
const MIN_DOT_COUNT = 10;

/** Max Y-gap (pdftotext coords, Y-down) between consecutive dot lines to group them */
const DOT_GROUP_Y_GAP = 20;

/** Max Y-distance (pdftotext coords) for a text label above a dot group */
const LABEL_Y_MAX_DISTANCE = 30;

export interface DotLineResult {
  fields: Field[];
  consumedLabelIndices: Set<number>;
}

/**
 * Returns true if the label text consists only of dots (periods) and whitespace,
 * with at least MIN_DOT_COUNT periods. Excludes short dot sequences like "..." or
 * labels mixing text with dots.
 */
export function isDotLine(text: string): boolean {
  if (!/^[.\s\u2026]+$/.test(text)) return false;
  const dotCount = (text.match(/\./g) ?? []).length;
  return dotCount >= MIN_DOT_COUNT;
}

/**
 * Detect free-text dot-line fields from pdftotext labels.
 *
 * Labels are in pdftotext coords (top-left origin, Y-down).
 * Output PdfRects are in PDF coords (bottom-left origin, Y-up).
 */
export function extractDotLineFields(
  labels: Label[],
  page: number,
  pageHeight: number,
  usedNames?: Set<string>,
): DotLineResult {
  const names = usedNames ?? new Set<string>();
  const consumed = new Set<number>();
  const fields: Field[] = [];

  // 1. Identify dot-line label indices
  const dotIndices: number[] = [];
  for (let i = 0; i < labels.length; i++) {
    if (isDotLine(labels[i].text)) {
      dotIndices.push(i);
    }
  }

  if (dotIndices.length === 0) return { fields: [], consumedLabelIndices: consumed };

  // 2. Group consecutive dot lines by Y-proximity
  const groups: number[][] = [[dotIndices[0]]];
  for (let i = 1; i < dotIndices.length; i++) {
    const prevIdx = dotIndices[i - 1];
    const currIdx = dotIndices[i];
    const prevLabel = labels[prevIdx];
    const currLabel = labels[currIdx];

    if (Math.abs(currLabel.yMin - prevLabel.yMin) <= DOT_GROUP_Y_GAP) {
      groups[groups.length - 1].push(currIdx);
    } else {
      groups.push([currIdx]);
    }
  }

  // 3. For each group, compute bounding rect and find text label
  for (const group of groups) {
    // Mark consumed
    for (const idx of group) consumed.add(idx);

    // Compute bounding box in pdftotext coords (Y-down)
    let xMin = Infinity, yMin = Infinity, xMax = -Infinity, yMax = -Infinity;
    for (const idx of group) {
      const lbl = labels[idx];
      if (lbl.xMin < xMin) xMin = lbl.xMin;
      if (lbl.yMin < yMin) yMin = lbl.yMin;
      if (lbl.xMax > xMax) xMax = lbl.xMax;
      if (lbl.yMax > yMax) yMax = lbl.yMax;
    }

    // Convert to PDF coords (bottom-left, Y-up)
    const pdfRect: PdfRect = {
      x: xMin,
      y: pageHeight - yMax,
      width: xMax - xMin,
      height: yMax - yMin,
    };

    // Find best text label above the dot group (in pdftotext coords, "above" = smaller Y)
    const groupTopY = yMin; // top of group in pdftotext Y-down coords
    const bestLabel = findTextLabelAbove(labels, groupTopY, xMin, xMax, consumed);

    const labelText = bestLabel?.text ?? '';
    const isMultiline = group.length > 1;

    const baseName = generateFieldName(labelText, 'cell', page);
    const name = deduplicateName(baseName, names);
    names.add(name);

    fields.push({
      key: name,
      type: 'input',
      props: {
        label: labelText,
        page,
        pdfRect,
        ...(isMultiline ? { multiline: true } : {}),
      },
    });
  }

  return { fields, consumedLabelIndices: consumed };
}

/**
 * Find the closest text label above a dot group in pdftotext coords (Y-down).
 * "Above" means smaller Y value. Skips consumed (dot-line) labels.
 */
function findTextLabelAbove(
  labels: Label[],
  groupTopY: number,
  groupXMin: number,
  groupXMax: number,
  consumed: Set<number>,
): Label | null {
  let best: Label | null = null;
  let bestDistance = Infinity;

  for (let i = 0; i < labels.length; i++) {
    if (consumed.has(i)) continue;
    const lbl = labels[i];

    // Label must be above (smaller yMax in Y-down coords)
    const yDistance = groupTopY - lbl.yMax;
    if (yDistance < 0 || yDistance > LABEL_Y_MAX_DISTANCE) continue;

    // Check horizontal overlap or proximity
    const hasOverlap = lbl.xMin < groupXMax && lbl.xMax > groupXMin;
    const isLeftOf = lbl.xMax <= groupXMin && groupXMin - lbl.xMax < 50;
    if (!hasOverlap && !isLeftOf) continue;

    const score = yDistance + (hasOverlap ? 0 : 20);
    if (score < bestDistance) {
      bestDistance = score;
      best = lbl;
    }
  }

  return best;
}
