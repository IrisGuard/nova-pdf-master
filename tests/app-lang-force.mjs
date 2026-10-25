import { chromium } from 'playwright-core';
const BASE = process.argv[2] || 'http://127.0.0.1:4311';
const browser = await chromium.launch({ channel: 'chrome' });
const ctx = await browser.newContext({ locale: 'el-GR', viewport: { width: 412, height: 823 } });
const page = await ctx.newPage();
const logs = [];
page.on('pageerror', (e) => logs.push('pageerror ' + String(e).slice(0, 200)));
page.on('console', (m) => { if (m.type() === 'error') logs.push('console ' + m.text().slice(0, 200)); });
await page.goto(`${BASE}/app/`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2500);
console.log('after load: lang=', await page.evaluate(() => window.__novaGetLang()), 'greek=', await page.evaluate(() => /[\u0386-\u03ce]{3,}/.test(document.body.innerText)));
// force a run by hand
await page.evaluate(() => window.__novaTranslate('el'));
await page.waitForTimeout(4000);
const st = await page.evaluate(() => ({
  lang: window.__novaGetLang(),
  greek: /[\u0386-\u03ce]{3,}/.test(document.body.innerText),
  sample: document.body.innerText.replace(/\s+/g, ' ').slice(0, 90),
  hidden: getComputedStyle(document.getElementById('root')).visibility,
}));
console.log('after manual el:', JSON.stringify(st));
console.log('logs:', logs.slice(0, 4));
await browser.close();
