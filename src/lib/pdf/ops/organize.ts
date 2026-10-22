import { PDFDocument, degrees } from '@cantoo/pdf-lib';
import JSZip from 'jszip';
import type { DocInput, OptionValue, ToolResult } from '../../types';
import { baseName, parsePageRanges, sanitizeName, uid } from '../../util';
import { embedForText, embedNoto } from '../fonts';

export const PAGE_SIZES: Record<string, [number, number]> = {
  a4: [595.28, 841.89],
  a3: [841.89, 1190.55],
  a5: [419.53, 595.28],
  letter: [612, 792],
  legal: [612, 1008],
};

export function pageSizeFor(name: string, orientation = 'auto'): [number, number] {
  const [w, h] = PAGE_SIZES[name] ?? PAGE_SIZES.a4;
  if (orientation === 'landscape') return [Math.max(w, h), Math.min(w, h)];
  if (orientation === 'portrait') return [Math.min(w, h), Math.max(w, h)];
  return [w, h];
}

export async function loadPdf(input: Uint8Array, password?: string): Promise<PDFDocument> {
  return PDFDocument.load(input, {
    password,
    updateMetadata: false,
    throwOnInvalidObject: false,
    capNumbers: true,
  });
}

export async function savePdf(doc: PDFDocument): Promise<Uint8Array> {
  return doc.save({ useObjectStreams: true, addDefaultPage: false });
}

export function out(name: string, bytes: Uint8Array, tool: string, mime = 'application/pdf') {
  return { id: uid('o'), name, bytes, mime, tool, createdAt: Date.now() };
}

export async function zipOutputs(
  entries: { name: string; bytes: Uint8Array }[],
  zipName: string,
  tool: string,
): Promise<Uint8Array> {
  const zip = new JSZip();
  for (const e of entries) zip.file(e.name, e.bytes);
  const blob = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', compressionOptions: { level: 6 } });
  return blob;
}

const fileOf = (f: DocInput) => f.bytes;

export async function mergeDocs(
  files: DocInput[],
  ranges: string | undefined,
  ctx: { onProgress: (n: number, m?: string) => void; signal: AbortSignal },
): Promise<{ bytes: Uint8Array; pages: number }> {
  const target = await PDFDocument.create();
  let total = 0;
  for (let i = 0; i < files.length; i++) {
    if (ctx.signal.aborted) throw new DOMException('Cancelled', 'AbortError');
    const f = files[i];
    ctx.onProgress((i / files.length) * 0.9, `Reading ${f.name}`);
    const src = await loadPdf(fileOf(f), f.password);
    const count = src.getPageCount();
    const indices =
      ranges && ranges.trim() && ranges.trim() !== '*' && !/^all$/i.test(ranges.trim())
        ? parsePageRanges(ranges, count)
        : Array.from({ length: count }, (_, k) => k);
    const copied = await target.copyPages(src, indices);
    for (const p of copied) target.addPage(p);
    total += copied.length;
  }
  ctx.onProgress(1, 'Writing PDF');
  const bytes = await savePdf(target);
  return { bytes, pages: total };
}

export type SplitMode = 'ranges' | 'every' | 'single' | 'size';

export async function splitDoc(
  file: DocInput,
  opts: Record<string, OptionValue>,
  ctx: { onProgress: (n: number, m?: string) => void; signal: AbortSignal; log: (m: string) => void },
): Promise<{ entries: { name: string; bytes: Uint8Array }[]; totalPages: number }> {
  const src = await loadPdf(file.bytes, file.password);
  const count = src.getPageCount();
  const mode = String(opts.mode || 'ranges') as SplitMode;
  const groups: number[][] = [];
  const base = sanitizeName(file.name);

  if (mode === 'single') {
    for (let i = 0; i < count; i++) groups.push([i]);
  } else if (mode === 'every') {
    const n = Math.max(1, Number(opts.every) || 1);
    for (let i = 0; i < count; i += n) {
      groups.push(Array.from({ length: Math.min(n, count - i) }, (_, k) => i + k));
    }
  } else if (mode === 'size') {
    const targetBytes = Math.max(0.1, Number(opts.targetMb) || 5) * 1024 * 1024;
    const perPage = file.bytes.byteLength / Math.max(1, count);
    let current: number[] = [];
    for (let i = 0; i < count; i++) {
      current.push(i);
      const estimated = current.length * perPage;
      if (estimated >= targetBytes && current.length > 1) {
        groups.push(current);
        current = [];
      }
    }
    if (current.length) {
      // If a single trailing page is huge, keep it alone; otherwise merge with previous group.
      if (groups.length && current.length * perPage < targetBytes * 0.5) {
        groups[groups.length - 1].push(...current);
      } else groups.push(current);
    }
  } else {
    const spec = String(opts.ranges || '').trim();
    if (!spec) throw new Error('Enter page ranges, e.g. 1-3, 4-6, 7');
    for (const part of spec.split(',')) {
      if (!part.trim()) continue;
      groups.push(parsePageRanges(part, count));
    }
  }

  const entries: { name: string; bytes: Uint8Array }[] = [];
  for (let g = 0; g < groups.length; g++) {
    if (ctx.signal.aborted) throw new DOMException('Cancelled', 'AbortError');
    ctx.onProgress(g / groups.length, `Writing part ${g + 1} of ${groups.length}`);
    const doc = await PDFDocument.create();
    const pages = await doc.copyPages(src, groups[g]);
    pages.forEach((p) => doc.addPage(p));
    const bytes = await savePdf(doc);
    const label = mode === 'single' ? `page-${String(groups[g][0] + 1).padStart(3, '0')}` : `part-${String(g + 1).padStart(2, '0')}`;
    entries.push({ name: `${base}-${label}.pdf`, bytes });
  }
  ctx.onProgress(1, 'Done');
  return { entries, totalPages: count };
}

