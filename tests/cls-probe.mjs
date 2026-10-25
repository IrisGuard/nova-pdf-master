// CLS attribution probe — records every layout shift with its source nodes.
import { chromium } from 'playwright-core';

const BASE = process.argv[2] || 'https://pdf.novaecosystem.live';
const LOCALE = process.argv[3] || 'en-US';
const browser = await chromium.launch({ channel: 'chrome' });
const ctx = await browser.newContext({ locale: LOCALE, viewport: { width: 412, height: 823 } });
const page = await ctx.newPage();

await page.addInitScript(() => {
  window.__cls = [];
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) {
      if (e.hadRecentInput) continue;
      const src = (e.sources || []).map((s) => {
        const n = s.node;
        if (!n) return { node: null };
        const el = n.nodeType === 1 ? n : n.parentElement;
        return {
          tag: el ? el.tagName : null,
          id: el ? el.id : null,
          cls: el ? String(el.className).slice(0, 80) : null,
          rect: s.currentRect ? { x: Math.round(s.currentRect.x), y: Math.round(s.currentRect.y), w: Math.round(s.currentRect.width), h: Math.round(s.currentRect.height) } : null,
          prev: s.previousRect ? { x: Math.round(s.previousRect.x), y: Math.round(s.previousRect.y), w: Math.round(s.previousRect.width), h: Math.round(s.previousRect.height) } : null,
          text: el ? (el.textContent || '').trim().slice(0, 60) : null,
        };
      });
      window.__cls.push({ value: e.value, t: Math.round(e.startTime), src });
    }
  }).observe({ type: 'layout-shift', buffered: true });
});

await page.goto(`${BASE}/`, { waitUntil: 'load' });
await page.waitForTimeout(1500);
await page.evaluate(() => window.scrollTo(0, 600));
await page.waitForTimeout(1200);
await page.evaluate(() => window.scrollTo(0, 1400));
await page.waitForTimeout(1200);
await page.evaluate(() => window.scrollTo(0, 0));
await page.waitForTimeout(800);

const shifts = await page.evaluate(() => window.__cls);
const total = shifts.reduce((s, x) => s + x.value, 0);
console.log(`CLS total = ${total.toFixed(4)} over ${shifts.length} shift(s)`);
for (const s of shifts) {
  console.log(`  +${s.value.toFixed(4)} @${s.t}ms`);
  for (const src of s.src) console.log('    ', JSON.stringify(src));
}

const lcp = await page.evaluate(() => {
  const e = performance.getEntriesByType('largest-contentful-paint');
  return e.length ? Math.round(e[e.length - 1].startTime) : null;
});
const fcp = await page.evaluate(() => Math.round(performance.getEntriesByName('first-contentful-paint')[0]?.startTime || 0));
console.log('FCP =', fcp, 'ms | LCP =', lcp, 'ms');
await browser.close();
