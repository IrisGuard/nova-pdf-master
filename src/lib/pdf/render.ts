import * as pdfjs from 'pdfjs-dist';
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { canvasToBytes } from '../util';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export type { PDFDocumentProxy, PDFPageProxy };

const CMAP_URL = '/pdfjs/cmaps/';
const STANDARD_FONTS_URL = '/pdfjs/standard_fonts/';

export async function openPdfjs(bytes: Uint8Array, password?: string): Promise<PDFDocumentProxy> {
  const task = pdfjs.getDocument({
    data: new Uint8Array(bytes),
    password,
    isEvalSupported: false,
    useSystemFonts: true,
    cMapUrl: CMAP_URL,
    cMapPacked: true,
    standardFontDataUrl: STANDARD_FONTS_URL,
    enableXfa: false,
  } as Parameters<typeof pdfjs.getDocument>[0]);
  return task.promise;
}

export function pageViewport(page: PDFPageProxy, scale: number) {
  return page.getViewport({ scale });
}

/** Release a PDF.js document. The promise type differs across pdf.js releases. */
export async function closePdf(pdf: unknown): Promise<void> {
  if (!pdf) return;
  const handle = pdf as { cleanup?: () => void; destroy?: () => Promise<void> };
  try {
    handle.cleanup?.();
  } catch {
    /* ignore */
  }
  try {
    await handle.destroy?.();
  } catch {
    /* ignore */
  }
}

export async function renderPage(
  pdf: PDFDocumentProxy,
  pageNumber: number,
  scale: number,
  canvas?: HTMLCanvasElement,
): Promise<HTMLCanvasElement> {
  const page = await pdf.getPage(pageNumber);
  const viewport = page.getViewport({ scale });
  const target = canvas ?? document.createElement('canvas');
  target.width = Math.max(1, Math.floor(viewport.width));
  target.height = Math.max(1, Math.floor(viewport.height));
  const ctx = target.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('Canvas 2D is unavailable');
  ctx.save();
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, target.width, target.height);
  ctx.restore();
  await page.render({ canvasContext: ctx, viewport, canvas: target } as Parameters<PDFPageProxy['render']>[0]).promise;
  page.cleanup();
  return target;
}

/** Render one page at a target DPI with an optional max pixel budget. */
export async function renderPageAtDpi(
  pdf: PDFDocumentProxy,
  pageNumber: number,
  dpi: number,
  opts: { grayscale?: boolean; maxPixels?: number } = {},
): Promise<HTMLCanvasElement> {
  const page = await pdf.getPage(pageNumber);
  const base = page.getViewport({ scale: 1 });
  let scale = dpi / 72;
  const maxPixels = opts.maxPixels ?? 16_000_000;
  const pixels = base.width * base.height * scale * scale;
  if (pixels > maxPixels) scale *= Math.sqrt(maxPixels / pixels);
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.floor(viewport.width));
  canvas.height = Math.max(1, Math.floor(viewport.height));
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('Canvas 2D is unavailable');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport, canvas } as Parameters<PDFPageProxy['render']>[0]).promise;
  page.cleanup();
  if (opts.grayscale) toGrayscale(canvas);
  return canvas;
}

export function toGrayscale(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const y = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    d[i] = d[i + 1] = d[i + 2] = y;
  }
  ctx.putImageData(img, 0, 0);
}

export async function renderPageToBytes(
  pdf: PDFDocumentProxy,
  pageNumber: number,
  dpi: number,
  type: 'image/png' | 'image/jpeg' | 'image/webp',
  quality = 0.86,
  grayscale = false,
): Promise<{ bytes: Uint8Array; width: number; height: number }> {
  const canvas = await renderPageAtDpi(pdf, pageNumber, dpi, { grayscale });
  const bytes = await canvasToBytes(canvas, type, quality);
  return { bytes, width: canvas.width, height: canvas.height };
}

export async function extractPageText(pdf: PDFDocumentProxy, pageNumber: number): Promise<string> {
  const page = await pdf.getPage(pageNumber);
  const content = await page.getTextContent();
  let out = '';
  let lastY: number | null = null;
  for (const item of content.items as Array<{ str?: string; transform?: number[]; hasEOL?: boolean }>) {
    if (typeof item.str !== 'string') continue;
    const y = item.transform ? item.transform[5] : null;
    if (lastY !== null && y !== null && Math.abs(y - lastY) > 2) out += '\n';
    out += item.str;
    if (item.hasEOL) out += '\n';
    lastY = y;
  }
  return out.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

export async function extractText(pdf: PDFDocumentProxy): Promise<string[]> {
  const pages: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    pages.push(await extractPageText(pdf, i));
  }
  return pages;
}

export function pdfPageSize(page: PDFPageProxy) {
  const vp = page.getViewport({ scale: 1 });
  return { width: vp.width, height: vp.height };
}
