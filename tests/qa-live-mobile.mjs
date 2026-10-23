import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { PDFDocument, StandardFonts } from '@cantoo/pdf-lib';

const base = 'https://pdf.novaecosystem.live';
const tmp = path.join(process.cwd(), '.qa-tmp');
fs.mkdirSync(tmp, { recursive: true });

async function makePdf(name, text) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([420, 595]);
  page.drawText(text, { x: 40, y: 520, size: 20, font });
  const p = path.join(tmp, name);
  fs.writeFileSync(p, await doc.save());
  return p;
}
const a = await makePdf('qa-a.pdf', 'Document A');
const b = await makePdf('qa-b.pdf', 'Document B');

const browser = await chromium.launch({ channel: 'chrome' });
const ctx = await browser.newContext({ locale: 'en-US', acceptDownloads: true, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
const page = await ctx.newPage();
await page.goto(base + '/app/?tool=merge', { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);

const before = await page.evaluate(() => ({
  heading: document.querySelector('.tool-head h2, .tool-page h2, h2')?.textContent?.trim(),
  menu: (() => { const m = document.querySelector('.menu-btn'); return m ? getComputedStyle(m).display : 'missing'; })(),
  railHidden: (() => { const r = document.querySelector('.rail'); return r ? getComputedStyle(r).transform !== 'none' || r.getBoundingClientRect().right <= 1 : 'missing'; })(),
  horizontalOverflow: document.documentElement.scrollWidth - window.innerWidth,
}));
console.log('mobile before =', JSON.stringify(before));
await page.screenshot({ path: path.join(tmp, 'mobile-merge.png') });

// drawer navigation happens in a separate pass (see mobile-drawer proof)

await page.setInputFiles('input[type=file]', [a, b]);
await page.waitForTimeout(1800);
await page.locator('button.run-btn').first().click();
await page.waitForTimeout(4000);
const after = await page.evaluate(() => ({
  summary: [...document.querySelectorAll('.pill')].map((e) => e.textContent.trim()).slice(0, 4),
  result: (document.body.innerText.match(/Merged[^\n]*/) || [null])[0],
}));
console.log('mobile after run =', JSON.stringify(after));

const dlp = page.waitForEvent('download', { timeout: 30000 }).catch(() => null);
await page.locator('button[title="Download"]').first().click();
const dl = await dlp;
if (!dl) console.log('NO DOWNLOAD (mobile)');
else {
  const out = path.join(tmp, 'merged-mobile.pdf');
  await dl.saveAs(out);
  const doc = await PDFDocument.load(fs.readFileSync(out));
  console.log('mobile download =', dl.suggestedFilename(), 'pages =', doc.getPageCount());
}
await page.screenshot({ path: path.join(tmp, 'mobile-result.png') });
await browser.close();



