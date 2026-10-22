import { PDFDocument, PDFName } from '@cantoo/pdf-lib';
import type { DocInput, OptionValue } from '../../types';
import { canvasToBytes, parsePageRanges } from '../../util';
import { closePdf, openPdfjs, renderPageAtDpi } from '../render';
import { out, savePdf } from './organize';

export async function compressPdf(
  file: DocInput,
  opts: Record<string, OptionValue>,
  onProgress: (n: number, m?: string) => void,
  signal: AbortSignal,
): Promise<{ bytes: Uint8Array; before: number; after: number; pages: number; mode: string }> {
  const mode = String(opts.mode || 'raster');
  if (mode === 'lossless') {
    const doc = await PDFDocument.load(file.bytes, { password: file.password, updateMetadata: false, throwOnInvalidObject: false });
    if (opts.stripMetadata) {
      doc.setTitle('');
      doc.setAuthor('');
      doc.setSubject('');
      doc.setKeywords([]);
      doc.setCreator('');
      doc.setProducer('');
    }
    if (opts.stripAnnotations) {
      for (const page of doc.getPages()) {
        page.node.delete(PDFName.of('Annots'));
      }
    }
    onProgress(0.7, 'Rewriting with object streams');
    const bytes = await savePdf(doc);
    onProgress(1, 'Done');
    return { bytes, before: file.bytes.byteLength, after: bytes.byteLength, pages: doc.getPageCount(), mode };
  }

  const dpi = Number(opts.dpi ?? 150);
  const quality = Number(opts.quality ?? 0.72);
  const grayscale = Boolean(opts.grayscale);
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
      onProgress((i / pdf.numPages) * 0.92, `Optimising page ${i + 1} of ${pdf.numPages}`);
      const canvas = await renderPageAtDpi(pdf, i + 1, dpi, { grayscale });
      const jpg = await canvasToBytes(canvas, 'image/jpeg', quality);
      const img = await doc.embedJpg(jpg);
      const page = doc.addPage([sizes[i].w, sizes[i].h]);
      page.drawImage(img, { x: 0, y: 0, width: sizes[i].w, height: sizes[i].h });
    }
    if (!opts.stripMetadata) {
      const title = source.getTitle();
      if (title) doc.setTitle(title);
    }
    doc.setProducer('NOVA PDF');
    onProgress(1, 'Done');
    const bytes = await savePdf(doc);
    return { bytes, before: file.bytes.byteLength, after: bytes.byteLength, pages: doc.getPageCount(), mode };
  } finally {
    await closePdf(pdf);
  }
}

export async function rasterize(
  file: DocInput,
  dpi: number,
  quality: number,
  grayscale: boolean,
  onProgress: (n: number, m?: string) => void,
  signal: AbortSignal,
): Promise<{ bytes: Uint8Array; pages: number }> {
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
      onProgress((i / pdf.numPages) * 0.95, `Page ${i + 1} of ${pdf.numPages}`);
      const canvas = await renderPageAtDpi(pdf, i + 1, dpi, { grayscale });
      const jpg = await canvasToBytes(canvas, 'image/jpeg', quality);
      const img = await doc.embedJpg(jpg);
      const page = doc.addPage([sizes[i].w, sizes[i].h]);
      page.drawImage(img, { x: 0, y: 0, width: sizes[i].w, height: sizes[i].h });
    }
    return { bytes: await savePdf(doc), pages: doc.getPageCount() };
  } finally {
    await closePdf(pdf);
  }
}

export async function repairPdf(file: DocInput): Promise<{ bytes: Uint8Array; pages: number; recovered: boolean }> {
  let doc: PDFDocument;
  try {
    doc = await PDFDocument.load(file.bytes, { password: file.password, updateMetadata: false, throwOnInvalidObject: false, parseSpeed: 0, capNumbers: true });
  } catch (err) {
    throw new Error(`Could not read the file structure: ${(err as Error).message}`);
  }
  const pages = doc.getPageCount();
  const bytes = await doc.save({ useObjectStreams: false, addDefaultPage: false });
  return { bytes, pages, recovered: bytes.byteLength !== file.bytes.byteLength };
}

export async function sanitizePdf(file: DocInput): Promise<{ bytes: Uint8Array; pages: number; removed: string[] }> {
  const src = await PDFDocument.load(file.bytes, { password: file.password, updateMetadata: false, throwOnInvalidObject: false });
  const doc = await PDFDocument.create();
  const copied = await doc.copyPages(src, src.getPageIndices());
  copied.forEach((p) => {
    p.node.delete(PDFName.of('Annots'));
    doc.addPage(p);
  });
  doc.setTitle('');
  doc.setAuthor('');
  doc.setSubject('');
  doc.setKeywords([]);
  doc.setCreator('');
  doc.setProducer('');
  return { bytes: await savePdf(doc), pages: doc.getPageCount(), removed: ['metadata', 'annotations', 'form actions', 'embedded scripts', 'attachments', 'bookmarks'] };
}

export async function extractTextPages(
  file: DocInput,
  pages: string,
): Promise<{ entries: { name: string; bytes: Uint8Array }[]; count: number }> {
  const pdf = await openPdfjs(file.bytes, file.password);
  try {
    const { extractPageText } = await import('../render');
    const indices = parsePageRanges(pages, pdf.numPages);
    const entries: { name: string; bytes: Uint8Array }[] = [];
    for (const i of indices) {
      const text = await extractPageText(pdf, i + 1);
      entries.push({ name: `page-${String(i + 1).padStart(3, '0')}.txt`, bytes: new TextEncoder().encode(text) });
    }
    return { entries, count: entries.length };
  } finally {
    await closePdf(pdf);
  }
}

export { out };
