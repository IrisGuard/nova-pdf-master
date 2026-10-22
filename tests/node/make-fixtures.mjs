import { PDFDocument, StandardFonts, rgb } from '@cantoo/pdf-lib';
import { mkdirSync, writeFileSync, copyFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, '..', 'fixtures');
mkdirSync(out, { recursive: true });

async function makeTextPdf(path, pages = 3, variant = false) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const invoice = variant ? 'Invoice 2026-0043 · Northwind Trading Ltd' : 'Invoice 2026-0042 · Northwind Trading Ltd';
  const amount = variant ? 'Amount: EUR 5,140.00 — due 15 December 2026.' : 'Amount: EUR 4,820.00 — due 30 November 2026.';
  for (let i = 1; i <= pages; i++) {
    const page = doc.addPage([595.28, 841.89]);
    page.drawText(`NOVA PDF test document — page ${i}`, {
      x: 56,
      y: 770,
      size: 22,
      font: bold,
      color: rgb(0.08, 0.09, 0.12),
    });
    page.drawText(invoice, {
      x: 56,
      y: 738,
      size: 11,
      font,
      color: rgb(0.3, 0.32, 0.36),
    });
    const lines = [
      'This document exists to exercise every local PDF operation.',
      'It contains selectable text, headings and several pages.',
      'Confidential client reference: ATLAS-7731.',
      'Αυτό το έγγραφο δοκιμάζει την τοπική επεξεργασία PDF.',
    ];
    lines.forEach((line, idx) => {
      page.drawText(line, { x: 56, y: 680 - idx * 22, size: 12, font, color: rgb(0.12, 0.13, 0.16) });
    });
    page.drawRectangle({ x: 56, y: 470, width: 480, height: 90, color: rgb(0.93, 0.95, 0.9) });
    if (variant) {
      // A visible revision mark, so the comparison tool has a large, obvious change.
      page.drawRectangle({ x: 56, y: 440, width: 480, height: 18, color: rgb(0.85, 0.12, 0.25) });
      page.drawText('REVISED — supersedes the previous issue', { x: 64, y: 445, size: 10, font: bold, color: rgb(1, 1, 1) });
    }
    page.drawText(`Section ${i}: summary`, { x: 72, y: 530, size: 14, font: bold, color: rgb(0.1, 0.12, 0.08) });
    page.drawText(amount, { x: 72, y: 500, size: 11, font, color: rgb(0.2, 0.22, 0.25) });
    page.drawText(`Page ${i} of ${pages}`, { x: 500, y: 40, size: 9, font, color: rgb(0.45, 0.47, 0.52) });
  }
  doc.setTitle('NOVA PDF test document');
  doc.setAuthor('Nova Ecosystem QA');
  doc.setSubject('Local PDF operation fixture');
  const bytes = await doc.save();
  writeFileSync(path, bytes);
}

async function makeFormPdf(path) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const page = doc.addPage([595.28, 841.89]);
  page.drawText('Client intake form', { x: 56, y: 770, size: 22, font: bold });
  page.drawText('Name', { x: 56, y: 700, size: 12, font });
  page.drawText('Company', { x: 56, y: 650, size: 12, font });
  const form = doc.getForm();
  const name = form.createTextField('fullname');
  name.addToPage(page, { x: 56, y: 670, width: 320, height: 24, borderWidth: 1, textColor: rgb(0.1, 0.1, 0.1) });
  const company = form.createTextField('company');
  company.addToPage(page, { x: 56, y: 620, width: 320, height: 24, borderWidth: 1, textColor: rgb(0.1, 0.1, 0.1) });
  const bytes = await doc.save();
  writeFileSync(path, bytes);
}

async function makeEncrypted(path) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([595.28, 841.89]);
  page.drawText('Confidential — protected with AES-256.', { x: 56, y: 760, size: 18, font });
  page.drawText('The password is secret123.', { x: 56, y: 730, size: 12, font });
  doc.encrypt({
    userPassword: 'secret123',
    ownerPassword: 'owner456',
    permissions: {
      printing: 'highResolution',
      modifying: false,
      copying: false,
      annotating: false,
      fillingForms: true,
      contentAccessibility: true,
      documentAssembly: false,
    },
  });
  const bytes = await doc.save();
  writeFileSync(path, bytes);
}

await makeTextPdf(join(out, 'fixture.pdf'), 3);
await makeTextPdf(join(out, 'fixture-v2.pdf'), 3, true);
await makeFormPdf(join(out, 'form.pdf'));
await makeEncrypted(join(out, 'encrypted.pdf'));
copyFileSync(join(here, '..', '..', 'public', 'icon-512.png'), join(out, 'image.png'));
console.log('fixtures ready at', out);
