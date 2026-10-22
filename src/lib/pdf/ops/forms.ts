import {
  PDFDocument,
  PDFTextField,
  PDFCheckBox,
  PDFRadioGroup,
  PDFDropdown,
  PDFOptionList,
  PDFSignature,
} from '@cantoo/pdf-lib';
import type { DocInput } from '../../types';
import { loadPdf, savePdf } from './organize';

export type FormFieldInfo = {
  name: string;
  type: 'text' | 'checkbox' | 'radio' | 'dropdown' | 'list' | 'signature' | 'other';
  value: string;
  options?: string[];
  required: boolean;
  readOnly: boolean;
};

export async function listFormFields(file: DocInput): Promise<FormFieldInfo[]> {
  const doc = await loadPdf(file.bytes, file.password);
  let form;
  try {
    form = doc.getForm();
  } catch {
    return [];
  }
  return form.getFields().map((f) => {
    let type: FormFieldInfo['type'] = 'other';
    let value = '';
    let options: string[] | undefined;
    if (f instanceof PDFTextField) {
      type = 'text';
      value = f.getText() ?? '';
    } else if (f instanceof PDFCheckBox) {
      type = 'checkbox';
      value = f.isChecked() ? 'true' : 'false';
    } else if (f instanceof PDFRadioGroup) {
      type = 'radio';
      value = f.getSelected() ?? '';
      options = f.getOptions();
    } else if (f instanceof PDFDropdown) {
      type = 'dropdown';
      value = (f.getSelected() ?? []).join(', ');
      options = f.getOptions();
    } else if (f instanceof PDFOptionList) {
      type = 'list';
      value = (f.getSelected() ?? []).join(', ');
      options = f.getOptions();
    } else if (f instanceof PDFSignature) {
      type = 'signature';
    }
    return { name: f.getName(), type, value, options, required: f.isRequired(), readOnly: f.isReadOnly() };
  });
}

export async function fillForm(
  file: DocInput,
  values: Record<string, string>,
  flatten: boolean,
): Promise<{ bytes: Uint8Array; filled: number }> {
  const doc = await loadPdf(file.bytes, file.password);
  const form = doc.getForm();
  let filled = 0;
  for (const field of form.getFields()) {
    const name = field.getName();
    const raw = values[name];
    if (raw === undefined) continue;
    try {
      if (field instanceof PDFTextField) {
        field.setText(raw);
        filled++;
      } else if (field instanceof PDFCheckBox) {
        if (raw === 'true' || raw === 'on' || raw === '1') field.check();
        else field.uncheck();
        filled++;
      } else if (field instanceof PDFRadioGroup) {
        if (raw) field.select(raw);
        filled++;
      } else if (field instanceof PDFDropdown) {
        if (raw) field.select(raw);
        filled++;
      } else if (field instanceof PDFOptionList) {
        const picks = raw.split(',').map((s) => s.trim()).filter(Boolean);
        if (picks.length) field.select(picks);
        filled++;
      }
    } catch (err) {
      // Keep filling the rest; report at the end through the count.
      console.warn('Field failed', name, err);
    }
  }
  if (flatten) form.flatten();
  return { bytes: await savePdf(doc), filled };
}
