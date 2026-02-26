export interface TransformMatrix {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}

export type BoxType = 'cell' | 'checkbox';

/** Formly-compatible field types */
export type FieldType = 'input' | 'checkbox';

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

/** Formly-compatible field definition with spatial metadata */
export interface Field {
  key: string;
  type: FieldType;
  props: {
    label: string;
    maxLength?: number;
    multiline?: boolean;
    page: number;
    pdfRect: PdfRect;
  };
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
