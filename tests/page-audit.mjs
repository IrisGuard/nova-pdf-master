/**
 * Page-by-page audit: opens every tool in the live workbench as a user would,
 * records console/page errors, horizontal overflow, and any unexpected
 * near-white surface (paper previews excluded) that could read as a "white box".
 */
import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';

const BASE = (process.argv[2] || 'https://pdf.novaecosystem.live').replace(/\/$/, '');
const CHROME = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const OUT = 'tests/page-audit';
mkdirSync(OUT, { recursive: true });

const ALLOWED = /page-surface|page-canvas|page-overlay|result-preview|sig-pad|type-preview|thumb-paper|thumb\b|mock-page|page-shimmer|page-holder/;

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const report = [];
const failures = [];

async function openWorkbench() {
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + String(e).slice(0, 200)));
  await page.goto(`${BASE}/app/?hl=en`, { waitUntil: 'networkidle' });
  await page.locator('.rail').waitFor({ timeout: 30000 });
  await page.waitForTimeout(600);
  return { page, errors };
}

// 1. landing: scroll the whole page and check every section
{
  const { page, errors } = await openWorkbench();
  await page.goto(`${BASE}/?hl=en`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  const steps = Math.ceil(height / 700);
  for (let i = 0; i < steps; i++) {
    await page.evaluate((y) => window.scrollTo(0, y), i * 700);
    await page.waitForTimeout(220);
  }
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  const sections = await page.evaluate(() => document.querySelectorAll('main section, section').length);
  await page.screenshot({ path: `${OUT}/landing-full.png`, fullPage: true });
  report.push({ name: 'landing /', sections, scrollHeight: height, overflow, errors: errors.length });
  if (overflow > 0) failures.push(`landing: ${overflow}px horizontal overflow`);
  if (errors.length) failures.push(`landing: ${errors.length} console errors`);
  await page.close();
}

// 2. every tool with a document
{
  const { page, errors } = await openWorkbench();
  await page.getByRole('button', { name: 'Generate a sample PDF' }).click();
  await page.waitForTimeout(1600);
  const tools = await page.evaluate(() => Array.from(document.querySelectorAll('.rail-item')).map((b) => b.textContent.trim()));
  for (const tool of tools) {
    const before = errors.length;
    await page.locator('.rail-item', { hasText: tool }).first().click({ timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(700);
    const state = await page.evaluate((allowedSrc) => {
      const allowed = new RegExp(allowedSrc);
      const blocks = [];
      document.querySelectorAll('.tool-page *').forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.width < 120 || r.height < 120) return;
        const s = getComputedStyle(el);
        const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/.exec(s.backgroundColor);
        if (!m) return;
        const lum = (Number(m[1]) + Number(m[2]) + Number(m[3])) / 3;
        const a = m[4] === undefined ? 1 : Number(m[4]);
        const cls = (el.className || '').toString();
        if (lum > 228 && a > 0.8 && !allowed.test(cls)) {
          blocks.push({ cls: cls.slice(0, 50), bg: s.backgroundColor, rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)] });
        }
      });
      const doc = document.documentElement;
      return {
        blocks,
        overflow: doc.scrollWidth - window.innerWidth,
        title: document.querySelector('.tool-title')?.textContent?.trim() || '',
        runBtn: !!document.querySelector('.run-btn'),
        hasEditor: !!document.querySelector('.tool-page-body'),
      };
    }, ALLOWED.source);
    const shot = `${OUT}/tool-${String(report.length).padStart(2, '0')}-${tool.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.png`;
    await page.screenshot({ path: shot });
    report.push({ tool, ...state, newErrors: errors.slice(before) });
    if (!state.title) failures.push(`${tool}: no tool title rendered`);
    if (!state.hasEditor) failures.push(`${tool}: no tool body`);
    if (state.overflow > 0) failures.push(`${tool}: ${state.overflow}px horizontal overflow`);
    if (errors.length > before) failures.push(`${tool}: console errors ${errors.slice(before).join(' | ')}`);
    if (state.blocks.length) failures.push(`${tool}: unexpected white surface ${JSON.stringify(state.blocks)}`);
    await page.keyboard.press('Escape').catch(() => {});
    await page.waitForTimeout(250);
  }
  await page.close();
}

writeFileSync(`${OUT}/report.json`, JSON.stringify({ base: BASE, report, failures }, null, 1));
console.log(`\n=== PAGE AUDIT ${BASE} ===`);
for (const r of report) {
  if (r.tool) console.log(`  ${r.newErrors && r.newErrors.length ? 'WARN' : 'OK  '} ${r.tool}${r.blocks && r.blocks.length ? ' white=' + JSON.stringify(r.blocks) : ''}`);
  else console.log(`  ${r.errors ? 'WARN' : 'OK  '} landing sections=${r.sections} overflow=${r.overflow}px`);
}
console.log(`\nFAILURES: ${failures.length}`);
for (const f of failures) console.log('  ! ' + f);
console.log(`screenshots + report -> ${OUT}/`);
await browser.close();
