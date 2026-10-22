import { PDFDocument, StandardFonts, rgb } from '@cantoo/pdf-lib';
import JSZip from 'jszip';
import type { DocInput, OptionValue } from '../../types';
import { parsePageRanges, sanitizeName } from '../../util';
import { embedNoto } from '../fonts';
import { closePdf, extractText, openPdfjs, renderPageAtDpi, toGrayscale } from '../render';
import { canvasToBytes, loadImage } from '../../util';
import { loadPdf, out, pageSizeFor, savePdf } from './organize';

export type ImageEntry = { name: string; bytes: Uint8Array };

export async function pdfToImages(
  file: DocInput,
  opts: {
    format: 'png' | 'jpeg' | 'webp';
    dpi: number;
    quality: number;
    pages: string;
    grayscale: boolean;
  },
  onProgress: (n: number, m?: string) => void,
  signal: AbortSignal,
): Promise<ImageEntry[]> {
  const pdf = await openPdfjs(file.bytes, file.password);
  try {
    const indices = parsePageRanges(opts.pages, pdf.numPages);
    const base = sanitizeName(file.name);
    const mime = opts.format === 'png' ? 'image/png' : opts.format === 'jpeg' ? 'image/jpeg' : 'image/webp';
    const ext = opts.format === 'jpeg' ? 'jpg' : opts.format;
    const entries: ImageEntry[] = [];
    for (let i = 0; i < indices.length; i++) {
      if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
      onProgress(i / indices.length, `Rendering page ${indices[i] + 1}`);
      const canvas = await renderPageAtDpi(pdf, indices[i] + 1, opts.dpi, { grayscale: opts.grayscale });
      const bytes = await canvasToBytes(canvas, mime, opts.quality);
      entries.push({ name: `${base}-p${String(indices[i] + 1).padStart(3, '0')}.${ext}`, bytes });
    }
    onProgress(1, 'Rendered');
    return entries;
  } finally {
    await closePdf(pdf);
  }
}

export async function imagesToPdf(
  images: { name: string; bytes: Uint8Array; mime: string }[],
  opts: Record<string, OptionValue>,
  onProgress: (n: number, m?: string) => void,
  signal: AbortSignal,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const [pw, ph] = pageSizeFor(String(opts.size || 'a4'), String(opts.orientation || 'auto'));
  const margin = Number(opts.margin ?? 0);
  const fit = String(opts.fit || 'contain');
  for (let i = 0; i < images.length; i++) {
    if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
    onProgress(i / images.length, `Adding ${images[i].name}`);
    const img = images[i];
    let image;
    let iw: number;
    let ih: number;
    if (/jpe?g/i.test(img.mime)) {
      image = await doc.embedJpg(img.bytes);
      iw = image.width;
      ih = image.height;
    } else if (/png/i.test(img.mime)) {
      image = await doc.embedPng(img.bytes);
      iw = image.width;
      ih = image.height;
    } else {
      const url = URL.createObjectURL(new Blob([img.bytes as BlobPart], { type: img.mime }));
      const el = await loadImage(url);
      const canvas = document.createElement('canvas');
      canvas.width = el.naturalWidth;
      canvas.height = el.naturalHeight;
      canvas.getContext('2d')!.drawImage(el, 0, 0);
      URL.revokeObjectURL(url);
      const png = await canvasToBytes(canvas, 'image/png');
      image = await doc.embedPng(png);
      iw = image.width;
      ih = image.height;
    }
    const page = opts.sameSize ? doc.addPage([iw + margin * 2, ih + margin * 2]) : doc.addPage([pw, ph]);
    const pageW = page.getWidth();
    const pageH = page.getHeight();
    const availW = Math.max(1, pageW - margin * 2);
    const availH = Math.max(1, pageH - margin * 2);
    let scale = Math.min(availW / iw, availH / ih);
    if (fit === 'fill') scale = Math.max(availW / iw, availH / ih);
    if (fit === 'stretch') {
      page.drawImage(image, { x: margin, y: margin, width: availW, height: availH });
      continue;
    }
    const dw = iw * scale;
    const dh = ih * scale;
    page.drawImage(image, { x: margin + (availW - dw) / 2, y: margin + (availH - dh) / 2, width: dw, height: dh });
  }
  onProgress(1, 'Writing PDF');
  return savePdf(doc);
}

