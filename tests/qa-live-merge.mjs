/**
 * NOVA PDF — live functional QA (desktop) against the deployed worker.
 *
 *   node tests/qa-live-merge.mjs
 *
 * Opens /app/?tool=merge through a deep link (the exact path the Owner reported
 * broken on mobile: the tool opened but the run produced nothing), uploads two
 * one-page PDFs, merges, downloads the result and asserts it really has 2 pages.
 * Needs Google Chrome installed (playwright-core channel: 'chrome').
 */
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { PDFDocument, StandardFonts } from '@cantoo/pdf-lib';

const base = process.env.NOVA_PDF_BASE || 'https://pdf.novaecosystem.live';
const tmp = path.join(process.cwd(), '.qa-tmp');
fs.mkdirSync(tmp, { recursive: true });

async function makePdf(name, text) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([420, 595]);
  page.drawText(text, { x: 40, y: 520, size: 20, font });
  const file = path.join(tmp, name);
  fs.writeFileSync(file, await doc.save());
  return file;
}

const a = await makePdf('qa-a.pdf', 'Document A');
const b = await makePdf('qa-b.pdf', 'Document B');

const browser = await chromium.launch({ channel: 'chrome' });
const ctx = await browser.newContext({ locale: 'en-US', acceptDownloads: true, viewport: { width: 1366, height: 900 } });
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 160)); });
page.on('pageerror', (e) => errors.push('pageerror ' + String(e).slice(0, 160)));

await page.goto(`${base}/app/?tool=merge`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1000);

const heading = await page.evaluate(() => document.querySelector('h2, h3')?.textContent?.trim() || '');
console.log('deep link opened tool =', heading);

await page.setInputFiles('input[type=file]', [a, b]);
await page.waitForTimeout(1800);

const summary = await page.evaluate(() => [...document.querySelectorAll('.pill')].map((e) => e.textContent.trim())[0]);
console.log('merge list =', summary);
if (!/^2 files/.test(summary || '')) throw new Error(`expected 2 selected files, got "${summary}"`);

await page.locator('button.run-btn').first().click();
await page.waitForTimeout(4000);

const result = await page.evaluate(() => (document.body.innerText.match(/Merged[^\n]*/) || [null])[0]);
console.log('result =', result);

const download = page.waitForEvent('download', { timeout: 30000 });
await page.locator('button[title="Download"]').first().click();
const dl = await download;
const out = path.join(tmp, 'merged.pdf');
await dl.saveAs(out);
const bytes = fs.readFileSync(out);
const doc = await PDFDocument.load(bytes);
console.log('download =', dl.suggestedFilename(), '| pages =', doc.getPageCount(), '| bytes =', bytes.length);
if (doc.getPageCount() !== 2) throw new Error(`merged PDF has ${doc.getPageCount()} pages, expected 2`);
console.log('console/page errors =', errors.length);
if (errors.length) throw new Error(errors.join(' | '));

await browser.close();
console.log('PASS — deep link, merge and download all work');