export async function extractPages(
  file: DocInput,
  pages: number[],
): Promise<Uint8Array> {
  const src = await loadPdf(file.bytes, file.password);
  const doc = await PDFDocument.create();
  const copied = await doc.copyPages(src, pages);
  copied.forEach((p) => doc.addPage(p));
  return savePdf(doc);
}

export async function rotatePages(
  file: DocInput,
  pages: string,
  angle: number,
): Promise<{ bytes: Uint8Array; pages: number }> {
  const doc = await loadPdf(file.bytes, file.password);
  const all = doc.getPages();
  const indices = parsePageRanges(pages, all.length);
  for (const i of indices) {
    const page = all[i];
    page.setRotation(degrees((page.getRotation().angle + angle) % 360));
  }
  return { bytes: await savePdf(doc), pages: indices.length };
}

export type OrganizePlanItem = { source: number; page: number; rotate: number; id: string };

export async function rebuildOrganized(
  file: DocInput,
  plan: OrganizePlanItem[],
): Promise<{ bytes: Uint8Array; pages: number; skipped: number }> {
  if (!plan.length) throw new Error('The document has no pages left. Keep at least one.');
  const src = await loadPdf(file.bytes, file.password);
  const doc = await PDFDocument.create();
  const skipped = plan.filter((p) => p.source < 0).length;
  for (const item of plan) {
    if (item.source < 0) continue;
    const [copied] = await doc.copyPages(src, [item.page]);
    copied.setRotation(degrees(((copied.getRotation().angle + item.rotate) % 360 + 360) % 360));
    doc.addPage(copied);
  }
  return { bytes: await savePdf(doc), pages: doc.getPageCount(), skipped };
}

export async function resizePages(
  file: DocInput,
  targetW: number,
  targetH: number,
  mode: 'fit' | 'fill' | 'stretch',
  margin: number,
): Promise<Uint8Array> {
  const src = await loadPdf(file.bytes, file.password);
  const doc = await PDFDocument.create();
  const pages = src.getPages();
  for (const page of pages) {
    const embedded = await doc.embedPage(page);
    const out = doc.addPage([targetW, targetH]);
    const availW = Math.max(1, targetW - margin * 2);
    const availH = Math.max(1, targetH - margin * 2);
    const sx = availW / embedded.width;
    const sy = availH / embedded.height;
    let scale = Math.min(sx, sy);
    let x = margin + (availW - embedded.width * scale) / 2;
    let y = margin + (availH - embedded.height * scale) / 2;
    if (mode === 'fill') {
      scale = Math.max(sx, sy);
      x = margin + (availW - embedded.width * scale) / 2;
      y = margin + (availH - embedded.height * scale) / 2;
    } else if (mode === 'stretch') {
      out.drawPage(embedded, { x: margin, y: margin, width: availW, height: availH });
      continue;
    }
    out.drawPage(embedded, { x, y, width: embedded.width * scale, height: embedded.height * scale });
  }
  return savePdf(doc);
}

export async function cropDocument(
  file: DocInput,
  margins: { top: number; right: number; bottom: number; left: number },
  unit: 'pt' | 'mm',
): Promise<Uint8Array> {
  const factor = unit === 'mm' ? 2.834645669 : 1;
  const src = await loadPdf(file.bytes, file.password);
  const doc = await PDFDocument.create();
  for (const page of src.getPages()) {
    const { width: w, height: h } = page.getSize();
    const left = Math.max(0, margins.left * factor);
    const right = Math.max(0, margins.right * factor);
    const bottom = Math.max(0, margins.bottom * factor);
    const top = Math.max(0, margins.top * factor);
    if (left + right >= w || bottom + top >= h) throw new Error('Crop margins are larger than the page');
    const box = { left, bottom, right: w - right, top: h - top };
    const embedded = await doc.embedPage(page, box);
    const out = doc.addPage([embedded.width, embedded.height]);
    out.drawPage(embedded, { x: 0, y: 0, width: embedded.width, height: embedded.height });
  }
  return savePdf(doc);
}

