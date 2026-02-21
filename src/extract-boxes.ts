import * as cheerio from 'cheerio';
import type { SvgBox, TransformMatrix } from './types.js';

const WHITE_THRESHOLD = 0.95; // RGB components above 95% → white
const DARK_STROKE_THRESHOLD = 0.2; // RGB components below 20% → dark

/** Size thresholds to filter out large background rects and thin slivers */
const MAX_BOX_WIDTH = 50;
const MAX_BOX_HEIGHT = 50;
const MIN_BOX_SIZE = 3;

export interface ExtractResult {
  boxes: SvgBox[];
  transform: TransformMatrix | null;
  pageHeight: number;
}

export function extractBoxes(svgXml: string): ExtractResult {
  const $ = cheerio.load(svgXml, { xml: true });

  // Extract page height from SVG viewBox or height attribute
  let pageHeight = 0;
  const viewBox = $('svg').attr('viewBox') ?? '';
  const vbParts = viewBox.split(/\s+/);
  if (vbParts.length >= 4) {
    pageHeight = parseFloat(vbParts[3]);
  }
  if (!Number.isFinite(pageHeight) || pageHeight <= 0) {
    // Fallback: parse height attribute (e.g. "572pt" → 572)
    const heightAttr = $('svg').attr('height') ?? '';
    pageHeight = parseFloat(heightAttr);
  }
  if (!Number.isFinite(pageHeight) || pageHeight <= 0) {
    throw new Error('Could not extract page height from SVG viewBox or height attribute');
  }

  let transform: TransformMatrix | null = null;
  const boxes: SvgBox[] = [];

  $('path').each((_, el) => {
    const path = $(el);
    const d = path.attr('d');
    const fill = path.attr('fill') ?? '';
    const stroke = path.attr('stroke') ?? '';
    const strokeWidth = parseFloat(path.attr('stroke-width') ?? '0');

    if (!d || !isWhiteColor(fill)) return;

    const rect = parseRectPath(d);
    if (!rect) return;
    if (rect.width > MAX_BOX_WIDTH || rect.height > MAX_BOX_HEIGHT) return;
    if (rect.width < MIN_BOX_SIZE || rect.height < MIN_BOX_SIZE) return;

    const type = classifyBox(stroke, strokeWidth);
    if (!type) return;

    // Extract and validate transform from each matching element
    const pathTransform = parseTransformFromAttr(path.attr('transform') ?? '');
    if (!pathTransform) return;

    // Compose with ancestor transforms (<g> parents, or <use> for paths in <defs>)
    const ancestorTransform = collectAncestorTransform($, el);
    const effectiveTransform = ancestorTransform
      ? composeTransforms(ancestorTransform, pathTransform)
      : pathTransform;

    if (!transform) {
      transform = effectiveTransform;
    } else if (!matricesEqual(transform, effectiveTransform)) {
      console.warn(
        'Warning: found input box with different transform matrix — skipping. ' +
          'This may indicate rotated sections.',
      );
      return;
    }

    boxes.push({ ...rect, type });
  });

  return { boxes, transform, pageHeight };
}

/**
 * Collect the composed ancestor transform for a path element.
 *
 * Walks up from the path to <svg>, collecting <g> transforms along the way.
 * If the path is inside <defs> (rendered indirectly via <use>), finds the
 * root <use> element's transform instead — in pdftocairo output, intermediate
 * group transforms within the <defs>/<use> chain cancel out, leaving only
 * the outermost <use> transform as the net effect.
 */
function collectAncestorTransform(
  $: cheerio.CheerioAPI,
  el: any,
): TransformMatrix | null {
  const transforms: TransformMatrix[] = [];
  let insideDefs = false;
  let current = (el as any).parent;

  while (current) {
    const tag = current.tagName ?? current.name ?? '';
    if (tag === 'svg') break;

    if (tag === 'defs') {
      insideDefs = true;
      break;
    }

    if (tag === 'g') {
      const t = $(current).attr('transform') ?? '';
      const parsed = parseTransformAttr(t);
      if (parsed) transforms.unshift(parsed); // outermost first
    }

    current = current.parent;
  }

  if (insideDefs) {
    // Path lives in <defs> — rendered via <use> reference chain.
    // Find the outermost <use> (direct child of <svg>) with a transform.
    // Intermediate transforms within the defs/use chain cancel in pdftocairo output.
    const svgChildren = $('svg').children().toArray();
    for (const child of svgChildren) {
      const tag = (child as any).tagName ?? '';
      if (tag !== 'use') continue;
      const t = $(child).attr('transform') ?? '';
      const parsed = parseTransformAttr(t);
      if (parsed) return parsed;
    }
    return null;
  }

  if (transforms.length === 0) return null;
  return transforms.reduce(composeTransforms);
}

/**
 * Parse a transform attribute — supports both matrix() and translate() syntax.
 */
