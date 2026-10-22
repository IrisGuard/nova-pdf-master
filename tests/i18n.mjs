/**
 * §0n multilingual audit — NOVA PDF must be fully translated into every Google
 * language, client-side and free, with the fixed dropdown order (English,
 * Ελληνικά, then alphabetical) and a working search field.
 *
 * Run: node tests/i18n.mjs [baseUrl]
 * The default target is the real public domain, which is the only surface the
 * Owner accepts as proof.
 */
import { chromium } from 'playwright-core';

const BASE = (process.argv[2] || 'https://pdf.novaecosystem.live').replace(/\/$/, '');
const CHROME = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const results = [];
const check = (n, ok, d = '') => {
  results.push({ n, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? ` — ${d}` : ''}`);
};

const SCRIPT = {
  el: /[\u0386-\u03ce]{3,}/,
  ar: /[\u0600-\u06ff]{3,}/,
  'zh-CN': /[\u4e00-\u9fff]{2,}/,
  ja: /[\u3040-\u30ff\u4e00-\u9fff]{2,}/,
  ru: /[\u0400-\u04ff]{3,}/,
  hi: /[\u0900-\u097f]{3,}/,
  de: /\b(und|der|die|das|mit|für|ohne|werkzeuge|seite|datei)\b/i,
  es: /\b(y|para|sin|herramientas|página|archivo)\b/i,
  fr: /\b(et|pour|sans|outils|page|fichier)\b/i,
  pt: /\b(e|para|sem|ferramentas|página|arquivo)\b/i,
  it: /\b(e|per|senza|strumenti|pagina|file)\b/i,
};

const browser = await chromium.launch({ executablePath: CHROME, headless: true });

/** Every block gets its own context so localStorage never leaks between them. */
async function newPage(opts = {}) {
  const ctx = await browser.newContext({
    viewport: opts.viewport || { width: 1440, height: 960 },
    locale: opts.locale || 'en-US',
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.errors = errors;
  return page;
}

const text = async (page, selector) =>
  (await page.locator(selector).first().innerText()).replace(/\s+/g, ' ').trim();

const bodyText = async (page) => (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ').trim();

const words = (s) => (s.match(/[\p{L}]{2,}/gu) || []).map((w) => w.toLowerCase());
/** How many words in `b` do not appear in `a` — a translation always brings new ones. */
const newWords = (a, b) => {
  const seen = new Set(words(a));
  return words(b).filter((w) => !seen.has(w)).length;
};

async function waitTranslated(page, code) {
  await page.waitForFunction(
    (c) => document.documentElement.getAttribute('lang') === c && window.__novaGetLang() === c,
    code,
    { timeout: 60000 },
  );
}

/** The lang attribute flips before the network round-trips finish; wait for real text. */
async function waitChanged(page, selector, old) {
  try {
    await page.waitForFunction(
      ([sel, prev]) => {
        const el = document.querySelector(sel);
        if (!el) return false;
        return el.innerText.replace(/\s+/g, ' ').trim() !== prev;
      },
      [selector, old],
      { timeout: 60000 },
    );
    return true;
  } catch {
    return false;
  }
}

/* ------------------------------------------- auto-detect from the browser */
{
  const EN_H1 = 'Every PDF tool. Zero uploads.';
  const page = await newPage({ locale: 'de-DE' });
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await waitTranslated(page, 'de');
  const changed = await waitChanged(page, '.hero h1', EN_H1);
  const heading = await text(page, '.hero h1');
  check(
    'a German-locale visitor is translated without touching the control',
    changed && newWords(EN_H1, heading) >= 2,
    heading.slice(0, 60),
  );
  await page.context().close();
}

/* ---------------------------------------------------------------- landing */
{
  const page = await newPage();
  await page.goto(`${BASE}/?hl=en`, { waitUntil: 'domcontentloaded' });
  await page.locator('#nova-lang-slot .nv-lang').waitFor({ timeout: 20000 });

  const list = await page.evaluate(() => window.__novaLangList());
  check('109 protocol languages are offered', list.length === 109, `${list.length} codes`);
  check('English is first', list[0][0] === 'en', list[0] && list[0][1]);
  check('Ελληνικά is second', list[1][0] === 'el', list[1] && list[1][1]);

  const options = await page.locator('[data-nova-lang-option]').count();
  check('109 options are in the DOM', options === 109, `${options} buttons`);

  const label = (await page.locator('#nova-lang-slot summary').innerText()).trim();
  check('the header pill is the compact 🌐 only', label === '🌐', JSON.stringify(label));

  const english = await text(page, '.hero h1');

  // search field filters by initials / name / code
  await page.locator('#nova-lang-slot summary').click();
  await page.locator('[data-nova-lang-search]').fill('ελλ');
  const greekHits = await page.locator('[data-nova-lang-option]:visible').count();
  check('search "ελλ" finds Greek', greekHits === 1, `${greekHits} hit(s)`);
  await page.locator('[data-nova-lang-search]').fill('gr');
  const grHits = await page.locator('[data-nova-lang-option]:visible').count();
  check('search "gr" finds Greek', grHits >= 1, `${grHits} hit(s)`);

  // manual switch: Greek
  await page.locator('[data-nova-lang-search]').fill('greek');
  await page.locator('[data-nova-lang-option="el"]').click();
  await page.evaluate(() => window.__novaLastRun);
  await waitTranslated(page, 'el');
  const greekText = await text(page, '.hero h1');
  check('manual switch translates the page to Greek', SCRIPT.el.test(greekText), greekText.slice(0, 60));
  check('Greek translation survived to localStorage', (await page.evaluate(() => localStorage.getItem('nova_pdf_lang'))) === 'el');

  // a reload keeps the visitor's own choice (no ?hl= in the URL)
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await waitTranslated(page, 'el');
  const kept = await waitChanged(page, '.hero h1', english);
  check('the saved language survives a reload', kept && SCRIPT.el.test(await text(page, '.hero h1')));

  // back to English restores the source copy
  await page.evaluate(() => window.__novaTranslate('en'));
  await page.waitForTimeout(400);
  const restored = await text(page, '.hero h1');
  check('switching back to English restores the original copy', restored === english, restored.slice(0, 40));

  // ?hl= wins on a cold load
  const page2 = await newPage();
  await page2.goto(`${BASE}/?hl=de`, { waitUntil: 'domcontentloaded' });
  await waitTranslated(page2, 'de');
  const changedDe = await waitChanged(page2, '.hero h1', english);
  const german = await text(page2, '.hero h1');
  check('?hl=de auto-translates to German', changedDe && newWords(english, german) >= 2, german.slice(0, 60));
  await page2.context().close();
  await page.context().close();
}

/* ------------------------------------------------------- ten live languages */
{
  const page = await newPage();
  await page.goto(`${BASE}/?hl=en`, { waitUntil: 'domcontentloaded' });
  await page.locator('#nova-lang-slot .nv-lang').waitFor({ timeout: 20000 });
  const english = await text(page, '.hero .lede');

  const NON_LATIN = ['ar', 'zh-CN', 'ja', 'ru', 'hi', 'el'];

  for (const code of ['ar', 'zh-CN', 'de', 'el', 'es', 'fr', 'ja', 'ru', 'hi', 'pt']) {
    await page.evaluate((c) => window.__novaTranslate(c), code);
    await waitTranslated(page, code);
    const translated = await text(page, '.hero .lede');
    const ok =
      translated !== english &&
      newWords(english, translated) >= (NON_LATIN.includes(code) ? 1 : 2) &&
      (NON_LATIN.includes(code) ? SCRIPT[code].test(translated) : true);
    check(`live translation: ${code}`, ok, translated.slice(0, 52));
    if (code === 'ar') {
      const dir = await page.evaluate(() => document.documentElement.getAttribute('dir'));
      check('Arabic switches the document to RTL', dir === 'rtl', String(dir));
    }
    await page.evaluate(() => window.__novaTranslate('en'));
    await page.waitForTimeout(200);
  }
  const backToEnglish = await text(page, '.hero .lede');
  check('English is restored after the language sweep', backToEnglish === english);
  await page.context().close();
}

/* ------------------------------------------------------------------- SPA */
{
  const page = await newPage();
  await page.goto(`${BASE}/app/?hl=en`, { waitUntil: 'networkidle' });
  await page.locator('.topbar').waitFor({ timeout: 25000 });
  const inline = await page.locator('#nova-lang-slot .nv-lang').count();
  check('the workbench topbar carries the language pill', inline === 1, `${inline}`);
  check('no runtime errors on load', page.errors.length === 0, page.errors.slice(0, 2).join(' | '));

  const railEnglish = await text(page, '.rail');
  await page.evaluate(() => window.__novaTranslate('el'));
  await waitTranslated(page, 'el');
  const railGreek = await text(page, '.rail');
  check('the workbench rail translates to Greek', SCRIPT.el.test(railGreek) && railGreek !== railEnglish, railGreek.slice(0, 50));

  // SPA navigation: a tool opened after the switch must be translated too
  await page.locator('.cmd-btn').click();
  await page.locator('.palette-input input').fill('watermark');
  await page.locator('.palette-item').first().click();
  await page.locator('.tool-page').waitFor({ state: 'visible', timeout: 20000 });
  await page.waitForTimeout(4000);
  const toolText = await text(page, '.tool-page');
  check('SPA navigation translates the newly opened tool', SCRIPT.el.test(toolText), toolText.slice(0, 70));
  check('no runtime errors after translating the app', page.errors.length === 0, page.errors.slice(0, 2).join(' | '));
  await page.context().close();
}

/* ---------------------------------------------------------------- mobile */
for (const vp of [
  { width: 390, height: 844, name: 'iPhone 390' },
  { width: 768, height: 1024, name: 'tablet 768' },
]) {
  for (const path of ['/', '/app/']) {
    const page = await newPage({ viewport: { width: vp.width, height: vp.height } });
    await page.goto(`${BASE}${path}?hl=en`, { waitUntil: 'networkidle' });
    const pill = page.locator('#nova-lang-slot .nv-lang');
    await pill.waitFor({ timeout: 25000 });
    check(`${vp.name} ${path}: the language pill is visible`, await pill.isVisible());

    const before = await bodyText(page);

    await page.locator('#nova-lang-slot summary').click();
    const box = await page.locator('#nova-lang-slot .nv-lang-panel').boundingBox();
    const inside =
      !!box && box.x >= -1 && box.x + box.width <= vp.width + 1 && box.y >= -1 && box.y < vp.height;
    check(`${vp.name} ${path}: the dropdown stays inside the viewport`, inside, JSON.stringify(box));

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check(`${vp.name} ${path}: no horizontal overflow with the dropdown open`, overflow <= 0, `${overflow}px`);

    await page.locator('[data-nova-lang-search]').fill('ital');
    await page.locator('[data-nova-lang-option="it"]').click();
    await page.evaluate(() => window.__novaLastRun);
    await waitTranslated(page, 'it');
    const after = await bodyText(page);
    check(`${vp.name} ${path}: Italian applies on a small screen`, after !== before && SCRIPT.it.test(after), after.slice(0, 46));
    const overflow2 = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check(`${vp.name} ${path}: no horizontal overflow when translated`, overflow2 <= 0, `${overflow2}px`);
    await page.context().close();
  }
}

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n=== I18N SUMMARY ===\npassed ${results.length - failed.length} / ${results.length}`);
process.exit(failed.length ? 1 : 0);
