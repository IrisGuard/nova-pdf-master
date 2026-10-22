import { PDFDocument, StandardFonts, degrees, rgb, type PDFFont, type PDFPage } from '@cantoo/pdf-lib';
import type { DocInput, OptionValue } from '../../types';
import { hexToRgb, parsePageRanges } from '../../util';
import { embedForText, embedNoto } from '../fonts';
import { loadPdf, savePdf } from './organize';

export function colorOf(hex: string) {
  const c = hexToRgb(hex);
  return rgb(c.r, c.g, c.b);
}

export type TextPlacement = {
  page: number; // 0-based
  x: number; // 0..1 from left
  y: number; // 0..1 from top
  size: number;
  color: string;
  rotation?: number;
  opacity?: number;
};

export async function drawTextOnPages(
  file: DocInput,
  text: string,
  placements: TextPlacement[],
  opts: { bold?: boolean; align?: 'left' | 'center' | 'right' } = {},
): Promise<{ bytes: Uint8Array; count: number }> {
  const doc = await loadPdf(file.bytes, file.password);
  const font = await embedForText(doc, text, Boolean(opts.bold));
  const pages = doc.getPages();
  let count = 0;
  for (const p of placements) {
    const page = pages[p.page];
    if (!page) continue;
    const { width: w, height: h } = page.getSize();
    const tw = font.widthOfTextAtSize(text, p.size);
    const align = opts.align ?? 'left';
    let x = p.x * w;
    if (align === 'center') x -= tw / 2;
    if (align === 'right') x -= tw;
    const y = h - p.y * h - p.size * 0.82;
    page.drawText(text, {
      x,
      y,
      size: p.size,
      font,
      color: colorOf(p.color),
      opacity: p.opacity ?? 1,
      rotate: degrees(p.rotation ?? 0),
    });
    count++;
  }
  return { bytes: await savePdf(doc), count };
}

export type WatermarkOptions = {
  mode: 'text' | 'image';
  text: string;
  imageBytes?: Uint8Array;
  imageMime?: string;
  pages: string;
  size: number;
  color: string;
  opacity: number;
  rotation: number;
  tile: boolean;
  scale: number;
  bold: boolean;
};

export async function watermark(file: DocInput, o: WatermarkOptions): Promise<{ bytes: Uint8Array; pages: number }> {
  const doc = await loadPdf(file.bytes, file.password);
  const font = o.mode === 'text' ? await embedForText(doc, o.text, o.bold) : await doc.embedFont(StandardFonts.Helvetica);
  const pages = doc.getPages();
  const indices = parsePageRanges(o.pages, pages.length);
  let image: Awaited<ReturnType<PDFDocument['embedPng']>> | null = null;
  if (o.mode === 'image') {
    if (!o.imageBytes) throw new Error('Choose a PNG or JPEG image for the watermark');
    image = /png/i.test(o.imageMime || '') ? await doc.embedPng(o.imageBytes) : await doc.embedJpg(o.imageBytes);
  }
  for (const i of indices) {
    const page = pages[i];
    const { width: w, height: h } = page.getSize();
    if (o.mode === 'image' && image) {
      const maxW = w * o.scale;
      const scale = Math.min(maxW / image.width, (h * o.scale) / image.height);
      const iw = image.width * scale;
      const ih = image.height * scale;
      page.drawImage(image, {
        x: (w - iw) / 2,
        y: (h - ih) / 2,
        width: iw,
        height: ih,
        opacity: o.opacity,
        rotate: degrees(o.rotation),
      });
    } else if (o.text.trim()) {
      if (o.tile) {
        const line = o.text;
        const tw = font.widthOfTextAtSize(line, o.size);
        const stepX = tw + o.size * 2.4;
        const stepY = o.size * 4.2;
        for (let y = -h; y < h * 2; y += stepY) {
          for (let x = -w; x < w * 2; x += stepX) {
            page.drawText(line, {
              x,
              y,
              size: o.size,
              font,
              color: colorOf(o.color),
              opacity: o.opacity,
              rotate: degrees(o.rotation),
            });
          }
        }
      } else {
        const tw = font.widthOfTextAtSize(o.text, o.size);
        page.drawText(o.text, {
          x: (w - tw) / 2,
          y: h / 2 - o.size / 2,
          size: o.size,
          font,
          color: colorOf(o.color),
          opacity: o.opacity,
          rotate: degrees(o.rotation),
        });
      }
    }
  }
  return { bytes: await savePdf(doc), pages: indices.length };
}

function formatTemplate(tpl: string, vars: Record<string, string | number>): string {
  return tpl.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''));
}

