import { PDFDocument } from '@cantoo/pdf-lib';
import type { DocInput } from '../../types';
import { canvasToBytes } from '../../util';
import { closePdf, openPdfjs, renderPageAtDpi } from '../render';
import { loadPdf, savePdf } from './organize';

export type ProtectOptions = {
  userPassword: string;
  ownerPassword: string;
  allowPrinting: boolean;
  allowCopying: boolean;
  allowModifying: boolean;
  allowAnnotating: boolean;
  allowForms: boolean;
  allowAssembly: boolean;
  highQualityPrint: boolean;
};

export async function protectPdf(file: DocInput, o: ProtectOptions): Promise<Uint8Array> {
  if (!o.userPassword && !o.ownerPassword) throw new Error('Set a user password, an owner password, or both');
  if (o.userPassword && o.ownerPassword && o.userPassword === o.ownerPassword) {
    throw new Error('User and owner passwords must be different');
  }
  const doc = await loadPdf(file.bytes, file.password);
  doc.encrypt({
    userPassword: o.userPassword,
    ownerPassword: o.ownerPassword || o.userPassword,
    algorithm: 'AES-256',
    permissions: {
      printing: o.allowPrinting ? (o.highQualityPrint ? 'highResolution' : 'lowResolution') : false,
      copying: o.allowCopying,
      modifying: o.allowModifying,
      annotating: o.allowAnnotating,
      fillingForms: o.allowForms,
      documentAssembly: o.allowAssembly,
      contentAccessibility: true,
    },
  });
  return savePdf(doc);
}

export async function unlockPdf(file: DocInput, password: string): Promise<{ bytes: Uint8Array; wasEncrypted: boolean }> {
  if (!password) throw new Error('Enter the current password for this PDF');
  // `isEncrypted` probes with an empty password, because after a successful
  // load pdf-lib reports isEncrypted = false (the document is already decrypted).
  if (!(await isEncrypted(file.bytes))) {
    throw new Error('This PDF is not password protected');
  }
  const doc = await loadPdf(file.bytes, password);
  const bytes = await savePdf(doc);
  return { bytes, wasEncrypted: true };
}

export async function isEncrypted(bytes: Uint8Array): Promise<boolean> {
  try {
    const doc = await PDFDocument.load(bytes, { password: '', updateMetadata: false, throwOnInvalidObject: false });
    return doc.isEncrypted;
  } catch {
    return true;
  }
}

export type RedactionBox = { page: number; x: number; y: number; width: number; height: number };

/**
 * True redaction. Each page is flattened to a high-resolution raster and the
 * selected areas are painted over before the PDF is rebuilt, so the covered
 * text and images no longer exist anywhere in the output file.
 */
export async function redactPdf(
  file: DocInput,
  boxes: RedactionBox[],
  dpi: number,
  onProgress: (n: number, m?: string) => void,
  signal: AbortSignal,
): Promise<{ bytes: Uint8Array; pages: number; boxes: number }> {
  if (!boxes.length) throw new Error('Draw at least one redaction box');
  const source = await PDFDocument.load(file.bytes, { password: file.password, updateMetadata: false, throwOnInvalidObject: false });
  const sizes = source.getPages().map((p) => {
    const rot = ((p.getRotation().angle % 360) + 360) % 360;
    const w = p.getWidth();
    const h = p.getHeight();
    return rot === 90 || rot === 270 ? { w: h, h: w } : { w, h };
  });
  const pdf = await openPdfjs(file.bytes, file.password);
  try {
    const doc = await PDFDocument.create();
    for (let i = 0; i < pdf.numPages; i++) {
      if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
      onProgress((i / pdf.numPages) * 0.9, `Redacting page ${i + 1} of ${pdf.numPages}`);
      const canvas = await renderPageAtDpi(pdf, i + 1, dpi);
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#000000';
      for (const box of boxes.filter((b) => b.page === i)) {
        ctx.fillRect(
          Math.max(0, box.x * canvas.width),
          Math.max(0, box.y * canvas.height),
          Math.min(canvas.width, box.width * canvas.width),
          Math.min(canvas.height, box.height * canvas.height),
        );
      }
      const jpg = await canvasToBytes(canvas, 'image/jpeg', 0.92);
      const img = await doc.embedJpg(jpg);
      const page = doc.addPage([sizes[i].w, sizes[i].h]);
      page.drawImage(img, { x: 0, y: 0, width: sizes[i].w, height: sizes[i].h });
    }
    onProgress(1, 'Done');
    return { bytes: await savePdf(doc), pages: doc.getPageCount(), boxes: boxes.length };
  } finally {
    await closePdf(pdf);
  }
}
