import { chromium } from 'playwright-core';

const BASE = (process.argv[2] || 'https://pdf.novaecosystem.live').replace(/\/$/, '');
const browser = await chromium.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
const results = [];
const check = (n, ok, d = '') => { results.push({ n, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? ` — ${d}` : ''}`); };

const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

const attr = () => page.evaluate(() => document.documentElement.getAttribute('data-theme'));
const stored = () => page.evaluate(() => localStorage.getItem('nova-pdf-theme'));
const bodyBg = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);

// --- landing: default dark ---
await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
await page.locator('.nav').waitFor({ timeout: 20000 });
check('landing: theme button visible', await page.locator('#theme-btn').isVisible());
check('landing: defaults to dark (no light attr)', (await attr()) !== 'light', await attr());
const darkBg = await bodyBg();
check('landing: dark body background', /7, 8, 11|rgb\(7, 8, 11\)/.test(darkBg), darkBg);

// --- landing: toggle to light ---
await page.locator('#theme-btn').click();
await page.waitForTimeout(150);
check('landing: data-theme = light after click', (await attr()) === 'light', await attr());
check('landing: localStorage persisted light', (await stored()) === 'light', await stored());
const lightBg = await bodyBg();
check('landing: light body background', /243, 242, 236|rgb\(243, 242, 236\)/.test(lightBg), lightBg);
const themeColor = await page.evaluate(() => document.querySelector('meta[name="theme-color"]')?.getAttribute('content'));
check('landing: theme-color meta follows light', themeColor === '#f3f2ec', themeColor);
check('landing: sun hidden / moon shown in light', await page.locator('.theme-moon').isVisible());

// --- landing: survives reload ---
await page.reload({ waitUntil: 'networkidle' });
await page.locator('.nav').waitFor({ timeout: 20000 });
check('landing: light survives reload', (await attr()) === 'light', await attr());

// --- workbench: picks up the same light theme ---
await page.goto(`${BASE}/app/`, { waitUntil: 'networkidle' });
await page.locator('.topbar').waitFor({ timeout: 25000 });
await page.waitForTimeout(300);
check('workbench: synced to light', (await attr()) === 'light', await attr());
  const wbLightBg = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--bg').trim());
  check('workbench: light --bg variable', wbLightBg === '#f3f2ec', wbLightBg);
check('workbench: theme toggle visible', await page.locator('button[title="Toggle theme"]').isVisible());

// --- workbench: toggle back to dark ---
await page.locator('button[title="Toggle theme"]').click();
await page.waitForTimeout(150);
check('workbench: data-theme = dark after click', (await attr()) === 'dark', await attr());
check('workbench: localStorage persisted dark', (await stored()) === 'dark', await stored());

// --- landing: reflects dark again ---
await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
await page.locator('.nav').waitFor({ timeout: 20000 });
check('landing: reflects dark from workbench', (await attr()) === 'dark', await attr());

// --- responsive: theme button visible + no overflow on all breakpoints ---
for (const vp of [{ w: 390, h: 844, n: 'mobile 390' }, { w: 768, h: 1024, n: 'tablet 768' }, { w: 1280, h: 800, n: 'laptop 1280' }, { w: 1440, h: 900, n: 'desktop 1440' }]) {
  const p = await browser.newPage({ viewport: { width: vp.w, height: vp.h }, isMobile: vp.w < 500, hasTouch: vp.w < 500 });
  const errs = [];
  p.on('pageerror', (e) => errs.push(String(e)));
  await p.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await p.locator('.nav').waitFor({ timeout: 20000 });
  const ovf = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check(`landing ${vp.n}: no horizontal overflow`, ovf <= 0, `${ovf}px`);
  check(`landing ${vp.n}: theme button visible`, await p.locator('#theme-btn').isVisible());

  await p.goto(`${BASE}/app/`, { waitUntil: 'networkidle' });
  await p.locator('.topbar').waitFor({ timeout: 25000 });
  const ovf2 = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check(`app ${vp.n}: no horizontal overflow`, ovf2 <= 0, `${ovf2}px`);
  check(`app ${vp.n}: theme toggle visible`, await p.locator('button[title="Toggle theme"]').isVisible());
  check(`app ${vp.n}: no runtime errors`, errs.length === 0, errs.slice(0, 2).join(' | '));
  await p.close();
}

// --- PWA / icon assets resolve ---
for (const a of ['/favicon.svg', '/icon.svg', '/icon-maskable.svg', '/icon-192.png', '/icon-512.png', '/apple-touch-icon.png', '/manifest.webmanifest']) {
  const r = await page.request.get(`${BASE}${a}`);
  check(`asset 200: ${a}`, r.status() === 200, String(r.status()));
}
const man = await (await page.request.get(`${BASE}/manifest.webmanifest`)).json();
check('manifest: name present', !!man.name, man.name);
check('manifest: start_url /app/', man.start_url === '/app/', man.start_url);
check('manifest: has 192 + 512 + maskable icons', (man.icons || []).length >= 4, String((man.icons || []).length));

await context.close();
await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} PASS`);
process.exit(failed.length ? 1 : 0);
