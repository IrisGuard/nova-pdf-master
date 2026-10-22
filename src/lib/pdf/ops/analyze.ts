import { PDFDocument, PDFName, PDFDict, PDFArray } from '@cantoo/pdf-lib';
import type { DocInput } from '../../types';
import { closePdf, openPdfjs, renderPageAtDpi } from '../render';
import { loadPdf } from './organize';

export type DocumentInfo = {
  pages: number;
  size: number;
  encrypted: boolean;
  title: string;
  author: string;
  subject: string;
  keywords: string;
  creator: string;
  producer: string;
  pageSizes: { page: number; width: number; height: number; rotation: number; label: string }[];
  fonts: string[];
  hasForms: boolean;
  hasAttachments: boolean;
  hasJavaScript: boolean;
  pdfVersion: string;
};

export async function inspectDocument(file: DocInput): Promise<DocumentInfo> {
  const doc: PDFDocument = await loadPdf(file.bytes, file.password);
  const catalog = doc.catalog;
  const names = catalog.lookup(PDFName.of('Names'));
  let hasJavaScript = false;
  let hasAttachments = false;
  if (names instanceof PDFDict) {
    hasJavaScript = names.has(PDFName.of('JavaScript'));
    hasAttachments = names.has(PDFName.of('EmbeddedFiles'));
  }
  if (catalog.has(PDFName.of('OpenAction'))) {
    const action = catalog.lookup(PDFName.of('OpenAction'));
    if (action instanceof PDFDict && action.get(PDFName.of('S'))?.toString().includes('JavaScript')) hasJavaScript = true;
  }
  const acro = catalog.lookup(PDFName.of('AcroForm'));
  let hasForms = false;
  if (acro instanceof PDFDict) {
    const fields = acro.lookup(PDFName.of('Fields'));
    hasForms = fields instanceof PDFArray && fields.size() > 0;
  }
  const fontSet = new Set<string>();
  for (const page of doc.getPages()) {
    const resources = page.node.Resources();
    if (!resources) continue;
    const fonts = resources.lookup(PDFName.of('Font'));
    if (fonts instanceof PDFDict) {
      for (const [, ref] of fonts.entries()) {
        const font = doc.context.lookup(ref);
        if (font instanceof PDFDict) {
          const base = font.get(PDFName.of('BaseFont'));
          if (base) fontSet.add(base.toString().replace(/^\//, '').replace(/^[A-Z]{6}\+/, ''));
        }
      }
    }
  }
  const pageSizes = doc.getPages().map((p, i) => {
    const w = p.getWidth();
    const h = p.getHeight();
    const label = Math.abs(w - 595.28) < 2 && Math.abs(h - 841.89) < 2 ? 'A4' : Math.abs(w - 612) < 2 && Math.abs(h - 792) < 2 ? 'Letter' : `${Math.round(w)}×${Math.round(h)} pt`;
    return { page: i + 1, width: Math.round(w * 100) / 100, height: Math.round(h * 100) / 100, rotation: p.getRotation().angle, label };
  });
  const versionMatch = String(doc.context.header ? doc.context.header.toString() : '').match(/PDF-(\d+\.\d+)/);
  const version = versionMatch ? versionMatch[1] : '1.7';
  return {
    pages: doc.getPageCount(),
    size: file.bytes.byteLength,
    encrypted: doc.isEncrypted,
    title: doc.getTitle() || '',
    author: doc.getAuthor() || '',
    subject: doc.getSubject() || '',
    keywords: (doc.getKeywords() || '').toString(),
    creator: doc.getCreator() || '',
    producer: doc.getProducer() || '',
    pageSizes,
    fonts: [...fontSet].sort(),
    hasForms,
    hasAttachments,
    hasJavaScript,
    pdfVersion: version,
  };
}

export type ComparePage = {
  page: number;
  similarity: number;
  changedPixels: number;
  preview: string;
};

export async function compareDocuments(
  a: DocInput,
  b: DocInput,
  dpi: number,
  onProgress: (n: number, m?: string) => void,
  signal: AbortSignal,
): Promise<{ pages: ComparePage[]; overall: number; reportHtml: string }> {
  const pa = await openPdfjs(a.bytes, a.password);
  const pb = await openPdfjs(b.bytes, b.password);
  const count = Math.max(pa.numPages, pb.numPages);
  const results: ComparePage[] = [];
  try {
    for (let i = 1; i <= count; i++) {
      if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
      onProgress((i / count) * 0.95, `Comparing page ${i} of ${count}`);
      const ca = i <= pa.numPages ? await renderPageAtDpi(pa, i, dpi, { maxPixels: 3_000_000 }) : null;
      const cb = i <= pb.numPages ? await renderPageAtDpi(pb, i, dpi, { maxPixels: 3_000_000 }) : null;
      const width = 620;
      const canvas = document.createElement('canvas');
      let ia: ImageData | null = null;
      let ib: ImageData | null = null;
      canvas.width = width * 2 + 12;
      canvas.height = 1;
      if (ca) {
        const scaled = docScale(ca, width);
        ia = scaled.getContext('2d')!.getImageData(0, 0, scaled.width, scaled.height);
        canvas.height = Math.max(canvas.height, scaled.height);
      }
      if (cb) {
        const scaled = docScale(cb, width);
        ib = scaled.getContext('2d')!.getImageData(0, 0, scaled.width, scaled.height);
        canvas.height = Math.max(canvas.height, scaled.height);
      }
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#e9e9e4';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      if (ca) ctx.drawImage(docScale(ca, width), 0, 0);
      if (cb) ctx.drawImage(docScale(cb, width), width + 12, 0);

      let changed = 0;
      let total = 0;
      let similarity = 0;
      if (ia && ib) {
        const w = Math.min(ia.width, ib.width);
        const h = Math.min(ia.height, ib.height);
        const diffCanvas = document.createElement('canvas');
        diffCanvas.width = w;
        diffCanvas.height = h;
        const dctx = diffCanvas.getContext('2d')!;
        const out = dctx.createImageData(w, h);
        // Every pixel is compared: a changed word must never round away to
        // "100% identical". The threshold ignores anti-aliasing noise only.
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            const idx = (y * ia.width + x) * 4;
            const idy = (y * ib.width + x) * 4;
            const d =
              Math.abs(ia.data[idx] - ib.data[idy]) +
              Math.abs(ia.data[idx + 1] - ib.data[idy + 1]) +
              Math.abs(ia.data[idx + 2] - ib.data[idy + 2]);
            total++;
            if (d > 24) {
              changed++;
              const o = (y * w + x) * 4;
              out.data[o] = 255;
              out.data[o + 1] = 40;
              out.data[o + 2] = 60;
              out.data[o + 3] = 190;
            }
          }
        }
        dctx.putImageData(out, 0, 0);
        similarity = total ? 1 - changed / total : 1;
        ctx.drawImage(diffCanvas, 0, canvas.height - h);
      } else similarity = 0;
      results.push({
        page: i,
        similarity,
        changedPixels: changed,
        preview: canvas.toDataURL('image/jpeg', 0.7),
      });
    }
  } finally {
    await closePdf(pa);
    await closePdf(pb);
  }
  const overall = results.reduce((s, r) => s + r.similarity, 0) / Math.max(1, results.length);
  const reportHtml = `<!doctype html><html><head><meta charset="utf-8"><title>PDF comparison</title>
<style>body{font-family:Inter,system-ui,sans-serif;background:#0b0b0f;color:#e9e9ef;margin:0;padding:40px}
h1{font-size:28px;letter-spacing:-.02em}.row{background:#15151c;border:1px solid #262632;border-radius:14px;padding:18px;margin:16px 0}
img{width:100%;border-radius:8px;background:#fff}.meta{display:flex;gap:24px;color:#9aa0ae;font-size:13px;margin-bottom:10px}
b{color:#c8ff4d}</style></head><body><h1>PDF comparison</h1>
<p>${escapeHtml(a.name)} vs ${escapeHtml(b.name)} — overall pixel similarity <b>${(overall * 100).toFixed(1)}%</b></p>
${results
  .map(
    (r) =>
      `<div class="row"><div class="meta"><span>Page ${r.page}</span><span>${(r.similarity * 100).toFixed(2)}% match</span><span>${r.changedPixels.toLocaleString()} changed samples</span></div><img src="${r.preview}" alt="page ${r.page} comparison"></div>`,
  )
  .join('')}</body></html>`;
  return { pages: results, overall, reportHtml };
}

function escapeHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function docScale(src: HTMLCanvasElement, width: number): HTMLCanvasElement {
  const scale = width / src.width;
  const c = document.createElement('canvas');
  c.width = width;
  c.height = Math.max(1, Math.round(src.height * scale));
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(src, 0, 0, c.width, c.height);
  return c;
}
