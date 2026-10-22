import { PDFDocument, PDFFont, StandardFonts } from '@cantoo/pdf-lib';
import fontkit from '@pdf-lib/fontkit';

let regularCache: Uint8Array | null = null;
let boldCache: Uint8Array | null = null;

async function fetchFont(path: string): Promise<Uint8Array> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Font ${path} could not be loaded (${res.status})`);
  return new Uint8Array(await res.arrayBuffer());
}

/** Unicode font with Latin + Greek coverage, bundled with the app (SIL OFL). */
export async function loadNoto(weight: 'regular' | 'bold' = 'regular'): Promise<Uint8Array> {
  if (weight === 'bold') {
    if (!boldCache) boldCache = await fetchFont('/fonts/NotoSans-Bold.ttf');
    return boldCache;
  }
  if (!regularCache) regularCache = await fetchFont('/fonts/NotoSans-Regular.ttf');
  return regularCache;
}

export async function embedNoto(
  doc: PDFDocument,
  weight: 'regular' | 'bold' = 'regular',
): Promise<PDFFont> {
  doc.registerFontkit(fontkit as never);
  const bytes = await loadNoto(weight);
  // Full embedding: fontkit's TTF subsetter fails on current Noto/DejaVu builds.
  return doc.embedFont(bytes, { subset: false });
}

export async function embedStandardOrNoto(doc: PDFDocument, text: string): Promise<PDFFont> {
  // Standard Helvetica has no Greek/Cyrillic; use the embedded Unicode font when needed.
  if (/^[\x00-\xFF]*$/.test(text)) {
    return doc.embedFont(StandardFonts.Helvetica);
  }
  return embedNoto(doc, 'regular');
}

/** Helvetica for ASCII (tiny output), Noto for anything Unicode. */
export async function embedForText(
  doc: PDFDocument,
  text: string,
  bold = false,
): Promise<PDFFont> {
  if (/^[\x00-\xFF]*$/.test(text)) {
    return doc.embedFont(bold ? StandardFonts.HelveticaBold : StandardFonts.Helvetica);
  }
  return embedNoto(doc, bold ? 'bold' : 'regular');
}

export function wrapLines(
  text: string,
  font: PDFFont,
  size: number,
  maxWidth: number,
): string[] {
  const lines: string[] = [];
  const paragraphs = text.replace(/\r\n/g, '\n').split('\n');
  for (const paragraph of paragraphs) {
    if (!paragraph.trim()) {
      lines.push('');
      continue;
    }
    const words = paragraph.split(/(\s+)/);
    let line = '';
    for (const word of words) {
      if (!word) continue;
      const candidate = line + word;
      let width = 0;
      try {
        width = font.widthOfTextAtSize(candidate, size);
      } catch {
        width = candidate.length * size * 0.5;
      }
      if (width > maxWidth && line.trim()) {
        lines.push(line.trimEnd());
        line = word.trimStart();
      } else {
        line = candidate;
      }
    }
    if (line.trim()) lines.push(line.trimEnd());
  }
  return lines;
}