function parseTransformAttr(attr: string): TransformMatrix | null {
  // Try matrix() first
  const matrixMatch = attr.match(MATRIX_RE);
  if (matrixMatch) {
    const m: TransformMatrix = {
      a: parseFloat(matrixMatch[1]),
      b: parseFloat(matrixMatch[2]),
      c: parseFloat(matrixMatch[3]),
      d: parseFloat(matrixMatch[4]),
      e: parseFloat(matrixMatch[5]),
      f: parseFloat(matrixMatch[6]),
    };
    if (Object.values(m).some((v) => !Number.isFinite(v))) return null;
    return m;
  }

  // Try translate()
  const translateMatch = attr.match(
    /translate\(\s*([-\d.]+)(?:\s*,\s*([-\d.]+))?\s*\)/,
  );
  if (translateMatch) {
    const tx = parseFloat(translateMatch[1]);
    const ty = parseFloat(translateMatch[2] ?? '0');
    if (!Number.isFinite(tx) || !Number.isFinite(ty)) return null;
    return { a: 1, b: 0, c: 0, d: 1, e: tx, f: ty };
  }

  return null;
}

/**
 * Compose two 2D affine transforms: result = m1 * m2
 * Applies m2 first, then m1 (standard matrix multiplication order).
 */
function composeTransforms(
  m1: TransformMatrix,
  m2: TransformMatrix,
): TransformMatrix {
  return {
    a: m1.a * m2.a + m1.c * m2.b,
    b: m1.b * m2.a + m1.d * m2.b,
    c: m1.a * m2.c + m1.c * m2.d,
    d: m1.b * m2.c + m1.d * m2.d,
    e: m1.a * m2.e + m1.c * m2.f + m1.e,
    f: m1.b * m2.e + m1.d * m2.f + m1.f,
  };
}

const MATRIX_RE =
  /matrix\(\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\)/;

function parseTransformFromAttr(attr: string): TransformMatrix | null {
  return parseTransformAttr(attr);
}

function matricesEqual(a: TransformMatrix, b: TransformMatrix): boolean {
  const tol = 0.001;
  return (
    Math.abs(a.a - b.a) < tol &&
    Math.abs(a.b - b.b) < tol &&
    Math.abs(a.c - b.c) < tol &&
    Math.abs(a.d - b.d) < tol &&
    Math.abs(a.e - b.e) < tol &&
    Math.abs(a.f - b.f) < tol
  );
}

/**
 * Parse a rectangular path from 4 corner points, regardless of winding order.
 * Computes bounding box from all points.
 */
function parseRectPath(
  d: string,
): { x: number; y: number; width: number; height: number } | null {
  const commands = d.trim().split(/\s*([MLHVCSQTAZ])\s*/i).filter(Boolean);

  const points: [number, number][] = [];
  let i = 0;
  while (i < commands.length) {
    const cmd = commands[i];
    if (cmd === 'M' || cmd === 'L') {
      const coords = commands[i + 1]?.trim().split(/\s+/);
      if (coords && coords.length >= 2) {
        const x = parseFloat(coords[0]);
        const y = parseFloat(coords[1]);
        if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
        points.push([x, y]);
      }
      i += 2;
    } else if (cmd === 'Z') {
      i += 1;
    } else {
      return null;
    }
  }

  if (points.length < 4) return null;

  // Use first 4 points to compute bounding box (handles any winding order)
  const xs = points.slice(0, 4).map((p) => p[0]);
  const ys = points.slice(0, 4).map((p) => p[1]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  const width = maxX - minX;
  const height = maxY - minY;

  if (width < 1 || height < 1) return null;

  return { x: minX, y: minY, width, height };
}

/** Parse an rgb(r%, g%, b%) color string and return [0-1] components, or null */
function parseRgbPercent(color: string): [number, number, number] | null {
  const match = color.match(
    /rgb\(\s*([\d.]+)%\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%\s*\)/,
  );
  if (!match) return null;
  return [
    parseFloat(match[1]) / 100,
    parseFloat(match[2]) / 100,
    parseFloat(match[3]) / 100,
  ];
}

function isWhiteColor(color: string): boolean {
  const rgb = parseRgbPercent(color);
  if (!rgb) return false;
  return rgb[0] >= WHITE_THRESHOLD && rgb[1] >= WHITE_THRESHOLD && rgb[2] >= WHITE_THRESHOLD;
}

function isDarkColor(color: string): boolean {
  const rgb = parseRgbPercent(color);
  if (!rgb) return false;
  return rgb[0] < DARK_STROKE_THRESHOLD && rgb[1] < DARK_STROKE_THRESHOLD && rgb[2] < DARK_STROKE_THRESHOLD;
}

function classifyBox(
  stroke: string,
  strokeWidth: number,
): 'cell' | 'checkbox' | null {
  if (isWhiteColor(stroke) && strokeWidth >= 0.9) {
    return 'cell';
  }

  if (isDarkColor(stroke)) {
    return 'checkbox';
  }

  return null;
}