export async function nUp(
  file: DocInput,
  opts: Record<string, OptionValue>,
): Promise<Uint8Array> {
  const per = Math.max(1, Number(opts.per) || 2);
  const cols = per === 2 ? 2 : per === 4 ? 2 : per === 6 ? 3 : per === 9 ? 3 : 2;
  const rows = Math.ceil(per / cols);
  const [sw, sh] = pageSizeFor(String(opts.sheet || 'a4'), String(opts.orientation || 'auto'));
  const margin = Number(opts.margin ?? 18);
  const gap = Number(opts.gap ?? 8);
  const drawBorder = Boolean(opts.border);
  const src = await loadPdf(file.bytes, file.password);
  const doc = await PDFDocument.create();
  const pages = src.getPages();
  const cellW = (sw - margin * 2 - gap * (cols - 1)) / cols;
  const cellH = (sh - margin * 2 - gap * (rows - 1)) / rows;
  for (let i = 0; i < pages.length; i += per) {
    const sheet = doc.addPage([sw, sh]);
    for (let k = 0; k < per && i + k < pages.length; k++) {
      const embedded = await doc.embedPage(pages[i + k]);
      const col = k % cols;
      const row = Math.floor(k / cols);
      const scale = Math.min(cellW / embedded.width, cellH / embedded.height);
      const bw = embedded.width * scale;
      const bh = embedded.height * scale;
      const x = margin + col * (cellW + gap) + (cellW - bw) / 2;
      const y = sh - margin - (row + 1) * cellH - row * gap + (cellH - bh) / 2;
      sheet.drawPage(embedded, { x, y, width: bw, height: bh });
      if (drawBorder) {
        sheet.drawRectangle({ x, y, width: bw, height: bh, borderWidth: 0.5, borderColor: undefined, opacity: 0 });
      }
    }
  }
  return savePdf(doc);
}

export async function booklet(
  file: DocInput,
  opts: Record<string, OptionValue>,
): Promise<{ bytes: Uint8Array; sheets: number }> {
  const [sw, sh] = pageSizeFor(String(opts.sheet || 'a4'), 'landscape');
  const src = await loadPdf(file.bytes, file.password);
  const count = src.getPageCount();
  const padded = Math.ceil(count / 4) * 4;
  const doc = await PDFDocument.create();
  for (let start = 0; start < padded / 2; start += 2) {
    const sheet = doc.addPage([sw, sh]);
    // front side: outer last, outer first ; back side: inner left, inner right
    const sequence = [
      [padded - start, start + 1],
      [start + 2, padded - start - 1],
    ];
    let slot = 0;
    for (const pair of sequence) {
      for (const pageNo of pair) {
        if (pageNo > count) {
          slot++;
          continue;
        }
        const embedded = await doc.embedPage(src.getPages()[pageNo - 1]);
        const cellW = sw / 2;
        const scale = Math.min(cellW / embedded.width, sh / embedded.height);
        const bw = embedded.width * scale;
        const bh = embedded.height * scale;
        const x = slot % 2 === 0 ? 0 : cellW;
        sheet.drawPage(embedded, { x: x + (cellW - bw) / 2, y: (sh - bh) / 2, width: bw, height: bh });
        slot++;
      }
    }
  }
  return { bytes: await savePdf(doc), sheets: doc.getPageCount() };
}

export async function stampText(
  file: DocInput,
  text: string,
  opts: {
    pages: string;
    size: number;
    color: string;
    opacity: number;
    rotation: number;
    positions: string[];
    font?: 'regular' | 'bold';
    margin: number;
  },
): Promise<{ bytes: Uint8Array; pages: number }> {
  const doc = await loadPdf(file.bytes, file.password);
  const font = await embedForText(doc, text, opts.font === 'bold');
  const { hexToRgb } = await import('../../util');
  const rgb = hexToRgb(opts.color);
  const color = (await import('@cantoo/pdf-lib')).rgb(rgb.r, rgb.g, rgb.b);
  const all = doc.getPages();
  const indices = parsePageRanges(opts.pages, all.length);
  for (const i of indices) {
    const page = all[i];
    const { width: w, height: h } = page.getSize();
    const tw = font.widthOfTextAtSize(text, opts.size);
    const th = font.heightAtSize(opts.size);
    for (const pos of opts.positions) {
      let x = 0;
      let y = 0;
      if (pos.includes('left')) x = opts.margin;
      else if (pos.includes('right')) x = w - tw - opts.margin;
      else x = (w - tw) / 2;
      if (pos.includes('top')) y = h - th - opts.margin;
      else if (pos.includes('bottom')) y = opts.margin;
      else y = (h - th) / 2;
      page.drawText(text, {
        x,
        y,
        size: opts.size,
        font,
        color,
        opacity: opts.opacity,
        rotate: degrees(opts.rotation),
      });
    }
  }
  return { bytes: await savePdf(doc), pages: indices.length };
}
