export interface TransformMatrix {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}

export type BoxType = 'cell' | 'checkbox';

export interface SvgBox {
  x: number;
  y: number;
  width: number;
  height: number;
  type: BoxType;
}

export interface PdfRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface BoxRow {
  boxes: SvgBox[];
  y: number;
  type: BoxType;
  page: number;
}

export interface Label {
  text: string;
  xMin: number;
  yMin: number;
  xMax: number;
  yMax: number;
  page: number;
}

export interface Field {
  name: string;
  type: BoxType;
  label: string;
  page: number;
  pdfRect: PdfRect;
  maxLength?: number;
}

export interface PageData {
  pageNumber: number;
  boxes: SvgBox[];
  transform: TransformMatrix;
  labels: Label[];
  fields: Field[];
}

export interface FieldOutput {
  pages: {
    pageNumber: number;
    fields: Field[];
  }[];
}
