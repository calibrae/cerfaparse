import { describe, it, expect } from 'vitest';
import { extractLabels } from '../src/extract-labels.js';

function makeBboxHtml(words: { text: string; xMin: number; yMin: number; xMax: number; yMax: number }[]): string {
  const wordTags = words
    .map((w) => `<word xMin="${w.xMin}" yMin="${w.yMin}" xMax="${w.xMax}" yMax="${w.yMax}">${w.text}</word>`)
    .join('\n');
  return `<html><body><doc><page width="400" height="600">${wordTags}</page></doc></body></html>`;
}

describe('extractLabels', () => {
  it('extracts a single word as a label', () => {
    const html = makeBboxHtml([
      { text: 'Nom', xMin: 10, yMin: 50, xMax: 30, yMax: 60 },
    ]);
    const result = extractLabels(html);
    expect(result.get(1)).toHaveLength(1);
    expect(result.get(1)![0].text).toBe('Nom');
    expect(result.get(1)![0].page).toBe(1);
  });

  it('joins adjacent words on the same line', () => {
    const html = makeBboxHtml([
      { text: 'Date', xMin: 10, yMin: 50, xMax: 30, yMax: 60 },
      { text: 'de', xMin: 32, yMin: 50, xMax: 40, yMax: 60 },
      { text: 'naissance', xMin: 42, yMin: 50, xMax: 80, yMax: 60 },
      { text: ':', xMin: 81, yMin: 50, xMax: 83, yMax: 60 },
    ]);
    const result = extractLabels(html);
    expect(result.get(1)).toHaveLength(1);
    expect(result.get(1)![0].text).toBe('Date de naissance :');
  });

  it('splits words with large X-gap into separate labels', () => {
    const html = makeBboxHtml([
      { text: 'Nom', xMin: 10, yMin: 50, xMax: 30, yMax: 60 },
      { text: 'Prénom', xMin: 100, yMin: 50, xMax: 140, yMax: 60 },
    ]);
    const result = extractLabels(html);
    expect(result.get(1)).toHaveLength(2);
    expect(result.get(1)![0].text).toBe('Nom');
    expect(result.get(1)![1].text).toBe('Prénom');
  });

  it('groups words by Y-proximity into different lines', () => {
    const html = makeBboxHtml([
      { text: 'Nom', xMin: 10, yMin: 50, xMax: 30, yMax: 60 },
      { text: 'Adresse', xMin: 10, yMin: 80, xMax: 50, yMax: 90 },
    ]);
    const result = extractLabels(html);
    expect(result.get(1)).toHaveLength(2);
  });

  it('computes correct bounding box spanning all joined words', () => {
    const html = makeBboxHtml([
      { text: 'Date', xMin: 10, yMin: 50, xMax: 30, yMax: 60 },
      { text: 'naissance', xMin: 32, yMin: 48, xMax: 80, yMax: 62 },
    ]);
    const result = extractLabels(html);
    const label = result.get(1)![0];
    expect(label.xMin).toBe(10);
    expect(label.yMin).toBe(48);
    expect(label.xMax).toBe(80);
    expect(label.yMax).toBe(62);
  });

  it('handles multiple pages', () => {
    const html = `<html><body><doc>
      <page width="400" height="600">
        <word xMin="10" yMin="50" xMax="30" yMax="60">Page1</word>
      </page>
      <page width="400" height="600">
        <word xMin="10" yMin="50" xMax="30" yMax="60">Page2</word>
      </page>
    </doc></body></html>`;
    const result = extractLabels(html);
    expect(result.get(1)![0].text).toBe('Page1');
    expect(result.get(1)![0].page).toBe(1);
    expect(result.get(2)![0].text).toBe('Page2');
    expect(result.get(2)![0].page).toBe(2);
  });

  it('returns empty array for page with no words', () => {
    const html = `<html><body><doc><page width="400" height="600"></page></doc></body></html>`;
    const result = extractLabels(html);
    expect(result.get(1)).toEqual([]);
  });
});
