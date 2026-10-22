import { chromium } from 'playwright-core';
const BASE = (process.argv[2] || 'https://pdf.novaecosystem.live').replace(/\/$/, '');
const browser = await chromium.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
const results = [];
const check = (n, ok, d = '') => { results.push({ n, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? ` — ${d}` : ''}`); };

for (const vp of [{ w: 390, h: 844, name: 'iPhone 390' }, { w: 768, h: 1024, name: 'tablet 768' }, { w: 1024, h: 768, name: 'small laptop 1024' }]) {
  const page = await browser.newPage({ viewport: { width: vp.w, height: vp.h }, isMobile: vp.w < 500, hasTouch: vp.w < 500 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`${BASE}/app/?hl=en`, { waitUntil: 'networkidle' });
  await page.locator('.topbar').waitFor({ timeout: 20000 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check(`${vp.name}: no horizontal overflow`, overflow <= 0, `${overflow}px`);
  check(`${vp.name}: no runtime errors`, errors.length === 0, errors.slice(0, 2).join(' | '));

  // the palette is the mobile tool picker
  const cmd = page.locator('.cmd-btn');
  check(`${vp.name}: tool search button visible`, await cmd.isVisible());
  await cmd.click();
  await page.locator('.palette').waitFor({ timeout: 10000 });
  const count = await page.locator('.palette-item').count();
  check(`${vp.name}: palette lists tools`, count > 20, `${count} entries`);
  await page.locator('.palette-input input').fill('watermark');
  await page.waitForTimeout(200);
  const first = page.locator('.palette-item').first();
  await first.click();
  await page.locator('.tool-page').waitFor({ state: 'visible', timeout: 15000 });
  const title = (await page.locator('.tool-page h2, .tool-page h1').first().innerText().catch(() => '')).trim();
  check(`${vp.name}: a tool opens from the palette`, /watermark/i.test(title) || title.length > 0, title);
  await page.getByRole('button', { name: 'Generate a sample PDF' }).click().catch(() => undefined);
  await page.waitForTimeout(1200);
  const overflow2 = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check(`${vp.name}: still no overflow with a document`, overflow2 <= 0, `${overflow2}px`);
  await page.close();
}

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n=== MOBILE SUMMARY ===\npassed ${results.length - failed.length} / ${results.length}`);
process.exit(failed.length ? 1 : 0);
