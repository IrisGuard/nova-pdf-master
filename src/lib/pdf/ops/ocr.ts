import { PDFDocument } from '@cantoo/pdf-lib';
import type { DocInput } from '../../types';
import { closePdf, openPdfjs, renderPageAtDpi } from '../render';
import { loadPdf, savePdf } from './organize';

export const OCR_LANGS: { code: string; label: string }[] = [
  { code: 'eng', label: 'English' },
  { code: 'ell', label: 'Greek' },
  { code: 'deu', label: 'German' },
  { code: 'fra', label: 'French' },
  { code: 'spa', label: 'Spanish' },
  { code: 'ita', label: 'Italian' },
  { code: 'por', label: 'Portuguese' },
  { code: 'nld', label: 'Dutch' },
];

function toBytes(input: unknown): Uint8Array {
  if (input instanceof Uint8Array) return input;
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  if (Array.isArray(input)) return new Uint8Array(input as number[]);
  if (typeof input === 'string') {
    const bin = atob(input);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  throw new Error('OCR engine returned an unexpected PDF payload');
}

export async function ocrPdf(
  file: DocInput,
  opts: { langs: string[]; dpi: number; keepImages: boolean },
  onProgress: (n: number, m?: string) => void,
  signal: AbortSignal,
): Promise<{ bytes: Uint8Array; pages: number; text: string; confidence: number }> {
  if (!opts.langs.length) throw new Error('Choose at least one OCR language');
  const langs = opts.langs.join('+');
  const T = await import('tesseract.js');
  onProgress(0.02, 'Loading OCR engine');
  const worker = await T.createWorker(langs, 1, {
    workerPath: '/tesseract/worker.min.js',
    corePath: '/tesseract/core',
    langPath: '/tessdata',
    gzip: true,
    cacheMethod: 'write',
    logger: (m: { progress: number; status: string }) => {
      if (m.status === 'recognizing text') {
        onProgress(0.1 + m.progress * 0.8, 'Recognising text');
      } else if (/loading|initializing/.test(m.status)) {
        onProgress(0.02 + m.progress * 0.06, m.status);
      }
    },
  });

  const pdf = await openPdfjs(file.bytes, file.password);
  const source = await loadPdf(file.bytes, file.password);
  const outDoc = await PDFDocument.create();
  let fullText = '';
  let confidenceSum = 0;
  let confidenceCount = 0;
  try {
    for (let i = 1; i <= pdf.numPages; i++) {
      if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
      onProgress(0.1 + ((i - 1) / pdf.numPages) * 0.8, `Scanning page ${i} of ${pdf.numPages}`);
      const canvas = await renderPageAtDpi(pdf, i, opts.dpi, { maxPixels: 24_000_000 });
      const result = await worker.recognize(canvas, {}, { pdf: true, text: true });
      const text = (result.data as { text?: string }).text || '';
      fullText += text + '\n\n';
      const conf = Number((result.data as { confidence?: number }).confidence || 0);
      if (conf > 0) {
        confidenceSum += conf;
        confidenceCount++;
      }
      const pdfData = (result.data as { pdf?: unknown }).pdf;
      if (!pdfData) throw new Error('OCR engine did not return a PDF layer');
      const layerBytes = toBytes(pdfData);
      const layerDoc = await PDFDocument.load(layerBytes, { updateMetadata: false });
      const layerPage = layerDoc.getPage(0);
      const embedded = await outDoc.embedPage(layerPage);
      const srcPage = source.getPage(i - 1);
      const rot = ((srcPage.getRotation().angle % 360) + 360) % 360;
      const w = rot === 90 || rot === 270 ? srcPage.getHeight() : srcPage.getWidth();
      const h = rot === 90 || rot === 270 ? srcPage.getWidth() : srcPage.getHeight();
      const page = outDoc.addPage([w, h]);
      page.drawPage(embedded, { x: 0, y: 0, width: w, height: h });
    }
  } finally {
    await worker.terminate().catch(() => undefined);
    await closePdf(pdf);
  }
  onProgress(0.97, 'Writing searchable PDF');
  const bytes = await savePdf(outDoc);
  onProgress(1, 'Done');
  return {
    bytes,
    pages: outDoc.getPageCount(),
    text: fullText.trim(),
    confidence: confidenceCount ? confidenceSum / confidenceCount / 100 : 0,
  };
}