export async function numbering(
  file: DocInput,
  o: {
    mode: 'page' | 'header' | 'footer' | 'bates';
    format: string;
    pages: string;
    start: number;
    startAt: number;
    size: number;
    color: string;
    margin: number;
    position: 'left' | 'center' | 'right';
    bold: boolean;
    prefix?: string;
    digits?: number;
  },
): Promise<{ bytes: Uint8Array; pages: number }> {
  const doc = await loadPdf(file.bytes, file.password);
  const title = doc.getTitle() || file.name.replace(/\.pdf$/i, '');
  const font = await embedForText(doc, `${o.format}${o.prefix ?? ''}${title}`, o.bold);
  const pages = doc.getPages();
  const indices = parsePageRanges(o.pages, pages.length);
  let n = o.startAt;
  const total = indices.length;
  for (const idx of indices) {
    const page = pages[idx];
    const { width: w, height: h } = page.getSize();
    const pageNumber = idx + 1;
    let text: string;
    if (o.mode === 'bates') {
      const prefix = o.prefix ?? '';
      text = prefix + String(n).padStart(o.digits ?? 6, '0');
      n++;
    } else {
      text = formatTemplate(o.format, {
        page: pageNumber,
        total: pages.length,
        n: pageNumber - o.startAt + 1,
        count: total,
        title,
        file: file.name,
        date: new Date().toLocaleDateString('en-GB'),
        time: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
      });
    }
    const tw = font.widthOfTextAtSize(text, o.size);
    let x = o.margin;
    if (o.position === 'center') x = (w - tw) / 2;
    if (o.position === 'right') x = w - tw - o.margin;
    const y = o.mode === 'header' ? h - o.margin - o.size : o.margin;
    page.drawText(text, { x, y, size: o.size, font, color: colorOf(o.color) });
  }
  return { bytes: await savePdf(doc), pages: indices.length };
}

export type Placement = {
  id: string;
  page: number;
  x: number; // 0..1 left
  y: number; // 0..1 top
  width: number; // fraction of page width
  height: number; // fraction of page height
  rotation: number;
  opacity: number;
  kind: 'image' | 'text';
  text?: string;
  size?: number;
  color?: string;
  imageBytes?: Uint8Array;
  imageMime?: string;
  /** Preview only — never written into the PDF. */
  dataUrl?: string;
};

export async function placeOnPages(
  file: DocInput,
  placements: Placement[],
): Promise<{ bytes: Uint8Array; count: number }> {
  const doc = await loadPdf(file.bytes, file.password);
  const pages = doc.getPages();
  let count = 0;
  for (const p of placements) {
    const page = pages[p.page];
    if (!page) continue;
    const { width: w, height: h } = page.getSize();
    const x = p.x * w;
    const y = h - (p.y + p.height) * h;
    const pw = p.width * w;
    const ph = p.height * h;
    if (p.kind === 'image' && p.imageBytes) {
      let img;
      if (/png/i.test(p.imageMime || '')) img = await doc.embedPng(p.imageBytes);
      else if (/webp/i.test(p.imageMime || '')) {
        const blob = new Blob([p.imageBytes as BlobPart], { type: 'image/webp' });
        const bmp = await createImageBitmap(blob);
        const canvas = document.createElement('canvas');
        canvas.width = bmp.width;
        canvas.height = bmp.height;
        canvas.getContext('2d')!.drawImage(bmp, 0, 0);
        const png = await new Promise<Blob>((res) => canvas.toBlob((b) => res(b!), 'image/png'));
        img = await doc.embedPng(new Uint8Array(await png.arrayBuffer()));
      } else img = await doc.embedJpg(p.imageBytes);
      page.drawImage(img, { x, y, width: pw, height: ph, opacity: p.opacity, rotate: degrees(p.rotation) });
    } else if (p.kind === 'text') {
      const size = p.size ?? 16;
      const font = /^[\x00-\xFF]*$/.test(p.text || '')
        ? await doc.embedFont(StandardFonts.Helvetica)
        : await embedNoto(doc);
      const lines = (p.text || '').split('\n');
      lines.forEach((line, i) => {
        page.drawText(line, {
          x,
          y: y + ph - size * (i + 1) * 1.18,
          size,
          font,
          color: colorOf(p.color || '#111111'),
          opacity: p.opacity,
          rotate: degrees(p.rotation),
        });
      });
    }
    count++;
  }
  return { bytes: await savePdf(doc), count };
}

export type Annotation =
  | {
      id: string;
      type: 'text';
      page: number;
      x: number;
      y: number;
      width: number;
      height: number;
      text: string;
      size: number;
      color: string;
      opacity: number;
    }
  | {
      id: string;
      type: 'rect' | 'highlight';
      page: number;
      x: number;
      y: number;
      width: number;
      height: number;
      color: string;
      opacity: number;
      borderWidth: number;
      fill: boolean;
    }
  | {
      id: string;
      type: 'pen';
      page: number;
      points: { x: number; y: number }[];
      color: string;
      width: number;
      opacity: number;
    };

