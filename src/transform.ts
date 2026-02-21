import type { PdfRect, SvgBox, TransformMatrix } from './types.js';

/**
 * Apply SVG affine transform matrix to a point.
 * Output is in SVG viewport coordinates (origin top-left, Y increases downward).
 */
export function svgPointToViewport(
  svgX: number,
  svgY: number,
  matrix: TransformMatrix,
): { x: number; y: number } {
  return {
    x: matrix.a * svgX + matrix.c * svgY + matrix.e,
    y: matrix.b * svgX + matrix.d * svgY + matrix.f,
  };
}

/**
 * Transform an SVG box to a PDF rect.
 *
 * The SVG matrix converts content coords → SVG viewport coords (top-left origin, Y-down).
 * PDF uses bottom-left origin with Y-up. So after applying the matrix, we flip Y
 * using the page height: pdf_y = pageHeight - viewport_y.
 *
 * Returns (x, y) as the bottom-left corner with positive width/height (PDF convention).
 */
export function svgBoxToPdfRect(
  box: SvgBox,
  matrix: TransformMatrix,
  pageHeight: number,
): PdfRect {
  const corner1 = svgPointToViewport(box.x, box.y, matrix);
  const corner2 = svgPointToViewport(
    box.x + box.width,
    box.y + box.height,
    matrix,
  );

  // In viewport coords, compute bounding box
  const vpLeft = Math.min(corner1.x, corner2.x);
  const vpTop = Math.min(corner1.y, corner2.y);
  const vpRight = Math.max(corner1.x, corner2.x);
  const vpBottom = Math.max(corner1.y, corner2.y);
  const width = vpRight - vpLeft;
  const height = vpBottom - vpTop;

  // Convert from viewport (top-left, Y-down) to PDF (bottom-left, Y-up)
  const pdfX = vpLeft;
  const pdfY = pageHeight - vpBottom; // bottom edge in PDF coords

  return { x: pdfX, y: pdfY, width, height };
}

// Keep backward-compatible alias
export const svgPointToPdf = svgPointToViewport;
