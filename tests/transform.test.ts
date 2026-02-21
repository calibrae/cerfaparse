import { describe, it, expect } from 'vitest';
import { svgPointToPdf, svgBoxToPdfRect } from '../src/transform.js';
import type { TransformMatrix, SvgBox } from '../src/types.js';

// Page dimensions from sample CERFA
const PAGE_HEIGHT = 572.598;

// Page 1 matrix from sample CERFA
const PAGE1_MATRIX: TransformMatrix = {
  a: 0.999298,
  b: 0,
  c: 0,
  d: -0.999298,
  e: -10.935738,
  f: 561.196282,
};

// Page 2 matrix from sample CERFA
const PAGE2_MATRIX: TransformMatrix = {
  a: 0.999298,
  b: 0,
  c: 0,
  d: -0.999298,
  e: 0.0642618,
  f: 572.196282,
};

describe('svgPointToPdf (viewport transform)', () => {
  it('applies page 1 transform correctly', () => {
    // First box on page 1: SVG x=61.44, y=494.58
    // svgPointToPdf returns viewport coords (top-left origin, Y-down)
    const result = svgPointToPdf(61.443689, 494.57842, PAGE1_MATRIX);
    expect(result.x).toBeCloseTo(50.42, 1);
    expect(result.y).toBeCloseTo(66.97, 1);
  });

  it('flips Y axis (higher SVG y → lower viewport y due to negative d)', () => {
    const high = svgPointToPdf(100, 100, PAGE1_MATRIX);
    const low = svgPointToPdf(100, 200, PAGE1_MATRIX);
    // With negative d, higher SVG y produces lower viewport y
    expect(high.y).toBeGreaterThan(low.y);
  });

  it('handles page 2 transform (different tx)', () => {
    const result = svgPointToPdf(100, 100, PAGE2_MATRIX);
    const resultP1 = svgPointToPdf(100, 100, PAGE1_MATRIX);
    // Page 2 tx is ~+0.06 vs page 1 tx ~-10.94 → ~11pt difference
    expect(result.x - resultP1.x).toBeCloseTo(11, 0);
  });
});

describe('svgBoxToPdfRect', () => {
  it('converts a character cell box to PDF rect', () => {
    const box: SvgBox = {
      x: 61.443689,
      y: 494.57842,
      width: 8.92423,
      height: 10.90609,
      type: 'cell',
    };
    const rect = svgBoxToPdfRect(box, PAGE1_MATRIX, PAGE_HEIGHT);

    expect(rect.width).toBeCloseTo(8.92, 1);
    expect(rect.height).toBeCloseTo(10.90, 1);
    expect(rect.x).toBeGreaterThan(0);
    expect(rect.y).toBeGreaterThan(0);
    expect(rect.width).toBeGreaterThan(0);
    expect(rect.height).toBeGreaterThan(0);
  });

  it('produces correct PDF Y coordinate (bottom-left origin)', () => {
    const box: SvgBox = {
      x: 61.443689,
      y: 494.57842,
      width: 8.92423,
      height: 10.90609,
      type: 'cell',
    };
    const rect = svgBoxToPdfRect(box, PAGE1_MATRIX, PAGE_HEIGHT);

    // With negative d, SVG top-left (61.44, 494.58) → viewport (50.42, 66.97)
    // SVG bottom-right (70.37, 505.48) → viewport (59.34, 56.07)
    // vpBottom = max(66.97, 56.07) = 66.97
    // PDF Y = pageHeight - vpBottom = 572.598 - 66.97 ≈ 505.63
    expect(rect.y).toBeCloseTo(505.63, 0);
  });

  it('normalizes rect so x,y is bottom-left with positive dimensions', () => {
    const box: SvgBox = {
      x: 100,
      y: 200,
      width: 10,
      height: 20,
      type: 'cell',
    };
    const rect = svgBoxToPdfRect(box, PAGE1_MATRIX, PAGE_HEIGHT);
    expect(rect.width).toBeGreaterThan(0);
    expect(rect.height).toBeGreaterThan(0);
    expect(rect.x).toBeLessThan(rect.x + rect.width);
    expect(rect.y).toBeLessThan(rect.y + rect.height);
  });
});
