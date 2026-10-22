import JSZip from 'jszip';
import type { DocInput, OptionDef, OptionValue, PdfFile, ToolDef, ToolResult } from './types';
import { baseName, parsePageRanges, sanitizeName, uid } from './util';
import {
  booklet,
  cropDocument,
  extractPages,
  loadPdf,
  mergeDocs,
  nUp,
  out,
  pageSizeFor,
  rebuildOrganized,
  resizePages,
  rotatePages,
  savePdf,
  splitDoc,
} from './pdf/ops/organize';
import {
  applyAnnotations,
  editMetadata,
  flattenDocument,
  numbering,
  placeOnPages,
  watermark,
  type Placement,
  type Annotation,
} from './pdf/ops/edit';
import { fillForm, listFormFields } from './pdf/ops/forms';
import {
  imagesToPdf,
  pdfToImages,
  pdfToPdfA,
  pdfToStructured,
  pdfToText,
  textToHtml,
  textToMarkdown,
  textToPdf,
  zipEntries,
} from './pdf/ops/convert';
import { compressPdf, rasterize, repairPdf, sanitizePdf } from './pdf/ops/optimize';
import { protectPdf, redactPdf, unlockPdf, type RedactionBox } from './pdf/ops/secure';
import { compareDocuments, inspectDocument } from './pdf/ops/analyze';
import { ocrPdf } from './pdf/ops/ocr';
import { formatBytes } from './util';

const input = (f: PdfFile): DocInput => ({ name: f.name, bytes: f.bytes, password: f.password });

function pdfOutput(file: PdfFile, suffix: string, bytes: Uint8Array, tool: string) {
  return out(`${sanitizeName(file.name)}-${suffix}.pdf`, bytes, tool);
}

function jsonResult(data: unknown, name: string, tool: string) {
  return out(name, new TextEncoder().encode(JSON.stringify(data, null, 2)), tool, 'application/json');
}

function textResult(text: string, name: string, tool: string, mime = 'text/plain') {
  return out(name, new TextEncoder().encode(text), tool, mime);
}

function bytesOfOption(v: OptionValue | undefined): File | null {
  return v instanceof File ? v : null;
}

async function fileBytes(v: OptionValue | undefined): Promise<{ bytes: Uint8Array; mime: string; name: string } | null> {
  const f = bytesOfOption(v);
  if (!f) return null;
  return { bytes: new Uint8Array(await f.arrayBuffer()), mime: f.type || 'image/png', name: f.name };
}

const pagesOpt: OptionDef = {
  kind: 'pages',
  key: 'pages',
  label: 'Pages',
  def: 'all',
  hint: 'all · 1-3, 5 · 2-10 odd. Leave "all" for every page.',
};

/** Zip a list of per-file results, collapsing a single PDF. */
async function pack(entries: { name: string; bytes: Uint8Array; mime?: string }[], zipName: string, tool: string) {
  if (entries.length === 1) {
    const e = entries[0];
    return [out(e.name, e.bytes, tool, e.mime || 'application/pdf')];
  }
  const zip = new JSZip();
  for (const e of entries) zip.file(e.name, e.bytes);
  const bytes = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', compressionOptions: { level: 6 } });
  return [out(zipName, bytes, tool, 'application/zip')];
}

