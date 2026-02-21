import { PDFDocument, PDFName, StandardFonts } from 'pdf-lib';
import type { Field } from './types.js';

/**
 * Remove background color and border from a form field's widget annotations
 * so the field overlay is fully transparent against the printed form.
 */
function clearWidgetAppearance(acroField: { getWidgets(): { dict: any }[] }): void {
  for (const widget of acroField.getWidgets()) {
    const mk = widget.dict.lookup(PDFName.of('MK'));
    if (mk && typeof mk.delete === 'function') {
      mk.delete(PDFName.of('BG')); // background color
      mk.delete(PDFName.of('BC')); // border color
    }
  }
}

/**
 * Load the original PDF, inject AcroForm fields at computed positions,
 * and return the modified PDF bytes.
 */
export async function injectFields(
  pdfBytes: Uint8Array,
  fields: Field[],
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(pdfBytes);
  const form = pdfDoc.getForm();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

  const pages = pdfDoc.getPages();

  for (const field of fields) {
    const pageIndex = field.props.page - 1;
    if (pageIndex < 0 || pageIndex >= pages.length) continue;
    const page = pages[pageIndex];
    const { x, y, width, height } = field.props.pdfRect;

    if (field.type === 'input') {
      const textField = form.createTextField(field.key);
      textField.addToPage(page, { x, y, width, height, font, borderWidth: 0 });
      if (field.props.maxLength) {
        textField.setMaxLength(field.props.maxLength);
        textField.enableCombing();
      }
      textField.setFontSize(0); // auto-size
      clearWidgetAppearance(textField.acroField);
      textField.updateAppearances(font);
    } else {
      const checkbox = form.createCheckBox(field.key);
      checkbox.addToPage(page, { x, y, width, height, borderWidth: 0 });
      clearWidgetAppearance(checkbox.acroField);
      checkbox.updateAppearances();
    }
  }

  return pdfDoc.save();
}
