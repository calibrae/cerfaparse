import { describe, it, expect } from 'vitest';
import { isDotLine, extractDotLineFields } from '../src/extract-dot-lines.js';
import type { Label } from '../src/types.js';

const PAGE = 1;
const PAGE_HEIGHT = 842; // typical A4

function makeLabel(text: string, yMin: number, xMin = 50, xMax = 500): Label {
  return { text, xMin, yMin, xMax, yMax: yMin + 10, page: PAGE };
}

describe('isDotLine', () => {
  it('returns true for long dot sequences', () => {
    expect(isDotLine('...................................................')).toBe(true);
  });

  it('returns true for dots with spaces', () => {
    expect(isDotLine('. . . . . . . . . . . . . . . . . . . . . . . . .')).toBe(true);
  });

  it('returns false for short dot sequences', () => {
    expect(isDotLine('...')).toBe(false);
    expect(isDotLine('.....')).toBe(false);
  });

  it('returns false for mixed text/dot labels', () => {
    expect(isDotLine('Autre pathologie (préciser):')).toBe(false);
    expect(isDotLine('escalier...)')).toBe(false);
    expect(isDotLine('hello...world')).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(isDotLine('')).toBe(false);
  });
});

describe('extractDotLineFields', () => {
  it('detects a single dot-line and creates a field', () => {
    const labels: Label[] = [
      makeLabel('Précisez :', 100),
      makeLabel('...................................................', 115),
    ];
    const { fields, consumedLabelIndices } = extractDotLineFields(labels, PAGE, PAGE_HEIGHT);

    expect(fields).toHaveLength(1);
    expect(fields[0].type).toBe('input');
    expect(fields[0].props.label).toBe('Précisez :');
    expect(fields[0].props.maxLength).toBeUndefined();
    expect(fields[0].props.multiline).toBeUndefined();
    expect(consumedLabelIndices.has(1)).toBe(true);
    expect(consumedLabelIndices.has(0)).toBe(false);
  });

  it('merges consecutive dot lines into one multiline field', () => {
    const labels: Label[] = [
      makeLabel('Informations :', 100),
      makeLabel('...................................................', 115),
      makeLabel('...................................................', 130),
      makeLabel('...................................................', 145),
    ];
    const { fields, consumedLabelIndices } = extractDotLineFields(labels, PAGE, PAGE_HEIGHT);

    expect(fields).toHaveLength(1);
    expect(fields[0].props.multiline).toBe(true);
    expect(fields[0].props.label).toBe('Informations :');
    expect(consumedLabelIndices.size).toBe(3); // 3 dot lines consumed
  });

  it('does NOT merge distant dot lines', () => {
    const labels: Label[] = [
      makeLabel('Label A :', 100),
      makeLabel('...................................................', 115),
      makeLabel('Label B :', 300),
      makeLabel('...................................................', 315),
    ];
    const { fields } = extractDotLineFields(labels, PAGE, PAGE_HEIGHT);

    expect(fields).toHaveLength(2);
    expect(fields[0].props.label).toBe('Label A :');
    expect(fields[1].props.label).toBe('Label B :');
  });

  it('ignores labels with fewer than 10 dots', () => {
    const labels: Label[] = [
      makeLabel('Short dots:', 100),
      makeLabel('.....', 115),
    ];
    const { fields, consumedLabelIndices } = extractDotLineFields(labels, PAGE, PAGE_HEIGHT);

    expect(fields).toHaveLength(0);
    expect(consumedLabelIndices.size).toBe(0);
  });

  it('ignores mixed text/dot labels', () => {
    const labels: Label[] = [
      makeLabel('Nom: ...................................................', 100),
    ];
    const { fields } = extractDotLineFields(labels, PAGE, PAGE_HEIGHT);
    expect(fields).toHaveLength(0);
  });

  it('finds correct text label above dot group', () => {
    const labels: Label[] = [
      makeLabel('Unrelated label', 50, 50, 200),
      makeLabel('Closest label :', 95),
      makeLabel('...................................................', 110),
    ];
    const { fields } = extractDotLineFields(labels, PAGE, PAGE_HEIGHT);

    expect(fields).toHaveLength(1);
    expect(fields[0].props.label).toBe('Closest label :');
  });

  it('returns correct consumedLabelIndices', () => {
    const labels: Label[] = [
      makeLabel('Text label', 100),
      makeLabel('...................................................', 115),
      makeLabel('...................................................', 130),
      makeLabel('Other text', 200),
    ];
    const { consumedLabelIndices } = extractDotLineFields(labels, PAGE, PAGE_HEIGHT);

    expect(consumedLabelIndices.has(0)).toBe(false); // text label
    expect(consumedLabelIndices.has(1)).toBe(true);  // dot line
    expect(consumedLabelIndices.has(2)).toBe(true);  // dot line
    expect(consumedLabelIndices.has(3)).toBe(false); // other text
  });

  it('handles pages with no dot lines', () => {
    const labels: Label[] = [
      makeLabel('Regular label', 100),
      makeLabel('Another label', 200),
    ];
    const { fields, consumedLabelIndices } = extractDotLineFields(labels, PAGE, PAGE_HEIGHT);

    expect(fields).toHaveLength(0);
    expect(consumedLabelIndices.size).toBe(0);
  });

  it('produces fields with positive pdfRect dimensions', () => {
    const labels: Label[] = [
      makeLabel('...................................................', 400),
      makeLabel('...................................................', 415),
    ];
    const { fields } = extractDotLineFields(labels, PAGE, PAGE_HEIGHT);

    expect(fields).toHaveLength(1);
    expect(fields[0].props.pdfRect.width).toBeGreaterThan(0);
    expect(fields[0].props.pdfRect.height).toBeGreaterThan(0);
  });

  it('converts coords to PDF bottom-left Y-up', () => {
    const labels: Label[] = [
      makeLabel('...................................................', 400, 50, 500),
    ];
    const { fields } = extractDotLineFields(labels, PAGE, PAGE_HEIGHT);

    // In pdftotext coords: yMin=400, yMax=410
    // In PDF coords: y = pageHeight - yMax = 842 - 410 = 432
    expect(fields[0].props.pdfRect.y).toBe(PAGE_HEIGHT - 410);
    expect(fields[0].props.pdfRect.x).toBe(50);
  });
});