export const TOOLS: ToolDef[] = [
  // ────────────────────────────── ORGANISE ──────────────────────────────
  {
    id: 'merge',
    name: 'Merge PDFs',
    short: 'Combine files into one document, in the order you choose.',
    category: 'organize',
    accepts: 'pdf',
    minFiles: 2,
    editor: 'merge',
    run: async (files, _opts, ctx) => {
      const { bytes, pages } = await mergeDocs(
        files.map(input),
        undefined,
        { onProgress: ctx.onProgress, signal: ctx.signal },
      );
      return {
        outputs: [out(`nova-merged-${files.length}-files.pdf`, bytes, 'merge')],
        summary: `Merged ${files.length} files into ${pages} pages.`,
        stats: [
          { label: 'Pages', value: String(pages) },
          { label: 'Size', value: formatBytes(bytes.byteLength) },
        ],
      };
    },
  },
  {
    id: 'split',
    name: 'Split PDF',
    short: 'Break one document into ranges, fixed chunks, single pages or size-limited parts.',
    category: 'organize',
    accepts: 'pdf',
    batch: true,
    options: [
      {
        kind: 'select',
        key: 'mode',
        label: 'Split by',
        def: 'single',
        options: [
          { value: 'ranges', label: 'Page ranges' },
          { value: 'every', label: 'Every N pages' },
          { value: 'single', label: 'One file per page' },
          { value: 'size', label: 'Maximum file size' },
        ],
      },
      { kind: 'text', key: 'ranges', label: 'Ranges', def: '1-2', hint: 'Comma-separated groups become separate files.' },
      { kind: 'number', key: 'every', label: 'Pages per file', def: 2, min: 1, max: 500 },
      { kind: 'number', key: 'targetMb', label: 'Target size', def: 5, min: 0.2, max: 500, step: 0.1, suffix: 'MB' },
    ],
    run: async (files, opts, ctx) => {
      const entries: { name: string; bytes: Uint8Array }[] = [];
      let total = 0;
      for (const file of files) {
        if (ctx.signal.aborted) throw new DOMException('Cancelled', 'AbortError');
        const { entries: parts, totalPages } = await splitDoc(input(file), opts, ctx);
        total += totalPages;
        entries.push(...parts);
      }
      const outputs = await pack(entries, `${sanitizeName(files[0].name)}-split.zip`, 'split');
      return {
        outputs,
        summary: `Split ${files.length} file${files.length > 1 ? 's' : ''} into ${entries.length} documents (${total} pages).`,
        stats: [
          { label: 'Documents', value: String(entries.length) },
          { label: 'Pages', value: String(total) },
        ],
      };
    },
  },
  {
    id: 'organize',
    name: 'Organise pages',
    short: 'Reorder, rotate, duplicate or delete pages with live thumbnails.',
    category: 'organize',
    accepts: 'pdf',
    editor: 'organize',
    run: async (files, opts) => {
      const input = files[0];
      let plan = (opts.plan as unknown as { source: number; page: number; rotate: number; id: string }[]) || [];
      if (!plan.length) {
        const count = Math.max(1, input.pageCount || 1);
        plan = Array.from({ length: count }, (_, i) => ({ source: i, page: i, rotate: 0, id: `auto-${i}` }));
      }
      const { bytes, pages } = await rebuildOrganized({ name: input.name, bytes: input.bytes, password: input.password }, plan);
      return {
        outputs: [pdfOutput(files[0], 'organised', bytes, 'organize')],
        summary: `${pages} pages saved in the new order.`,
        stats: [{ label: 'Pages', value: String(pages) }, { label: 'Size', value: formatBytes(bytes.byteLength) }],
      };
    },
  },
  {
    id: 'rotate',
    name: 'Rotate PDF',
    short: 'Turn all or selected pages by 90°, 180° or 270°.',
    category: 'organize',
    accepts: 'pdf',
    batch: true,
    options: [
      pagesOpt,
      { kind: 'select', key: 'angle', label: 'Rotation', def: '90', options: [
        { value: '90', label: '90° clockwise' },
        { value: '180', label: '180°' },
        { value: '270', label: '270° clockwise (90° counter-clockwise)' },
      ] },
    ],
    run: async (files, opts, ctx) => {
      const entries: { name: string; bytes: Uint8Array }[] = [];
      let pages = 0;
      for (const f of files) {
        ctx.onProgress(entries.length / files.length, f.name);
        const r = await rotatePages(input(f), String(opts.pages || 'all'), Number(opts.angle));
        pages += r.pages;
        entries.push({ name: `${sanitizeName(f.name)}-rotated.pdf`, bytes: r.bytes });
      }
      const outputs = await pack(entries, `nova-rotated.zip`, 'rotate');
      return { outputs, summary: `Rotated ${pages} pages.`, stats: [{ label: 'Pages', value: String(pages) }] };
    },
  },
  {
    id: 'extract',
    name: 'Extract pages',
    short: 'Keep only the pages you need in a clean new PDF.',
    category: 'organize',
    accepts: 'pdf',
    batch: true,
    options: [pagesOpt],
    run: async (files, opts, ctx) => {
      const entries: { name: string; bytes: Uint8Array }[] = [];
      for (let i = 0; i < files.length; i++) {
        ctx.onProgress(i / files.length, files[i].name);
        const f = files[i];
        const src = await loadPdf(f.bytes, f.password);
        const indices = parsePageRanges(String(opts.pages || 'all'), src.getPageCount());
        const bytes = await extractPages(input(f), indices);
        entries.push({ name: `${sanitizeName(f.name)}-extracted.pdf`, bytes });
      }
      const outputs = await pack(entries, 'nova-extracted.zip', 'extract');
      return { outputs, summary: `Extracted pages from ${files.length} file${files.length > 1 ? 's' : ''}.` };
    },
  },
  {
    id: 'crop',
    name: 'Crop / trim',
    short: 'Cut margins away and resize the page to the remaining content.',
    category: 'organize',
    accepts: 'pdf',
    batch: true,
    options: [
      { kind: 'number', key: 'top', label: 'Top', def: 10, min: 0, max: 500, suffix: 'mm' },
      { kind: 'number', key: 'right', label: 'Right', def: 10, min: 0, max: 500, suffix: 'mm' },
      { kind: 'number', key: 'bottom', label: 'Bottom', def: 10, min: 0, max: 500, suffix: 'mm' },
      { kind: 'number', key: 'left', label: 'Left', def: 10, min: 0, max: 500, suffix: 'mm' },
    ],
    run: async (files, opts, ctx) => {
      const entries: { name: string; bytes: Uint8Array }[] = [];
      for (let i = 0; i < files.length; i++) {
        ctx.onProgress(i / files.length, files[i].name);
        const f = files[i];
        const bytes = await cropDocument(
          input(f),
          { top: Number(opts.top), right: Number(opts.right), bottom: Number(opts.bottom), left: Number(opts.left) },
          'mm',
        );
        entries.push({ name: `${sanitizeName(f.name)}-cropped.pdf`, bytes });
      }
      return { outputs: await pack(entries, 'nova-cropped.zip', 'crop'), summary: `Cropped ${files.length} document${files.length > 1 ? 's' : ''}.` };
    },
  },
  {
    id: 'resize',
    name: 'Resize pages',
    short: 'Fit pages to A4, Letter, A3 and more without stretching the content.',
    category: 'organize',
    accepts: 'pdf',
    batch: true,
    options: [
      { kind: 'select', key: 'size', label: 'Page size', def: 'a4', options: [
        { value: 'a4', label: 'A4 (210 × 297 mm)' },
        { value: 'a3', label: 'A3 (297 × 420 mm)' },
        { value: 'a5', label: 'A5 (148 × 210 mm)' },
        { value: 'letter', label: 'US Letter' },
        { value: 'legal', label: 'US Legal' },
      ] },
      { kind: 'select', key: 'orientation', label: 'Orientation', def: 'auto', options: [
        { value: 'auto', label: 'As defined by the size' },
        { value: 'portrait', label: 'Portrait' },
        { value: 'landscape', label: 'Landscape' },
      ] },
      { kind: 'select', key: 'fit', label: 'Scaling', def: 'fit', options: [
        { value: 'fit', label: 'Fit — whole page visible' },
        { value: 'fill', label: 'Fill — cover the page (may clip)' },
        { value: 'stretch', label: 'Stretch — fill exactly' },
      ] },
      { kind: 'number', key: 'margin', label: 'Margin', def: 0, min: 0, max: 100, suffix: 'pt' },
    ],
    run: async (files, opts, ctx) => {
      const [w, h] = pageSizeFor(String(opts.size), String(opts.orientation));
      const entries: { name: string; bytes: Uint8Array }[] = [];
      for (let i = 0; i < files.length; i++) {
        ctx.onProgress(i / files.length, files[i].name);
        const bytes = await resizePages(input(files[i]), w, h, String(opts.fit) as 'fit', Number(opts.margin));
        entries.push({ name: `${sanitizeName(files[i].name)}-${opts.size}.pdf`, bytes });
      }
      return { outputs: await pack(entries, 'nova-resized.zip', 'resize'), summary: `Resized ${files.length} document${files.length > 1 ? 's' : ''}.` };
    },
  },
  {
    id: 'nup',
    name: 'Multiple pages per sheet',
    short: 'Print 2, 4, 6 or 9 pages on one sheet with clean gutters.',
    category: 'organize',
    accepts: 'pdf',
    batch: true,
    options: [
      { kind: 'select', key: 'per', label: 'Pages per sheet', def: '2', options: [
        { value: '2', label: '2-up' },
        { value: '4', label: '4-up' },
        { value: '6', label: '6-up' },
        { value: '9', label: '9-up' },
      ] },
      { kind: 'select', key: 'sheet', label: 'Sheet size', def: 'a4', options: [
        { value: 'a4', label: 'A4' },
        { value: 'a3', label: 'A3' },
        { value: 'letter', label: 'US Letter' },
      ] },
      { kind: 'select', key: 'orientation', label: 'Sheet orientation', def: 'auto', options: [
        { value: 'auto', label: 'Standard' },
        { value: 'landscape', label: 'Landscape' },
      ] },
      { kind: 'number', key: 'margin', label: 'Margin', def: 18, min: 0, max: 80, suffix: 'pt' },
      { kind: 'number', key: 'gap', label: 'Gap', def: 8, min: 0, max: 40, suffix: 'pt' },
    ],
    run: async (files, opts, ctx) => {
      const entries: { name: string; bytes: Uint8Array }[] = [];
      for (let i = 0; i < files.length; i++) {
        ctx.onProgress(i / files.length, files[i].name);
        const bytes = await nUp(input(files[i]), opts);
        entries.push({ name: `${sanitizeName(files[i].name)}-${opts.per}up.pdf`, bytes });
      }
      return { outputs: await pack(entries, 'nova-nup.zip', 'nup'), summary: `${opts.per} pages per sheet.` };
    },
  },
  {
    id: 'booklet',
    name: 'Booklet imposition',
    short: 'Turn a document into saddle-stitch booklet sheets, ready for double-sided printing.',
    category: 'organize',
    accepts: 'pdf',
    batch: true,
    options: [
      { kind: 'select', key: 'sheet', label: 'Sheet size', def: 'a4', options: [
        { value: 'a4', label: 'A4 landscape' },
        { value: 'a3', label: 'A3 landscape' },
        { value: 'letter', label: 'US Letter landscape' },
      ] },
    ],
    run: async (files, opts, ctx) => {
      const entries: { name: string; bytes: Uint8Array }[] = [];
      let sheets = 0;
      for (let i = 0; i < files.length; i++) {
        ctx.onProgress(i / files.length, files[i].name);
        const r = await booklet(input(files[i]), opts);
        sheets += r.sheets;
        entries.push({ name: `${sanitizeName(files[i].name)}-booklet.pdf`, bytes: r.bytes });
      }
      return {
        outputs: await pack(entries, 'nova-booklet.zip', 'booklet'),
        summary: `${sheets} imposed sheets. Print double-sided, flip on the short edge.`,
        stats: [{ label: 'Sheets', value: String(sheets) }],
      };
    },
  },

  // ────────────────────────────── EDIT ──────────────────────────────
  {
    id: 'watermark',
    name: 'Watermark',
    short: 'Stamp text or a logo across every page, with tiling, rotation and opacity.',
    category: 'edit',
    accepts: 'pdf',
    batch: true,
    options: [
      { kind: 'select', key: 'mode', label: 'Type', def: 'text', options: [
        { value: 'text', label: 'Text' },
        { value: 'image', label: 'Image / logo' },
      ] },
      { kind: 'text', key: 'text', label: 'Watermark text', def: 'CONFIDENTIAL' },
      { kind: 'file', key: 'image', label: 'Logo', accept: 'image/png,image/jpeg', hint: 'PNG keeps transparency.' },
      pagesOpt,
      { kind: 'number', key: 'size', label: 'Font size', def: 54, min: 6, max: 300, suffix: 'pt' },
      { kind: 'color', key: 'color', label: 'Colour', def: '#ff3b5c' },
      { kind: 'range', key: 'opacity', label: 'Opacity', def: 0.18, min: 0.02, max: 1, step: 0.02 },
      { kind: 'number', key: 'rotation', label: 'Rotation', def: 45, min: -180, max: 180, suffix: '°' },
      { kind: 'check', key: 'tile', label: 'Tile across the page', def: false },
      { kind: 'range', key: 'scale', label: 'Image scale', def: 0.5, min: 0.1, max: 1, step: 0.05 },
      { kind: 'check', key: 'bold', label: 'Bold text', def: true },
    ],
    run: async (files, opts, ctx) => {
      const img = await fileBytes(opts.image);
      const entries: { name: string; bytes: Uint8Array }[] = [];
      let pages = 0;
      for (let i = 0; i < files.length; i++) {
        ctx.onProgress(i / files.length, files[i].name);
        const r = await watermark(input(files[i]), {
          mode: String(opts.mode) as 'text',
          text: String(opts.text || ''),
          imageBytes: img?.bytes,
          imageMime: img?.mime,
          pages: String(opts.pages || 'all'),
          size: Number(opts.size),
          color: String(opts.color),
          opacity: Number(opts.opacity),
          rotation: Number(opts.rotation),
          tile: Boolean(opts.tile),
          scale: Number(opts.scale),
          bold: Boolean(opts.bold),
        });
        pages += r.pages;
        entries.push({ name: `${sanitizeName(files[i].name)}-watermarked.pdf`, bytes: r.bytes });
      }
      return { outputs: await pack(entries, 'nova-watermarked.zip', 'watermark'), summary: `Watermarked ${pages} pages.` };
    },
  },
  {
    id: 'pagenumbers',
    name: 'Page numbers',
    short: 'Add clean page numbers anywhere on the page, with your own format.',
    category: 'edit',
    accepts: 'pdf',
    batch: true,
    options: [
      { kind: 'text', key: 'format', label: 'Format', def: '{page} / {total}', hint: 'Tokens: {page} {total} {title} {file} {date}' },
      pagesOpt,
      { kind: 'number', key: 'startAt', label: 'Start at', def: 1, min: 0, max: 10000 },
      { kind: 'number', key: 'size', label: 'Font size', def: 10, min: 6, max: 48, suffix: 'pt' },
      { kind: 'color', key: 'color', label: 'Colour', def: '#3a3f4a' },
      { kind: 'select', key: 'position', label: 'Alignment', def: 'center', options: [
        { value: 'left', label: 'Left' },
        { value: 'center', label: 'Centre' },
        { value: 'right', label: 'Right' },
      ] },
      { kind: 'number', key: 'margin', label: 'Margin', def: 28, min: 6, max: 120, suffix: 'pt' },
      { kind: 'check', key: 'bold', label: 'Bold', def: false },
    ],
    run: async (files, opts, ctx) => {
      const entries: { name: string; bytes: Uint8Array }[] = [];
      let pages = 0;
      for (let i = 0; i < files.length; i++) {
        ctx.onProgress(i / files.length, files[i].name);
        const r = await numbering(input(files[i]), {
          mode: 'page',
          format: String(opts.format),
          pages: String(opts.pages || 'all'),
          start: 1,
          startAt: Number(opts.startAt),
          size: Number(opts.size),
          color: String(opts.color),
          margin: Number(opts.margin),
          position: String(opts.position) as 'center',
          bold: Boolean(opts.bold),
        });
        pages += r.pages;
        entries.push({ name: `${sanitizeName(files[i].name)}-numbered.pdf`, bytes: r.bytes });
      }
      return { outputs: await pack(entries, 'nova-numbered.zip', 'pagenumbers'), summary: `Numbered ${pages} pages.` };
    },
  },
  {
    id: 'headerfooter',
    name: 'Header & footer',
    short: 'Add running headers and footers with title, date and page tokens.',
    category: 'edit',
    accepts: 'pdf',
    batch: true,
    options: [
      { kind: 'select', key: 'mode', label: 'Placement', def: 'footer', options: [
        { value: 'header', label: 'Header' },
        { value: 'footer', label: 'Footer' },
      ] },
      { kind: 'text', key: 'format', label: 'Text', def: '{title} · {page}/{total}', hint: 'Tokens: {page} {total} {title} {file} {date} {time}' },
      pagesOpt,
      { kind: 'number', key: 'size', label: 'Font size', def: 9, min: 6, max: 32, suffix: 'pt' },
      { kind: 'color', key: 'color', label: 'Colour', def: '#6b7280' },
      { kind: 'select', key: 'position', label: 'Alignment', def: 'center', options: [
        { value: 'left', label: 'Left' },
        { value: 'center', label: 'Centre' },
        { value: 'right', label: 'Right' },
      ] },
      { kind: 'number', key: 'margin', label: 'Margin', def: 24, min: 6, max: 100, suffix: 'pt' },
      { kind: 'check', key: 'bold', label: 'Bold', def: false },
    ],
    run: async (files, opts, ctx) => {
      const entries: { name: string; bytes: Uint8Array }[] = [];
      for (let i = 0; i < files.length; i++) {
        ctx.onProgress(i / files.length, files[i].name);
        const r = await numbering(input(files[i]), {
          mode: String(opts.mode) as 'header',
          format: String(opts.format),
          pages: String(opts.pages || 'all'),
          start: 1,
          startAt: 1,
          size: Number(opts.size),
          color: String(opts.color),
          margin: Number(opts.margin),
          position: String(opts.position) as 'center',
          bold: Boolean(opts.bold),
        });
        entries.push({ name: `${sanitizeName(files[i].name)}-${opts.mode}.pdf`, bytes: r.bytes });
      }
      return { outputs: await pack(entries, 'nova-header-footer.zip', 'headerfooter'), summary: `Added ${opts.mode} to ${files.length} file(s).` };
    },
  },
  {
    id: 'bates',
    name: 'Bates numbering',
    short: 'Legal-style sequential stamps with a custom prefix and digit count.',
    category: 'edit',
    accepts: 'pdf',
    batch: true,
    options: [
      { kind: 'text', key: 'prefix', label: 'Prefix', def: 'NOVA-' },
      { kind: 'number', key: 'digits', label: 'Digits', def: 6, min: 1, max: 12 },
      { kind: 'number', key: 'startAt', label: 'Start number', def: 1, min: 0, max: 10000000 },
      pagesOpt,
      { kind: 'number', key: 'size', label: 'Font size', def: 10, min: 6, max: 40, suffix: 'pt' },
      { kind: 'color', key: 'color', label: 'Colour', def: '#111111' },
      { kind: 'select', key: 'position', label: 'Alignment', def: 'right', options: [
        { value: 'left', label: 'Left' },
        { value: 'center', label: 'Centre' },
        { value: 'right', label: 'Right' },
      ] },
      { kind: 'number', key: 'margin', label: 'Margin', def: 24, min: 6, max: 100, suffix: 'pt' },
    ],
    run: async (files, opts, ctx) => {
      const entries: { name: string; bytes: Uint8Array }[] = [];
      let n = Number(opts.startAt);
      for (let i = 0; i < files.length; i++) {
        ctx.onProgress(i / files.length, files[i].name);
        const r = await numbering(input(files[i]), {
          mode: 'bates',
          format: '',
          pages: String(opts.pages || 'all'),
          start: 1,
          startAt: n,
          size: Number(opts.size),
          color: String(opts.color),
          margin: Number(opts.margin),
          position: String(opts.position) as 'right',
          bold: false,
          prefix: String(opts.prefix),
          digits: Number(opts.digits),
        });
        n += r.pages;
        entries.push({ name: `${sanitizeName(files[i].name)}-bates.pdf`, bytes: r.bytes });
      }
      return { outputs: await pack(entries, 'nova-bates.zip', 'bates'), summary: `Stamped ${files.length} file(s).` };
    },
  },
  {
    id: 'sign',
    name: 'Sign & stamp',
    short: 'Draw, type or upload a signature and place it exactly where it belongs.',
    category: 'edit',
    accepts: 'pdf',
    editor: 'sign',
    run: async (files, opts) => {
      const placements = (opts.placements as unknown as Placement[]) || [];
      if (!placements.length) throw new Error('Place at least one signature or stamp');
      const r = await placeOnPages(input(files[0]), placements);
      return {
        outputs: [pdfOutput(files[0], 'signed', r.bytes, 'sign')],
        summary: `Placed ${r.count} element${r.count > 1 ? 's' : ''}.`,
      };
    },
  },
  {
    id: 'annotate',
    name: 'Annotate & mark up',
    short: 'Add text, highlights, boxes and freehand notes on any page.',
    category: 'edit',
    accepts: 'pdf',
    editor: 'annotate',
    run: async (files, opts) => {
      const annotations = (opts.annotations as unknown as Annotation[]) || [];
      if (!annotations.length) throw new Error('Add at least one annotation');
      const r = await applyAnnotations(input(files[0]), annotations);
      return {
        outputs: [pdfOutput(files[0], 'annotated', r.bytes, 'annotate')],
        summary: `Applied ${r.count} annotation${r.count > 1 ? 's' : ''}.`,
      };
    },
  },
  {
    id: 'forms',
    name: 'Fill forms',
    short: 'Detect AcroForm fields, fill them and optionally flatten the result.',
    category: 'edit',
    accepts: 'pdf',
    editor: 'forms',
    run: async (files, opts) => {
      const values = (opts.values as unknown as Record<string, string>) || {};
      const r = await fillForm(input(files[0]), values, Boolean(opts.flatten));
      return {
        outputs: [pdfOutput(files[0], 'filled', r.bytes, 'forms')],
        summary: `Filled ${r.filled} field${r.filled === 1 ? '' : 's'}.`,
      };
    },
  },
  {
    id: 'metadata',
    name: 'Metadata',
    short: 'Read and rewrite title, author, subject, keywords and producer.',
    category: 'edit',
    accepts: 'pdf',
    editor: 'metadata',
    run: async (files, opts) => {
      const r = await editMetadata(input(files[0]), (opts.fields as unknown as Record<string, string>) || {}, Boolean(opts.removeAll));
      return {
        outputs: [pdfOutput(files[0], 'metadata', r.bytes, 'metadata')],
        summary: opts.removeAll ? 'All document metadata removed.' : 'Metadata updated.',
      };
    },
  },
  {
    id: 'clean',
    name: 'Clean & repair',
    short: 'Flatten forms, strip hidden data or rebuild a damaged PDF.',
    category: 'edit',
    accepts: 'pdf',
    batch: true,
    options: [
      { kind: 'select', key: 'mode', label: 'Action', def: 'flatten', options: [
        { value: 'flatten', label: 'Flatten forms & annotations' },
        { value: 'sanitize', label: 'Sanitize hidden data' },
        { value: 'repair', label: 'Repair structure' },
      ] },
    ],
    run: async (files, opts, ctx) => {
      const entries: { name: string; bytes: Uint8Array }[] = [];
      const notes: string[] = [];
      for (let i = 0; i < files.length; i++) {
        ctx.onProgress(i / files.length, files[i].name);
        const f = input(files[i]);
        if (opts.mode === 'sanitize') {
          const r = await sanitizePdf(f);
          notes.push(`${files[i].name}: removed ${r.removed.join(', ')}`);
          entries.push({ name: `${sanitizeName(files[i].name)}-clean.pdf`, bytes: r.bytes });
        } else if (opts.mode === 'repair') {
          const r = await repairPdf(f);
          notes.push(`${files[i].name}: rebuilt ${r.pages} pages`);
          entries.push({ name: `${sanitizeName(files[i].name)}-repaired.pdf`, bytes: r.bytes });
        } else {
          const r = await flattenDocument(f);
          notes.push(`${files[i].name}: flattened ${r.fields} fields`);
          entries.push({ name: `${sanitizeName(files[i].name)}-flat.pdf`, bytes: r.bytes });
        }
      }
      return { outputs: await pack(entries, 'nova-clean.zip', 'clean'), summary: notes.join(' · ') };
    },
  },

  // ────────────────────────────── CONVERT ──────────────────────────────
  {
    id: 'pdf-to-images',
    name: 'PDF → images',
    short: 'Export pages as crisp PNG, JPEG or WebP at up to 600 DPI.',
    category: 'convert',
    accepts: 'pdf',
    batch: true,
    options: [
      { kind: 'select', key: 'format', label: 'Format', def: 'png', options: [
        { value: 'png', label: 'PNG — lossless' },
        { value: 'jpeg', label: 'JPEG — small' },
        { value: 'webp', label: 'WebP — modern' },
      ] },
      { kind: 'select', key: 'dpi', label: 'Resolution', def: '150', options: [
        { value: '72', label: '72 DPI — screen preview' },
        { value: '150', label: '150 DPI — documents' },
        { value: '200', label: '200 DPI — sharp' },
        { value: '300', label: '300 DPI — print' },
        { value: '600', label: '600 DPI — archive' },
      ] },
      { kind: 'range', key: 'quality', label: 'JPEG / WebP quality', def: 0.9, min: 0.3, max: 1, step: 0.02 },
      pagesOpt,
      { kind: 'check', key: 'grayscale', label: 'Grayscale', def: false },
    ],
    run: async (files, opts, ctx) => {
      const all: { name: string; bytes: Uint8Array }[] = [];
      for (let i = 0; i < files.length; i++) {
        const entries = await pdfToImages(
          input(files[i]),
          {
            format: String(opts.format) as 'png',
            dpi: Number(opts.dpi),
            quality: Number(opts.quality),
            pages: String(opts.pages || 'all'),
            grayscale: Boolean(opts.grayscale),
          },
          (n, m) => ctx.onProgress((i + n) / files.length, m),
          ctx.signal,
        );
        all.push(...entries);
      }
      const mime = opts.format === 'png' ? 'image/png' : opts.format === 'jpeg' ? 'image/jpeg' : 'image/webp';
      const outputs = await pack(all, `${sanitizeName(files[0].name)}-images.zip`, 'pdf-to-images');
      for (const o of outputs) if (outputs.length > 1) o.mime = mime;
      return {
        outputs,
        summary: `Exported ${all.length} page${all.length > 1 ? 's' : ''}.`,
        stats: [
          { label: 'Images', value: String(all.length) },
          { label: 'Resolution', value: `${opts.dpi} DPI` },
        ],
      };
    },
  },
  {
    id: 'images-to-pdf',
    name: 'Images → PDF',
    short: 'Combine JPG, PNG, WebP or AVIF photos into a polished PDF.',
    category: 'convert',
    accepts: 'images',
    options: [
      { kind: 'select', key: 'size', label: 'Page size', def: 'a4', options: [
        { value: 'a4', label: 'A4' },
        { value: 'a3', label: 'A3' },
        { value: 'letter', label: 'US Letter' },
      ] },
      { kind: 'select', key: 'orientation', label: 'Orientation', def: 'auto', options: [
        { value: 'auto', label: 'Standard' },
        { value: 'portrait', label: 'Portrait' },
        { value: 'landscape', label: 'Landscape' },
      ] },
      { kind: 'select', key: 'fit', label: 'Scaling', def: 'contain', options: [
        { value: 'contain', label: 'Fit inside the page' },
        { value: 'fill', label: 'Cover the page' },
        { value: 'stretch', label: 'Stretch to the page' },
      ] },
      { kind: 'number', key: 'margin', label: 'Margin', def: 24, min: 0, max: 200, suffix: 'pt' },
      { kind: 'check', key: 'sameSize', label: 'Page size follows each image (ignores page size)', def: false },
    ],
    run: async (files, opts, ctx) => {
      const images = files
        .filter((f) => /^image\//.test(f.mime))
        .map((f) => ({ name: f.name, bytes: f.bytes, mime: f.mime }));
      if (!images.length) throw new Error('Drop image files (JPG, PNG, WebP or AVIF) to build a PDF');
      const bytes = await imagesToPdf(images, opts, ctx.onProgress, ctx.signal);
      return {
        outputs: [out(`nova-images-${images.length}.pdf`, bytes, 'images-to-pdf')],
        summary: `${images.length} image${images.length > 1 ? 's' : ''} → one PDF.`,
        stats: [{ label: 'Images', value: String(images.length) }, { label: 'Size', value: formatBytes(bytes.byteLength) }],
      };
    },
  },
  {
    id: 'pdf-to-text',
    name: 'PDF → text',
    short: 'Pull out the real text layer, page by page, with layout kept.',
    category: 'convert',
    accepts: 'pdf',
    batch: true,
    options: [
      { kind: 'check', key: 'perPage', label: 'Label each page', def: true },
    ],
    run: async (files, opts, ctx) => {
      const entries: { name: string; bytes: Uint8Array; mime?: string }[] = [];
      for (let i = 0; i < files.length; i++) {
        ctx.onProgress(i / files.length, files[i].name);
        const { text } = await pdfToText(input(files[i]), Boolean(opts.perPage));
        entries.push({ name: `${baseName(files[i].name)}.txt`, bytes: new TextEncoder().encode(text), mime: 'text/plain' });
      }
      const outputs = await pack(entries, 'nova-text.zip', 'pdf-to-text');
      return { outputs, summary: `Text extracted from ${files.length} file${files.length > 1 ? 's' : ''}.` };
    },
  },
  {
    id: 'pdf-to-html',
    name: 'PDF → HTML',
    short: 'A clean, self-contained HTML reading page for every PDF page.',
    category: 'convert',
    accepts: 'pdf',
    batch: true,
    run: async (files, opts, ctx) => {
      const entries: { name: string; bytes: Uint8Array; mime?: string }[] = [];
      for (let i = 0; i < files.length; i++) {
        ctx.onProgress(i / files.length, files[i].name);
        const { pages } = await pdfToText(input(files[i]), false);
        entries.push({ name: `${baseName(files[i].name)}.html`, bytes: new TextEncoder().encode(textToHtml(pages)), mime: 'text/html' });
      }
      const outputs = await pack(entries, 'nova-html.zip', 'pdf-to-html');
      return { outputs, summary: `HTML built for ${files.length} file${files.length > 1 ? 's' : ''}.` };
    },
  },
  {
    id: 'pdf-to-markdown',
    name: 'PDF → Markdown',
    short: 'Turn the text layer into clean Markdown with page markers.',
    category: 'convert',
    accepts: 'pdf',
    batch: true,
    run: async (files, opts, ctx) => {
      const entries: { name: string; bytes: Uint8Array; mime?: string }[] = [];
      for (let i = 0; i < files.length; i++) {
        ctx.onProgress(i / files.length, files[i].name);
        const { pages } = await pdfToText(input(files[i]), false);
        entries.push({
          name: `${baseName(files[i].name)}.md`,
          bytes: new TextEncoder().encode(textToMarkdown(pages, baseName(files[i].name))),
          mime: 'text/markdown',
        });
      }
      return { outputs: await pack(entries, 'nova-markdown.zip', 'pdf-to-markdown'), summary: `Markdown built for ${files.length} file(s).` };
    },
  },
  {
    id: 'pdf-to-json',
    name: 'PDF → JSON',
    short: 'Structured pages, sizes, metadata and text for your own pipeline.',
    category: 'convert',
    accepts: 'pdf',
    batch: true,
    run: async (files, opts, ctx) => {
      const entries: { name: string; bytes: Uint8Array; mime?: string }[] = [];
      for (let i = 0; i < files.length; i++) {
        ctx.onProgress(i / files.length, files[i].name);
        const data = await pdfToStructured(input(files[i]));
        entries.push({
          name: `${baseName(files[i].name)}.json`,
          bytes: new TextEncoder().encode(JSON.stringify(data, null, 2)),
          mime: 'application/json',
        });
      }
      return { outputs: await pack(entries, 'nova-json.zip', 'pdf-to-json'), summary: `JSON built for ${files.length} file(s).` };
    },
  },
  {
    id: 'text-to-pdf',
    name: 'Text / Markdown → PDF',
    short: 'Typeset notes or Markdown into a real PDF with Unicode and Greek support.',
    category: 'convert',
    accepts: 'none',
    options: [
      { kind: 'textarea', key: 'text', label: 'Your text', def: '', placeholder: '# Title\n\nWrite or paste Markdown here…', rows: 10 },
      { kind: 'text', key: 'title', label: 'Cover title', def: '' },
      { kind: 'select', key: 'pageSize', label: 'Page size', def: 'a4', options: [
        { value: 'a4', label: 'A4' },
        { value: 'letter', label: 'US Letter' },
        { value: 'a5', label: 'A5' },
      ] },
      { kind: 'select', key: 'orientation', label: 'Orientation', def: 'portrait', options: [
        { value: 'portrait', label: 'Portrait' },
        { value: 'landscape', label: 'Landscape' },
      ] },
      { kind: 'number', key: 'fontSize', label: 'Font size', def: 11, min: 6, max: 28, suffix: 'pt' },
      { kind: 'number', key: 'lineHeight', label: 'Line height', def: 1.55, min: 1.05, max: 2.4, step: 0.05 },
      { kind: 'number', key: 'margin', label: 'Margin', def: 64, min: 18, max: 160, suffix: 'pt' },
      { kind: 'select', key: 'font', label: 'Typeface', def: 'sans', options: [
        { value: 'sans', label: 'Sans (Unicode / Greek)' },
        { value: 'serif', label: 'Serif' },
        { value: 'mono', label: 'Monospace' },
      ] },
      { kind: 'check', key: 'numbers', label: 'Add page numbers', def: true },
    ],
    run: async (files, opts, ctx) => {
      let text = String(opts.text || '');
      if (!text.trim() && files.length) {
        text = new TextDecoder().decode(files[0].bytes);
      }
      if (!text.trim()) throw new Error('Type or paste some text first');
      ctx.onProgress(0.3, 'Typesetting');
      const r = await textToPdf(text, {
        pageSize: String(opts.pageSize),
        orientation: String(opts.orientation) as 'portrait',
        margin: Number(opts.margin),
        fontSize: Number(opts.fontSize),
        lineHeight: Number(opts.lineHeight),
        font: String(opts.font) as 'sans',
        numbers: Boolean(opts.numbers),
        title: String(opts.title || ''),
      });
      return {
        outputs: [out(`${sanitizeName(String(opts.title || 'nova-document'))}.pdf`, r.bytes, 'text-to-pdf')],
        summary: `${r.pages} pages typeset.`,
        stats: [{ label: 'Pages', value: String(r.pages) }, { label: 'Size', value: formatBytes(r.bytes.byteLength) }],
      };
    },
  },
  {
    id: 'pdf-to-pdfa',
    name: 'Convert to PDF/A',
    short: 'Long-term archive conformance with embedded metadata (PDF/A-2b).',
    category: 'convert',
    accepts: 'pdf',
    batch: true,
    options: [
      { kind: 'select', key: 'conformance', label: 'Conformance', def: '2B', options: [
        { value: '2B', label: 'PDF/A-2b — basic' },
        { value: '3B', label: 'PDF/A-3b — basic, allows attachments' },
      ] },
    ],
    run: async (files, opts, ctx) => {
      const entries: { name: string; bytes: Uint8Array }[] = [];
      for (let i = 0; i < files.length; i++) {
        ctx.onProgress(i / files.length, files[i].name);
        const bytes = await pdfToPdfA(input(files[i]), String(opts.conformance));
        entries.push({ name: `${sanitizeName(files[i].name)}-pdfa.pdf`, bytes });
      }
      return { outputs: await pack(entries, 'nova-pdfa.zip', 'pdf-to-pdfa'), summary: `Converted ${files.length} file(s) to PDF/A-${opts.conformance}.` };
    },
  },

  // ────────────────────────────── OPTIMISE ──────────────────────────────
  {
    id: 'compress',
    name: 'Compress PDF',
    short: 'Shrink scans and image-heavy files, or rewrite text PDFs losslessly.',
    category: 'optimize',
    accepts: 'pdf',
    batch: true,
    options: [
      { kind: 'select', key: 'mode', label: 'Method', def: 'raster', options: [
        { value: 'raster', label: 'Recompress images (best for scans)' },
        { value: 'lossless', label: 'Rewrite structure (text PDFs)' },
      ] },
      { kind: 'select', key: 'dpi', label: 'Render resolution', def: '150', options: [
        { value: '96', label: '96 DPI — smallest' },
        { value: '120', label: '120 DPI — email' },
        { value: '150', label: '150 DPI — balanced' },
        { value: '200', label: '200 DPI — sharp' },
        { value: '300', label: '300 DPI — print' },
      ] },
      { kind: 'range', key: 'quality', label: 'Image quality', def: 0.7, min: 0.35, max: 0.95, step: 0.01 },
      { kind: 'check', key: 'grayscale', label: 'Grayscale', def: false },
      { kind: 'check', key: 'stripMetadata', label: 'Remove metadata', def: true },
      { kind: 'check', key: 'stripAnnotations', label: 'Remove annotations & comments', def: false },
    ],
    run: async (files, opts, ctx) => {
      const entries: { name: string; bytes: Uint8Array }[] = [];
      let before = 0;
      let after = 0;
      let unchanged = 0;
      for (let i = 0; i < files.length; i++) {
        const r = await compressPdf(input(files[i]), opts, (n, m) => ctx.onProgress((i + n) / files.length, m), ctx.signal);
        // Never hand back a bigger file: keep the original bytes when recompression loses.
        const keepOriginal = r.bytes.byteLength >= files[i].bytes.byteLength;
        const bytes = keepOriginal ? files[i].bytes : r.bytes;
        before += files[i].bytes.byteLength;
        after += bytes.byteLength;
        unchanged += keepOriginal ? 1 : 0;
        entries.push({ name: `${sanitizeName(files[i].name)}-compressed.pdf`, bytes });
      }
      const saved = before ? 1 - after / before : 0;
      return {
        outputs: await pack(entries, 'nova-compressed.zip', 'compress'),
        summary: saved > 0.001
          ? `Saved ${(saved * 100).toFixed(1)}% — ${formatBytes(before)} → ${formatBytes(after)}.`
          : `Already optimised — no smaller encoding found for ${unchanged || files.length} file(s).`,
        stats: [
          { label: 'Before', value: formatBytes(before) },
          { label: 'After', value: formatBytes(after) },
          { label: 'Savings', value: `${(saved * 100).toFixed(1)}%` },
        ],
      };
    },
  },
  {
    id: 'grayscale',
    name: 'Grayscale PDF',
    short: 'Flatten colour to neutral grey — smaller files, calmer printouts.',
    category: 'optimize',
    accepts: 'pdf',
    batch: true,
    options: [
      { kind: 'select', key: 'dpi', label: 'Resolution', def: '150', options: [
        { value: '120', label: '120 DPI' },
        { value: '150', label: '150 DPI' },
        { value: '200', label: '200 DPI' },
        { value: '300', label: '300 DPI' },
      ] },
      { kind: 'range', key: 'quality', label: 'Quality', def: 0.8, min: 0.4, max: 0.95, step: 0.01 },
    ],
    run: async (files, opts, ctx) => {
      const entries: { name: string; bytes: Uint8Array }[] = [];
      for (let i = 0; i < files.length; i++) {
        const r = await rasterize(input(files[i]), Number(opts.dpi), Number(opts.quality), true, (n, m) => ctx.onProgress((i + n) / files.length, m), ctx.signal);
        entries.push({ name: `${sanitizeName(files[i].name)}-grey.pdf`, bytes: r.bytes });
      }
      return { outputs: await pack(entries, 'nova-grayscale.zip', 'grayscale'), summary: `Grayscale applied to ${files.length} file(s).` };
    },
  },
  {
    id: 'ocr',
    name: 'OCR — searchable PDF',
    short: 'Turn scans into text you can search, copy and select. Runs on your device.',
    category: 'extract',
    accepts: 'pdf',
    options: [
      { kind: 'multi', key: 'langs', label: 'Languages', def: ['eng'], options: [
        { value: 'eng', label: 'English' },
        { value: 'ell', label: 'Greek' },
        { value: 'deu', label: 'German' },
        { value: 'fra', label: 'French' },
        { value: 'spa', label: 'Spanish' },
        { value: 'ita', label: 'Italian' },
        { value: 'por', label: 'Portuguese' },
        { value: 'nld', label: 'Dutch' },
      ] },
      { kind: 'select', key: 'dpi', label: 'Scan resolution', def: '300', options: [
        { value: '200', label: '200 DPI — fast' },
        { value: '300', label: '300 DPI — recommended' },
        { value: '400', label: '400 DPI — small print' },
      ] },
    ],
    run: async (files, opts, ctx) => {
      const r = await ocrPdf(
        input(files[0]),
        { langs: (opts.langs as string[]) || ['eng'], dpi: Number(opts.dpi), keepImages: true },
        ctx.onProgress,
        ctx.signal,
      );
      return {
        outputs: [
          out(`${sanitizeName(files[0].name)}-searchable.pdf`, r.bytes, 'ocr'),
          textResult(r.text, `${baseName(files[0].name)}-ocr.txt`, 'ocr'),
        ],
        summary: `OCR complete — ${r.pages} pages, ${Math.round(r.confidence * 100)}% average confidence.`,
        stats: [
          { label: 'Pages', value: String(r.pages) },
          { label: 'Confidence', value: `${Math.round(r.confidence * 100)}%` },
          { label: 'Characters', value: r.text.length.toLocaleString() },
        ],
      };
    },
  },

  // ────────────────────────────── SECURE ──────────────────────────────
  {
    id: 'protect',
    name: 'Protect with password',
    short: 'AES-256 encryption with granular print, copy and edit permissions.',
    category: 'secure',
    accepts: 'pdf',
    batch: true,
    options: [
      { kind: 'password', key: 'userPassword', label: 'Open password', def: '', placeholder: 'Required to open the PDF' },
      { kind: 'password', key: 'ownerPassword', label: 'Owner password', def: '', placeholder: 'Optional — grants full access' },
      { kind: 'check', key: 'allowPrinting', label: 'Allow printing', def: true },
      { kind: 'check', key: 'highQualityPrint', label: 'Allow high-quality printing', def: false },
      { kind: 'check', key: 'allowCopying', label: 'Allow copying text', def: false },
      { kind: 'check', key: 'allowModifying', label: 'Allow editing content', def: false },
      { kind: 'check', key: 'allowAnnotating', label: 'Allow annotations', def: false },
      { kind: 'check', key: 'allowForms', label: 'Allow form filling', def: true },
      { kind: 'check', key: 'allowAssembly', label: 'Allow page assembly', def: false },
    ],
    run: async (files, opts, ctx) => {
      const entries: { name: string; bytes: Uint8Array }[] = [];
      for (let i = 0; i < files.length; i++) {
        ctx.onProgress(i / files.length, files[i].name);
        const bytes = await protectPdf(input(files[i]), {
          userPassword: String(opts.userPassword || ''),
          ownerPassword: String(opts.ownerPassword || ''),
          allowPrinting: Boolean(opts.allowPrinting),
          allowCopying: Boolean(opts.allowCopying),
          allowModifying: Boolean(opts.allowModifying),
          allowAnnotating: Boolean(opts.allowAnnotating),
          allowForms: Boolean(opts.allowForms),
          allowAssembly: Boolean(opts.allowAssembly),
          highQualityPrint: Boolean(opts.highQualityPrint),
        });
        entries.push({ name: `${sanitizeName(files[i].name)}-protected.pdf`, bytes });
      }
      return { outputs: await pack(entries, 'nova-protected.zip', 'protect'), summary: `Encrypted with AES-256 (${files.length} file(s)).` };
    },
  },
  {
    id: 'unlock',
    name: 'Remove password',
    short: 'Unlock a PDF you own by entering its password; saves an unencrypted copy.',
    category: 'secure',
    accepts: 'pdf',
    options: [
      { kind: 'password', key: 'password', label: 'Current password', def: '', placeholder: 'The password that opens the file' },
    ],
    run: async (files, opts) => {
      const file = files[0];
      const password = String(opts.password || file.password || '');
      const r = await unlockPdf(input(file), password);
      return {
        outputs: [pdfOutput(file, 'unlocked', r.bytes, 'unlock')],
        summary: 'Password removed. The new file opens without a prompt.',
      };
    },
  },
  {
    id: 'redact',
    name: 'Redact',
    short: 'Black out sensitive areas — the hidden text is physically removed, not just covered.',
    category: 'secure',
    accepts: 'pdf',
    editor: 'redact',
    run: async (files, opts) => {
      const boxes = (opts.boxes as unknown as RedactionBox[]) || [];
      const r = await redactPdf(input(files[0]), boxes, Number(opts.dpi ?? 200), () => undefined, new AbortController().signal);
      return {
        outputs: [pdfOutput(files[0], 'redacted', r.bytes, 'redact')],
        summary: `${r.boxes} area${r.boxes > 1 ? 's' : ''} permanently removed across ${r.pages} pages.`,
        stats: [{ label: 'Areas', value: String(r.boxes) }, { label: 'Pages', value: String(r.pages) }],
      };
    },
  },

  // ────────────────────────────── EXTRACT / INSPECT ──────────────────────────────
  {
    id: 'info',
    name: 'Document inspector',
    short: 'Pages, sizes, fonts, metadata, scripts and attachments at a glance.',
    category: 'extract',
    accepts: 'pdf',
    editor: 'info',
    run: async (files) => {
      const info = await inspectDocument(input(files[0]));
      return { outputs: [], summary: `${info.pages} pages · ${formatBytes(info.size)}`, stats: [] };
    },
  },
  {
    id: 'compare',
    name: 'Compare versions',
    short: 'See exactly what changed between two PDFs, page by page.',
    category: 'extract',
    accepts: 'pdf',
    minFiles: 2,
    editor: 'compare',
    run: async (files, opts, ctx) => {
      if (files.length < 2) throw new Error('Open two PDFs to compare');
      const r = await compareDocuments(input(files[0]), input(files[1]), Number(opts.dpi ?? 110), ctx.onProgress, ctx.signal);
      return {
        outputs: [textResult(r.reportHtml, `comparison-${baseName(files[0].name)}-vs-${baseName(files[1].name)}.html`, 'compare', 'text/html')],
        summary: `${(r.overall * 100).toFixed(2)}% pixel similarity across ${r.pages.length} pages.`,
        stats: [
          { label: 'Similarity', value: `${(r.overall * 100).toFixed(2)}%` },
          { label: 'Pages', value: String(r.pages.length) },
        ],
        preview: r.pages[0]?.preview,
      };
    },
  },
];

export const TOOL_MAP = new Map(TOOLS.map((t) => [t.id, t]));

export function defaultOptions(tool: ToolDef): Record<string, OptionValue> {
  const o: Record<string, OptionValue> = {};
  for (const def of tool.options || []) {
    if (def.kind === 'file') {
      o[def.key] = '';
      continue;
    }
    o[def.key] = def.def as OptionValue;
  }
  return o;
}

export const CATEGORY_LABELS: Record<string, string> = {
  organize: 'Organise',
  edit: 'Edit',
  convert: 'Convert',
  optimize: 'Optimise',
  secure: 'Secure',
  extract: 'Extract & inspect',
};
