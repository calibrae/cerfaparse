import { describe, it, expect } from 'vitest';
import { groupBoxesIntoFields } from '../src/group-rows.js';
import type { SvgBox } from '../src/types.js';

function makeBox(x: number, y: number, type: 'cell' | 'checkbox' = 'cell'): SvgBox {
  return { x, y, width: 8.92, height: 10.91, type };
}

describe('groupBoxesIntoFields', () => {
  it('groups boxes at same Y into one row', () => {
    const boxes = [
      makeBox(10, 100),
      makeBox(21, 100),
      makeBox(32, 100),
    ];
    const fields = groupBoxesIntoFields(boxes, 1);
    expect(fields).toHaveLength(1);
    expect(fields[0].boxCount).toBe(3);
  });

  it('handles Y tolerance — boxes within 2 units group together', () => {
    const boxes = [
      makeBox(10, 100),
      makeBox(21, 101.5), // within tolerance
      makeBox(32, 100.8),
    ];
    const fields = groupBoxesIntoFields(boxes, 1);
    expect(fields).toHaveLength(1);
    expect(fields[0].boxCount).toBe(3);
  });

  it('splits into separate rows by Y', () => {
    const boxes = [
      makeBox(10, 100),
      makeBox(21, 100),
      makeBox(10, 120), // different row
      makeBox(21, 120),
    ];
    const fields = groupBoxesIntoFields(boxes, 1);
    expect(fields).toHaveLength(2);
    expect(fields[0].boxCount).toBe(2);
    expect(fields[1].boxCount).toBe(2);
  });

  it('splits fields within a row by X-gap > 15', () => {
    const boxes = [
      makeBox(10, 100),
      makeBox(21, 100),     // gap ~2.08 → same field
      makeBox(60, 100),     // gap ~29 → new field
      makeBox(71, 100),
    ];
    const fields = groupBoxesIntoFields(boxes, 1);
    expect(fields).toHaveLength(2);
    expect(fields[0].boxCount).toBe(2);
    expect(fields[1].boxCount).toBe(2);
  });

  it('does NOT split on date separator gap (~13.89)', () => {
    const boxes = [
      makeBox(10, 100),
      makeBox(21, 100),     // gap ~2.08
      makeBox(32.89, 100),  // gap ~2 (normal)
      makeBox(46.78, 100),  // gap ~4.97 → still same field (< 15)
    ];
    const fields = groupBoxesIntoFields(boxes, 1);
    expect(fields).toHaveLength(1);
    expect(fields[0].boxCount).toBe(4);
  });

  it('keeps cells and checkboxes in separate rows', () => {
    const boxes = [
      makeBox(10, 100, 'cell'),
      makeBox(10, 100, 'checkbox'),
    ];
    const fields = groupBoxesIntoFields(boxes, 1);
    expect(fields).toHaveLength(2);
  });

  it('sorts fields top-to-bottom then left-to-right', () => {
    const boxes = [
      makeBox(50, 200),
      makeBox(10, 100),
      makeBox(50, 100),
    ];
    const fields = groupBoxesIntoFields(boxes, 1);
    // y=100 fields first (two separate fields due to gap > 15)
    expect(fields[0].boxes[0].x).toBe(10);
    expect(fields[1].boxes[0].x).toBe(50);
    // y=200 field last
    expect(fields[2].boxes[0].y).toBe(200);
  });
});
