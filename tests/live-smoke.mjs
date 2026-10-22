/**
 * Live smoke test against the deployed NOVA PDF surface.
 *   node tests/live-smoke.mjs https://pdf.novaecosystem.live
 */
import { chromium } from 'playwright-core';

const BASE = (process.argv[2] || 'https://pdf.novaecosystem.live').replace(/\/$/, '');
const CHROME = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
const page = await context.newPage();

const consoleErrors = [];
const pageErrors = [];
const external = new Set();
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', (e) => pageErrors.push(String(e)));
page.on('request', (r) => {
  const u = new URL(r.url());
  if (!/^https?:$/.test(u.protocol)) return;
  if (u.origin !== new URL(BASE).origin) external.add(u.origin);
});

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

async function waitRun() {
  await page.waitForSelector('.result-card, .result-error', { timeout: 180000 });
  const err = page.locator('.result-error');
  if (await err.count()) return { ok: false, detail: (await err.first().innerText()).trim() };
  const card = page.locator('.result-card').first();
  const detail = (await card.locator('.result-head').innerText()).trim().replace(/\s+/g, ' ');
  return { ok: true, detail };
}

async function openTool(name) {
  // The rail scrolls; bring the item into view first so the click is reliable
  // (Playwright does not always scroll nested flex containers in headless mode).
  await page.evaluate((n) => {
    const el = [...document.querySelectorAll('.rail-item')].find((e) => e.textContent.trim() === n);
    el?.scrollIntoView({ block: 'center' });
  }, name);
  await page.waitForTimeout(100);
  await page.locator('.rail-item', { hasText: name }).first().click({ timeout: 15000 });
  await page.locator('.tool-page').waitFor({ state: 'visible', timeout: 20000 });
}

async function runTool(name) {
  await openTool(name);
  await page.locator('.run-btn').click();
  return waitRun();
}

try {
  const res = await page.goto(`${BASE}/app/?hl=en`, { waitUntil: 'networkidle', timeout: 60000 });
  check('workbench responds 200', res.status() === 200, String(res.status()));
  await page.locator('.rail').waitFor({ timeout: 30000 });
  check('34 tools in the rail', (await page.locator('.rail-item').count()) === 34, String(await page.locator('.rail-item').count()));
  const rail = await page.evaluate(() => {
    const el = document.querySelector('.rail-scroll');
    return el ? { scrollable: el.scrollHeight > el.clientHeight, h: el.clientHeight, sh: el.scrollHeight, ov: getComputedStyle(el).overflowY } : null;
  });
  check('rail scrolls to reach every tool', Boolean(rail && rail.ov === 'auto'), JSON.stringify(rail));

  await page.getByRole('button', { name: 'Generate a sample PDF' }).click();
  await page.locator('.file-tab', { hasText: 'nova-pdf-sample.pdf' }).waitFor({ timeout: 30000 });
  await page.locator('canvas').first().waitFor({ timeout: 30000 });
  check('sample PDF renders', true);

  const pn = await runTool('Page numbers');
  check('Page numbers', pn.ok, pn.detail);
  const rot = await runTool('Rotate PDF');
  check('Rotate PDF', rot.ok, rot.detail);
  const txt = await runTool('PDF → text');
  check('PDF → text', txt.ok, txt.detail);
  await openTool('Document inspector');
  const hero = await page.locator('.info-hero').waitFor({ timeout: 30000 }).then(() => true).catch(() => false);
  const heroText = hero ? (await page.locator('.info-hero').innerText()).replace(/\s+/g, ' ').trim() : 'missing';
  check('Document inspector', hero, heroText);
  const ocr = await runTool('OCR — searchable PDF');
  check('OCR (local wasm)', ocr.ok, ocr.detail);

  const sw = await page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) return 'unsupported';
    const reg = await navigator.serviceWorker.getRegistration();
    return reg ? (reg.active ? 'active' : 'registered') : 'none';
  });
  check('service worker registered', sw === 'active' || sw === 'registered', sw);

  check('no console errors', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));
  check('no page errors', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));
  check('zero third-party requests', external.size === 0, [...external].join(', '));

  // ── offline: the workbench must load with the network switched off ──
  await page.waitForTimeout(2500);
  await context.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => undefined);
  const offlineOk = await page.locator('.rail').waitFor({ timeout: 30000 }).then(() => true).catch(() => false);
  check('workbench boots offline (service worker cache)', offlineOk);
  if (offlineOk) {
    const sample = await page.evaluate(() => document.querySelectorAll('.rail-item').length);
    check('offline rail is complete', sample === 34, String(sample));
  }
  await context.setOffline(false);
} catch (err) {
  check('smoke run completed', false, String(err).split('\n')[0]);
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.ok);
console.log('\n=== LIVE SMOKE SUMMARY ===');
console.log(`base ${BASE}`);
console.log(`passed ${results.length - failed.length} / ${results.length}`);
if (failed.length) for (const f of failed) console.log(` - ${f.name}${f.detail ? ` (${f.detail})` : ''}`);
process.exit(failed.length ? 1 : 0);
