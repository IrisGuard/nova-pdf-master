/**
 * Artifact proof: download the produced files from the live workbench and
 * validate the bytes ourselves (not just "a card appeared").
 *   node tests/artifacts.mjs https://pdf.novaecosystem.live
 */
import { chromium } from 'playwright-core';
import { PDFDocument } from '@cantoo/pdf-lib';
import JSZip from 'jszip';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = (process.argv[2] || 'https://pdf.novaecosystem.live').replace(/\/$/, '');
const here = dirname(fileURLToPath(import.meta.url));
const fixtures = join(here, 'fixtures');
const browser = await chromium.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1440, height: 900 } });
const page = await context.newPage();

const results = [];
const check = (n, ok, d = '') => { results.push({ n, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? ` — ${d}` : ''}`); };

async function openTool(name) {
  await page.evaluate((n) => {
    const el = [...document.querySelectorAll('.rail-item')].find((e) => e.textContent.trim() === n);
    el?.scrollIntoView({ block: 'center' });
  }, name);
  await page.waitForTimeout(80);
  await page.locator('.rail-item', { hasText: name }).first().click({ timeout: 15000 });
  await page.locator('.tool-page').waitFor({ state: 'visible', timeout: 15000 });
}

async function downloadFirst() {
  const dl = page.waitForEvent('download', { timeout: 60000 });
  await page.locator('.output-row').first().locator('button').first().click();
  const d = await dl;
  const stream = await d.createReadStream();
  const chunks = [];
  for await (const c of stream) chunks.push(c);
  return { name: d.suggestedFilename(), bytes: Buffer.concat(chunks) };
}

await page.goto(`${BASE}/app/?hl=en`, { waitUntil: 'networkidle' });
await page.locator('.rail').waitFor({ timeout: 30000 });
await page.setInputFiles('input.hidden-input', [join(fixtures, 'fixture.pdf'), join(fixtures, 'fixture-v2.pdf')]);
await page.waitForFunction(() => document.querySelectorAll('.file-tab:not(.add)').length >= 2, null, { timeout: 30000 });
await page.waitForTimeout(400);

// ── merge: 3 + 3 pages must reach the downloaded file ─────────────
await openTool('Merge PDFs');
await page.locator('.run-btn').click();
await page.waitForSelector('.result-card', { timeout: 120000 });
const merged = await downloadFirst();
const mergedDoc = await PDFDocument.load(merged.bytes);
check('merged download is a real 6-page PDF', mergedDoc.getPageCount() === 6, `${merged.name} · ${mergedDoc.getPageCount()} pages · ${merged.bytes.length} B`);
check('merged PDF keeps the page size', Math.round(mergedDoc.getPage(0).getWidth()) === 595, String(Math.round(mergedDoc.getPage(0).getWidth())));

// ── protect: the downloaded file must really be encrypted ────────
await openTool('Protect with password');
await page.locator('#opt-userPassword').fill('lapdf2026');
await page.locator('#opt-ownerPassword').fill('owner2026');
await page.locator('.run-btn').click();
await page.waitForSelector('.result-card', { timeout: 120000 });
const protectedFile = await downloadFirst();
let lockedWithoutPassword = false;
try {
  await PDFDocument.load(protectedFile.bytes, { throwOnInvalidObject: false });
} catch {
  lockedWithoutPassword = true;
}
check('protected download refuses to open without the password', lockedWithoutPassword, protectedFile.name);
const opened = await PDFDocument.load(protectedFile.bytes, { password: 'lapdf2026', throwOnInvalidObject: false });
check('protected download opens with the password', opened.getPageCount() === 3, `${opened.getPageCount()} pages`);

// ── text extraction: the downloaded text must contain the document words ──
await openTool('PDF → text');
await page.locator('.run-btn').click();
await page.waitForSelector('.result-card', { timeout: 120000 });
const text = await downloadFirst();
const body = text.bytes.toString('utf8');
check('PDF → text download contains the document text', /NOVA PDF test document/.test(body), `${text.name} · ${body.length} chars`);

// ── split: one ZIP, every entry a valid PDF ──────────────────────
await openTool('Split PDF');
await page.locator('.run-btn').click();
await page.waitForSelector('.result-card', { timeout: 120000 });
const summary = (await page.locator('.result-head').first().innerText()).replace(/\s+/g, ' ');
const zip = await downloadFirst();
const archive = await JSZip.loadAsync(zip.bytes);
const names = Object.keys(archive.files);
let valid = 0;
let totalPages = 0;
for (const n of names) {
  const bytes = await archive.files[n].async('uint8array');
  try {
    const d = await PDFDocument.load(bytes);
    valid++;
    totalPages += d.getPageCount();
  } catch {
    /* counted below */
  }
}
check('split ZIP holds one valid PDF per page', names.length === 3 && valid === 3 && totalPages === 3, `${names.length} entries · ${valid} valid · ${totalPages} pages · ${summary}`);

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n=== ARTIFACT SUMMARY ===\npassed ${results.length - failed.length} / ${results.length}`);
process.exit(failed.length ? 1 : 0);
