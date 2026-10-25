// Pending-language gate: translated visits paint once, English visits are never held.
import { chromium } from 'playwright-core';

const BASE = process.argv[2] || 'http://127.0.0.1:4311';
const browser = await chromium.launch({ channel: 'chrome' });

async function probe(locale, path, label) {
  const ctx = await browser.newContext({ locale, viewport: { width: 412, height: 823 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 120)));
  const t0 = Date.now();
  await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' });
  const pendingAtStart = await page.evaluate(() => document.documentElement.hasAttribute('data-nv-pending'));
  await page.waitForTimeout(3000);
  const state = await page.evaluate(() => {
    const el = document.querySelector('main') || document.querySelector('#root');
    const cs = el ? getComputedStyle(el) : null;
    return {
      pending: document.documentElement.hasAttribute('data-nv-pending'),
      visible: cs ? cs.visibility : 'none',
      lang: window.__novaGetLang ? window.__novaGetLang() : null,
      text: (document.body.innerText || '').trim().slice(0, 90),
    };
  });
  const greek = /[\u0386-\u03ce]{3,}/.test(state.text);
  console.log(
    `${label} [${locale}] pending@start=${pendingAtStart} pending@3s=${state.pending} visibility=${state.visible} lang=${state.lang} greek=${greek} t=${Date.now() - t0}ms`,
  );
  console.log('   text:', state.text.replace(/\n/g, ' | '));
  if (errors.length) console.log('   errors:', errors.slice(0, 2));
  const ok = state.visible === 'visible' && (locale.startsWith('en') ? !greek : greek);
  console.log(`   ${ok ? 'PASS' : 'FAIL'}`);
  await ctx.close();
  return ok;
}

const results = [];
results.push(await probe('en-US', '/', 'landing'));
results.push(await probe('el-GR', '/', 'landing'));
results.push(await probe('de-DE', '/', 'landing'));
results.push(await probe('en-US', '/app/', 'workbench'));
results.push(await probe('el-GR', '/app/', 'workbench'));

await browser.close();
console.log(results.every(Boolean) ? 'ALL PASS' : 'SOME FAIL');