export async function pdfToText(file: DocInput, perPage: boolean): Promise<{ text: string; pages: string[] }> {
  const pdf = await openPdfjs(file.bytes, file.password);
  try {
    const pages: string[] = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      let t = '';
      let lastY: number | null = null;
      for (const item of content.items as Array<{ str?: string; transform?: number[]; hasEOL?: boolean }>) {
        if (typeof item.str !== 'string') continue;
        const y = item.transform?.[5] ?? null;
        if (lastY !== null && y !== null && Math.abs(y - lastY) > 2.5) t += '\n';
        t += item.str;
        if (item.hasEOL) t += '\n';
        lastY = y;
      }
      pages.push(t.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim());
      page.cleanup();
    }
    const text = perPage
      ? pages.map((t, i) => `────────── Page ${i + 1} ──────────\n\n${t}`).join('\n\n')
      : pages.join('\n\n\f\n\n');
    return { text, pages };
  } finally {
    await closePdf(pdf);
  }
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function textToHtml(pages: string[]): string {
  const body = pages
    .map((t, i) => `<section class="page" id="page-${i + 1}"><pre>${esc(t)}</pre></section>`)
    .join('\n');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>PDF text export</title>
<style>body{margin:0;background:#f4f4f2;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;color:#16181d}
.page{background:#fff;max-width:820px;margin:24px auto;padding:48px;box-shadow:0 2px 16px rgba(0,0,0,.08);border-radius:8px}
.page pre{white-space:pre-wrap;word-break:break-word;font-size:13px;line-height:1.55;margin:0}
.page::before{content:"Page " attr(id);display:block;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#8a8f98;margin-bottom:18px}
@media print{.page{box-shadow:none;margin:0;max-width:none;page-break-after:always}}</style></head>
<body>${body}</body></html>`;
}

export function textToMarkdown(pages: string[], title: string): string {
  const lines: string[] = [`# ${title}`, ''];
  pages.forEach((t, i) => {
    lines.push(`<!-- page ${i + 1} -->`, '');
    const paragraphs = t.split(/\n{2,}/);
    for (const p of paragraphs) {
      const clean = p.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
      if (!clean) continue;
      // A short line with no ending punctuation reads like a heading in most documents.
      if (clean.length < 80 && !/[.!?:;,]$/.test(clean)) lines.push(`## ${clean}`);
      else lines.push(clean);
      lines.push('');
    }
  });
  return lines.join('\n');
}

export async function pdfToStructured(file: DocInput) {
  const doc = await loadPdf(file.bytes, file.password);
  const pdf = await openPdfjs(file.bytes, file.password);
  try {
    const pages: { page: number; width: number; height: number; text: string }[] = [];
    const pageTexts = await extractText(pdf);
    doc.getPages().forEach((p, i) => {
      pages.push({ page: i + 1, width: Math.round(p.getWidth() * 100) / 100, height: Math.round(p.getHeight() * 100) / 100, text: pageTexts[i] || '' });
    });
    return {
      metadata: {
        title: doc.getTitle() || '',
        author: doc.getAuthor() || '',
        subject: doc.getSubject() || '',
        keywords: (doc.getKeywords() || '').toString(),
        creator: doc.getCreator() || '',
        producer: doc.getProducer() || '',
        pages: doc.getPageCount(),
      },
      pages,
    };
  } finally {
    await closePdf(pdf);
  }
}

export async function pdfToPdfA(file: DocInput, conformance: string): Promise<Uint8Array> {
  const doc = await loadPdf(file.bytes, file.password);
  doc.convertToPDFA({ conformance: conformance as '2B' });
  return savePdf(doc);
}

export type TextToPdfOptions = {
  pageSize: string;
  orientation: 'portrait' | 'landscape';
  margin: number;
  fontSize: number;
  lineHeight: number;
  font: 'sans' | 'serif' | 'mono';
  numbers: boolean;
  title: string;
};

export async function textToPdf(text: string, opts: TextToPdfOptions): Promise<{ bytes: Uint8Array; pages: number }> {
  const doc = await PDFDocument.create();
  const regular = opts.font === 'sans' ? await embedNoto(doc, 'regular') : await doc.embedFont(opts.font === 'mono' ? StandardFonts.Courier : StandardFonts.TimesRoman);
  const needsBold = Boolean(opts.title.trim()) || /^#{1,4}\s/m.test(text) || text.includes('**');
  const bold = !needsBold
    ? regular
    : opts.font === 'sans'
      ? await embedNoto(doc, 'bold')
      : await doc.embedFont(opts.font === 'mono' ? StandardFonts.CourierBold : StandardFonts.TimesRomanBold);
  const [w, h] = pageSizeFor(opts.pageSize, opts.orientation);
  const margin = opts.margin;
  const maxWidth = w - margin * 2;
  const size = opts.fontSize;
  const lh = size * opts.lineHeight;
  let page = doc.addPage([w, h]);
  let y = h - margin;
  let pageCount = 1;
  const newPage = () => {
    page = doc.addPage([w, h]);
    pageCount++;
    y = h - margin;
  };
  const draw = (line: string, font = regular, sz = size, indent = 0) => {
    if (y - sz < margin) newPage();
    page.drawText(line, { x: margin + indent, y: y - sz, size: sz, font, color: rgb(0.08, 0.09, 0.11) });
    y -= sz * opts.lineHeight;
  };

  if (opts.title.trim()) {
    const titleLines = wrap(text, bold, size * 1.9, maxWidth);
    for (const line of titleLines) draw(line, bold, size * 1.9);
    y -= size * 0.8;
  }

  const lines = text.replace(/\r\n/g, '\n').split('\n');
  let inCode = false;
  for (const raw of lines) {
    const line = raw.replace(/\t/g, '    ');
    if (/^```/.test(line.trim())) {
      inCode = !inCode;
      y -= size * 0.3;
      continue;
    }
    if (inCode) {
      for (const l of wrap(line || ' ', opts.font === 'mono' ? regular : await doc.embedFont(StandardFonts.Courier), size * 0.92, maxWidth - 18)) {
        draw(l, opts.font === 'mono' ? regular : await doc.embedFont(StandardFonts.Courier), size * 0.92, 18);
      }
      continue;
    }
    if (!line.trim()) {
      y -= size * 0.6;
      continue;
    }
    const heading = line.match(/^(#{1,4})\s+(.*)$/);
    if (heading) {
      const level = heading[1].length;
      const hs = size * (level === 1 ? 1.7 : level === 2 ? 1.4 : level === 3 ? 1.18 : 1.05);
      for (const l of wrap(heading[2], bold, hs, maxWidth)) draw(l, bold, hs);
      y -= size * 0.35;
      continue;
    }
    const bullet = line.match(/^\s*([-*+]|\d+\.)\s+(.*)$/);
    if (bullet) {
      const marker = /^\d/.test(bullet[1]) ? bullet[1] : '•';
      const bodyLines = wrap(bullet[2], regular, size, maxWidth - 16);
      bodyLines.forEach((l, i) => {
        if (y - size < margin) newPage();
        if (i === 0) page.drawText(marker, { x: margin + 2, y: y - size, size, font: regular, color: rgb(0.1, 0.1, 0.1) });
        page.drawText(l, { x: margin + 16, y: y - size, size, font: regular, color: rgb(0.08, 0.09, 0.11) });
        y -= size * opts.lineHeight;
      });
      continue;
    }
    const clean = line.replace(/\*\*(.+?)\*\*/g, '$1').replace(/`([^`]+)`/g, '$1');
    for (const l of wrap(clean, regular, size, maxWidth)) draw(l);
  }

  if (opts.numbers) {
    const pages = doc.getPages();
    pages.forEach((p, i) => {
      const label = `${i + 1} / ${pages.length}`;
      const tw = regular.widthOfTextAtSize(label, 8.5);
      p.drawText(label, { x: (w - tw) / 2, y: margin / 2, size: 8.5, font: regular, color: rgb(0.45, 0.47, 0.5) });
    });
  }
  return { bytes: await savePdf(doc), pages: doc.getPageCount() };
}

function wrap(text: string, font: { widthOfTextAtSize: (t: string, s: number) => number }, size: number, maxWidth: number): string[] {
  if (!text) return [''];
  const words = text.split(/(\s+)/);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    if (!w) continue;
    const candidate = line + w;
    let width = 0;
    try {
      width = font.widthOfTextAtSize(candidate, size);
    } catch {
      width = candidate.length * size * 0.5;
    }
    if (width > maxWidth && line.trim()) {
      lines.push(line.trimEnd());
      line = w.trimStart();
    } else line = candidate;
  }
  if (line.trim()) lines.push(line.trimEnd());
  return lines.length ? lines : [''];
}

export async function zipEntries(entries: ImageEntry[], zipName: string): Promise<Uint8Array> {
  const zip = new JSZip();
  for (const e of entries) zip.file(e.name, e.bytes);
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', compressionOptions: { level: 6 } });
}

export { out };
