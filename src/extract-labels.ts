import * as cheerio from 'cheerio';
import type { Label } from './types.js';

/** Max X-gap between words on same line to be joined (PDF points) */
const WORD_JOIN_GAP = 10;
/** Y tolerance for considering words on the same line (PDF points) */
const LINE_Y_TOLERANCE = 2;

/**
 * Parse pdftotext -bbox-layout HTML output and extract labels per page.
 * Returns labels with bounding boxes in PDF coordinate space.
 */
export function extractLabels(bboxHtml: string): Map<number, Label[]> {
  const $ = cheerio.load(bboxHtml, { xml: false });
  const pageLabels = new Map<number, Label[]>();

  $('page').each((pageIdx, pageEl) => {
    const pageNum = pageIdx + 1;
    const words: {
      text: string;
      xMin: number;
      yMin: number;
      xMax: number;
      yMax: number;
    }[] = [];

    $(pageEl)
      .find('word')
      .each((_, wordEl) => {
        const $w = $(wordEl);
        words.push({
          text: $w.text().trim(),
          xMin: parseFloat($w.attr('xmin') ?? '0'),
          yMin: parseFloat($w.attr('ymin') ?? '0'),
          xMax: parseFloat($w.attr('xmax') ?? '0'),
          yMax: parseFloat($w.attr('ymax') ?? '0'),
        });
      });

    const labels = assembleLabels(words, pageNum);
    pageLabels.set(pageNum, labels);
  });

  return pageLabels;
}

interface Word {
  text: string;
  xMin: number;
  yMin: number;
  xMax: number;
  yMax: number;
}

function assembleLabels(words: Word[], page: number): Label[] {
  if (words.length === 0) return [];

  // Sort by Y then X
  const sorted = [...words].sort((a, b) => {
    const yDiff = a.yMin - b.yMin;
    if (Math.abs(yDiff) > LINE_Y_TOLERANCE) return yDiff;
    return a.xMin - b.xMin;
  });

  // Group words into lines by Y-proximity
  const lines: Word[][] = [[sorted[0]]];
  for (let i = 1; i < sorted.length; i++) {
    const prev = lines[lines.length - 1];
    const lastWord = prev[prev.length - 1];
    const curr = sorted[i];

    if (Math.abs(curr.yMin - lastWord.yMin) <= LINE_Y_TOLERANCE) {
      prev.push(curr);
    } else {
      lines.push([curr]);
    }
  }

  // Within each line, join adjacent words into label spans
  const labels: Label[] = [];
  for (const line of lines) {
    const sortedLine = line.sort((a, b) => a.xMin - b.xMin);
    let current: Word[] = [sortedLine[0]];

    for (let i = 1; i < sortedLine.length; i++) {
      const prev = current[current.length - 1];
      const curr = sortedLine[i];
      const gap = curr.xMin - prev.xMax;

      if (gap <= WORD_JOIN_GAP) {
        current.push(curr);
      } else {
        labels.push(wordsToLabel(current, page));
        current = [curr];
      }
    }
    labels.push(wordsToLabel(current, page));
  }

  return labels;
}

function wordsToLabel(words: Word[], page: number): Label {
  const text = words.map((w) => w.text).join(' ');
  let xMin = Infinity, yMin = Infinity, xMax = -Infinity, yMax = -Infinity;
  for (const w of words) {
    if (w.xMin < xMin) xMin = w.xMin;
    if (w.yMin < yMin) yMin = w.yMin;
    if (w.xMax > xMax) xMax = w.xMax;
    if (w.yMax > yMax) yMax = w.yMax;
  }
  return { text, xMin, yMin, xMax, yMax, page };
}
