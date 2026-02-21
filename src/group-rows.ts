import type { BoxRow, SvgBox } from './types.js';

/** Tolerance for grouping boxes into the same Y-row (SVG units) */
const Y_TOLERANCE = 2;

/** X-gap threshold: gaps larger than this split into separate fields.
 * Typical inter-cell gap within a field is ~3 SVG units; cross-field gaps are ≥15. */
const FIELD_GAP_THRESHOLD = 10;

export interface FieldGroup {
  boxes: SvgBox[];
  row: BoxRow;
  /** Number of character cells (= maxLength for comb fields) */
  boxCount: number;
}

/**
 * Group boxes by Y-proximity into rows, then split each row
 * into fields by X-gap. Returns FieldGroups sorted top-to-bottom,
 * left-to-right.
 */
export function groupBoxesIntoFields(
  boxes: SvgBox[],
  page: number,
): FieldGroup[] {
  const rows = groupByY(boxes, page);
  const fields: FieldGroup[] = [];

  for (const row of rows) {
    const sorted = [...row.boxes].sort((a, b) => a.x - b.x);
    const splits = splitByXGap(sorted, row);
    fields.push(...splits);
  }

  // Sort by Y (top-to-bottom in SVG = ascending Y), then X
  fields.sort((a, b) => {
    const yDiff = a.boxes[0].y - b.boxes[0].y;
    if (Math.abs(yDiff) > Y_TOLERANCE) return yDiff;
    return a.boxes[0].x - b.boxes[0].x;
  });

  return fields;
}

function groupByY(boxes: SvgBox[], page: number): BoxRow[] {
  const sorted = [...boxes].sort((a, b) => a.y - b.y);
  const rows: BoxRow[] = [];

  for (const box of sorted) {
    const existingRow = rows.find(
      (r) => Math.abs(r.y - box.y) <= Y_TOLERANCE && r.type === box.type,
    );
    if (existingRow) {
      existingRow.boxes.push(box);
      // Update row Y to running average for stable clustering
      const avg =
        existingRow.boxes.reduce((sum, b) => sum + b.y, 0) /
        existingRow.boxes.length;
      existingRow.y = avg;
    } else {
      rows.push({ boxes: [box], y: box.y, type: box.type, page });
    }
  }

  return rows;
}

function splitByXGap(
  sortedBoxes: SvgBox[],
  row: BoxRow,
): FieldGroup[] {
  if (sortedBoxes.length === 0) return [];

  const groups: SvgBox[][] = [[sortedBoxes[0]]];

  for (let i = 1; i < sortedBoxes.length; i++) {
    const prev = sortedBoxes[i - 1];
    const curr = sortedBoxes[i];
    const gap = curr.x - (prev.x + prev.width);

    if (gap > FIELD_GAP_THRESHOLD) {
      groups.push([curr]);
    } else {
      groups[groups.length - 1].push(curr);
    }
  }

  return groups.map((boxes) => ({
    boxes,
    row: { ...row, boxes },
    boxCount: boxes.length,
  }));
}
