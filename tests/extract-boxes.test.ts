import { describe, it, expect } from 'vitest';
import { extractBoxes } from '../src/extract-boxes.js';

const CELL_PATH = `<path fill-rule="nonzero" fill="rgb(100%, 100%, 100%)" fill-opacity="1" stroke-width="1" stroke-linecap="butt" stroke-linejoin="miter" stroke="rgb(100%, 100%, 100%)" stroke-opacity="1" stroke-miterlimit="4" d="M 61.443689 494.57842 L 70.367919 494.57842 L 70.367919 505.484509 L 61.443689 505.484509 Z M 61.443689 494.57842 " transform="matrix(0.999298, 0, 0, -0.999298, -10.935738, 561.196282)"/>`;

const CHECKBOX_PATH = `<path fill-rule="nonzero" fill="rgb(100%, 100%, 100%)" fill-opacity="1" stroke-width="0.5" stroke-linecap="butt" stroke-linejoin="miter" stroke="rgb(13.729858%, 12.159729%, 12.548828%)" stroke-opacity="1" stroke-miterlimit="4" d="M 233.963161 469.306784 L 241.964869 469.306784 L 241.964869 477.3124 L 233.963161 477.3124 Z M 233.963161 469.306784 " transform="matrix(0.999298, 0, 0, -0.999298, -10.935738, 561.196282)"/>`;

const BACKGROUND_PATH = `<path fill-rule="nonzero" fill="rgb(100%, 100%, 100%)" fill-opacity="1" stroke-width="1" stroke="rgb(100%, 100%, 100%)" d="M 10 10 L 200 10 L 200 50 L 10 50 Z M 10 10 " transform="matrix(0.999298, 0, 0, -0.999298, -10.935738, 561.196282)"/>`;

function makeSvg(...paths: string[]): string {
  return `<?xml version="1.0"?>
<svg xmlns="http://www.w3.org/2000/svg" width="396pt" height="572pt">
${paths.join('\n')}
</svg>`;
}

describe('extractBoxes', () => {
  it('extracts a character cell', () => {
    const { boxes } = extractBoxes(makeSvg(CELL_PATH));
    expect(boxes).toHaveLength(1);
    expect(boxes[0].type).toBe('cell');
    expect(boxes[0].width).toBeCloseTo(8.92, 1);
    expect(boxes[0].height).toBeCloseTo(10.91, 1);
  });

  it('extracts a checkbox', () => {
    const { boxes } = extractBoxes(makeSvg(CHECKBOX_PATH));
    expect(boxes).toHaveLength(1);
    expect(boxes[0].type).toBe('checkbox');
    expect(boxes[0].width).toBeCloseTo(8.0, 0);
  });

  it('filters out large background rects', () => {
    const { boxes } = extractBoxes(makeSvg(CELL_PATH, BACKGROUND_PATH));
    expect(boxes).toHaveLength(1); // only the cell, not the background
  });

  it('extracts transform matrix from path attributes', () => {
    const { transform } = extractBoxes(makeSvg(CELL_PATH));
    expect(transform.a).toBeCloseTo(0.999298);
    expect(transform.d).toBeCloseTo(-0.999298);
    expect(transform.e).toBeCloseTo(-10.935738);
    expect(transform.f).toBeCloseTo(561.196282);
  });

  it('handles mixed cells and checkboxes', () => {
    const { boxes } = extractBoxes(makeSvg(CELL_PATH, CHECKBOX_PATH));
    expect(boxes).toHaveLength(2);
    const types = boxes.map((b) => b.type);
    expect(types).toContain('cell');
    expect(types).toContain('checkbox');
  });

  it('extracts page height from SVG height attribute', () => {
    const { pageHeight } = extractBoxes(makeSvg(CELL_PATH));
    expect(pageHeight).toBeCloseTo(572, 0);
  });
});