export async function applyAnnotations(file: DocInput, annotations: Annotation[]): Promise<{ bytes: Uint8Array; count: number }> {
  const doc = await loadPdf(file.bytes, file.password);
  const pages = doc.getPages();
  const ufont = await embedNoto(doc);
  let count = 0;
  const toPdf = (page: PDFPage, x: number, y: number) => {
    const { width: w, height: h } = page.getSize();
    return { x: x * w, y: h - y * h, w, h };
  };
  for (const a of annotations) {
    const page = pages[a.page];
    if (!page) continue;
    if (a.type === 'text') {
      const p = toPdf(page, a.x, a.y);
      const size = a.size;
      const lines = a.text.split('\n');
      lines.forEach((line, i) => {
        page.drawText(line, {
          x: p.x,
          y: p.y - size - i * size * 1.25,
          size,
          font: ufont,
          color: colorOf(a.color),
          opacity: a.opacity,
        });
      });
    } else if (a.type === 'pen') {
      const top = toPdf(page, 0, 0);
      for (let i = 1; i < a.points.length; i++) {
        const a1 = a.points[i - 1];
        const a2 = a.points[i];
        page.drawLine({
          start: { x: a1.x * top.w, y: top.h - a1.y * top.h },
          end: { x: a2.x * top.w, y: top.h - a2.y * top.h },
          thickness: a.width,
          color: colorOf(a.color),
          opacity: a.opacity,
        });
      }
    } else {
      const p = toPdf(page, a.x, a.y);
      const rect = {
        x: p.x,
        y: p.y - a.height * p.h,
        width: a.width * p.w,
        height: a.height * p.h,
      };
      if (a.type === 'highlight') {
        page.drawRectangle({ ...rect, color: colorOf(a.color), opacity: a.opacity, borderWidth: 0 });
      } else if (a.fill) {
        page.drawRectangle({ ...rect, color: colorOf(a.color), opacity: a.opacity, borderWidth: a.borderWidth, borderColor: colorOf(a.color) });
      } else {
        page.drawRectangle({ ...rect, borderColor: colorOf(a.color), borderWidth: a.borderWidth, opacity: a.opacity });
      }
    }
    count++;
  }
  return { bytes: await savePdf(doc), count };
}

export async function editMetadata(
  file: DocInput,
  fields: Record<string, string>,
  removeAll = false,
): Promise<{ bytes: Uint8Array; before: Record<string, string>; after: Record<string, string> }> {
  const doc = await loadPdf(file.bytes, file.password);
  const read = () => ({
    title: doc.getTitle() || '',
    author: doc.getAuthor() || '',
    subject: doc.getSubject() || '',
    keywords: (doc.getKeywords() || '').toString(),
    creator: doc.getCreator() || '',
    producer: doc.getProducer() || '',
  });
  const before = read();
  if (removeAll) {
    doc.setTitle('');
    doc.setAuthor('');
    doc.setSubject('');
    doc.setKeywords([]);
    doc.setCreator('');
    doc.setProducer('');
  } else {
    doc.setTitle(fields.title ?? '');
    doc.setAuthor(fields.author ?? '');
    doc.setSubject(fields.subject ?? '');
    doc.setKeywords((fields.keywords || '').split(',').map((s) => s.trim()).filter(Boolean));
    doc.setCreator(fields.creator ?? '');
    doc.setProducer(fields.producer ?? 'NOVA PDF');
    if (fields.creationDate) {
      const d = new Date(fields.creationDate);
      if (!Number.isNaN(d.getTime())) doc.setCreationDate(d);
    }
  }
  const after = read();
  return { bytes: await savePdf(doc), before, after };
}

export async function flattenDocument(file: DocInput): Promise<{ bytes: Uint8Array; fields: number }> {
  const doc = await loadPdf(file.bytes, file.password);
  let fields = 0;
  try {
    const form = doc.getForm();
    fields = form.getFields().length;
    form.flatten();
  } catch {
    fields = 0;
  }
  // Remove link/annotation objects that can still trigger actions.
  for (const page of doc.getPages()) {
    page.node.delete((await import('@cantoo/pdf-lib')).PDFName.of('Annots'));
  }
  return { bytes: await savePdf(doc), fields };
}

export async function removeMetadata(file: DocInput): Promise<Uint8Array> {
  const doc = await loadPdf(file.bytes, file.password);
  doc.setTitle('');
  doc.setAuthor('');
  doc.setSubject('');
  doc.setKeywords([]);
  doc.setCreator('');
  doc.setProducer('');
  return savePdf(doc);
}

export function friendlySize(n: number) {
  return n > 1024 * 1024 ? (n / 1024 / 1024).toFixed(2) + ' MB' : (n / 1024).toFixed(0) + ' KB';
}

export const _unused: PDFFont | undefined = undefined;
