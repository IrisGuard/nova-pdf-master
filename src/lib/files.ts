import { PDFDocument } from '@cantoo/pdf-lib';
import type { PdfFile } from './types';
import { actions, getState } from './store';
import { uid } from './util';

const IMAGE_MIME = /^image\/(png|jpe?g|webp|avif|gif|bmp)$/i;

export function isImageFile(file: File) {
  return IMAGE_MIME.test(file.type) || /\.(png|jpe?g|webp|avif|gif|bmp)$/i.test(file.name);
}

export function isPdfFile(file: File) {
  return file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
}

async function pageCountOf(bytes: Uint8Array, password?: string): Promise<{ pages: number; encrypted: boolean }> {
  try {
    const doc = await PDFDocument.load(bytes, { password, updateMetadata: false, throwOnInvalidObject: false, capNumbers: true });
    return { pages: doc.getPageCount(), encrypted: doc.isEncrypted };
  } catch (err) {
    const e = err as Error;
    if (/encrypt|password/i.test(e.name + ' ' + e.message)) {
      return { pages: 0, encrypted: true };
    }
    try {
      const pdfjs = await import('./pdf/render');
      const pdf = await pdfjs.openPdfjs(bytes, password);
      const pages = pdf.numPages;
      await pdfjs.closePdf(pdf);
      return { pages, encrypted: false };
    } catch (inner) {
      if (/password/i.test(String(inner))) return { pages: 0, encrypted: true };
      return { pages: 0, encrypted: false };
    }
  }
}

export async function buildFile(file: File): Promise<PdfFile | null> {
  if (!isPdfFile(file) && !isImageFile(file)) {
    actions.toast(`${file.name} is not a PDF or image`, 'error');
    return null;
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const isImage = isImageFile(file) && !isPdfFile(file);
  let pages = 1;
  let encrypted = false;
  let password: string | undefined;

  if (!isImage) {
    const probe = await pageCountOf(bytes);
    encrypted = probe.encrypted;
    pages = probe.pages;
    if (encrypted) {
      // Ask for the password immediately so every later tool can open the file.
      const pw = await actions.requestPassword(file.name);
      if (pw !== null) {
        password = pw;
        const again = await pageCountOf(bytes, pw);
        if (again.encrypted) {
          actions.toast(`Could not unlock ${file.name} — check the password`, 'error');
        } else {
          pages = again.pages;
          encrypted = false;
        }
      }
    }
  }

  return {
    id: uid('f'),
    name: file.name,
    bytes,
    size: bytes.byteLength,
    mime: isImage ? file.type || 'image/png' : 'application/pdf',
    pageCount: pages,
    encrypted,
    password,
    addedAt: Date.now(),
  };
}

export async function addFileList(list: FileList | File[]) {
  const files = Array.from(list);
  const accepted = files.filter((f) => isPdfFile(f) || isImageFile(f));
  if (!accepted.length) {
    actions.toast('Drop a PDF or an image (PNG, JPG, WebP, AVIF)', 'error');
    return;
  }
  const built: PdfFile[] = [];
  for (const f of accepted) {
    const b = await buildFile(f);
    if (b) built.push(b);
  }
  actions.addFiles(built);
  const pdfs = built.filter((b) => b.mime === 'application/pdf').length;
  if (built.length > 1) actions.toast(`Opened ${pdfs} PDF${pdfs === 1 ? '' : 's'}${built.length - pdfs ? ` and ${built.length - pdfs} image${built.length - pdfs === 1 ? '' : 's'}` : ''}`, 'success');
}

export function activeFile(): PdfFile | null {
  const s = getState();
  return s.files.find((f) => f.id === s.activeId) || s.files[0] || null;
}
