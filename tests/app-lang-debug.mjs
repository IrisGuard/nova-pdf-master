import { chromium } from 'playwright-core';
const browser = await chromium.launch({ channel: 'chrome' });
const ctx = await browser.newContext({ locale: 'el-GR', viewport: { width: 412, height: 823 } });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('pageerror', String(e).slice(0, 160)));
page.on('console', (m) => { if (m.type() === 'error') console.log('console', m.text().slice(0, 160)); });
page.on('requestfailed', (r) => console.log('reqfail', r.url().slice(0, 100)));
await page.goto('http://127.0.0.1:4311/app/', { waitUntil: 'domcontentloaded' });
for (const t of [1000, 2000, 3000, 5000, 8000]) {
  await page.waitForTimeout(t === 1000 ? 1000 : t - (t === 2000 ? 1000 : t === 3000 ? 2000 : t === 5000 ? 3000 : 5000));
  const s = await page.evaluate(() => ({
    lang: window.__novaGetLang ? window.__novaGetLang() : null,
    pending: document.documentElement.hasAttribute('data-nv-pending'),
    sample: (document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 80),
    greek: /[\u0386-\u03ce]{3,}/.test(document.body.innerText || ''),
  }));
  console.log(`t=${t}ms lang=${s.lang} pending=${s.pending} greek=${s.greek} :: ${s.sample}`);
}
await browser.close();
