import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = join(here, 'fixtures');
const artifacts = join(here, 'artifacts');
mkdirSync(artifacts, { recursive: true });

const BASE = process.env.BASE_URL || 'http://127.0.0.1:4311';
const CHROME = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const context = await browser.newContext({ viewport: { width: 1500, height: 950 }, acceptDownloads: true });
const page = await context.newPage();

const consoleErrors = [];
const pageErrors = [];
page.on('console', (msg) => {
  if (msg.type() === 'error') consoleErrors.push(msg.text());
});
page.on('pageerror', (err) => pageErrors.push(String(err)));

const results = [];
let failed = 0;

async function shot(name) {
  await page.screenshot({ path: join(artifacts, `${name}.png`), fullPage: false });
}

async function selectFile(name) {
  const tab = page.locator('.file-tab', { hasText: name }).first();
  await tab.click();
  await page.waitForTimeout(250);
}

async function upload(paths) {
  const before = await page.locator('.file-tab:not(.add)').count();
  await page.setInputFiles('input.hidden-input', paths);
  await page.waitForFunction((n) => document.querySelectorAll('.file-tab:not(.add)').length >= n, before + (Array.isArray(paths) ? paths.length : 1), { timeout: 30000 });
}

async function openTool(name) {
  await page.locator('.rail-item', { hasText: name }).first().click();
  await page.locator('.tool-page').waitFor({ state: 'visible', timeout: 15000 });
}

async function waitResult(timeout = 180000) {
  await page.waitForSelector('.result-card, .result-error', { timeout });
  const error = page.locator('.result-error');
  if (await error.count()) return { ok: false, detail: (await error.first().innerText()).trim() };
  const card = page.locator('.result-card').first();
  const summary = (await card.locator('.result-head').innerText()).trim().replace(/\s+/g, ' ');
  const outputs = await card.locator('.output-row').count();
  return { ok: true, detail: summary, outputs };
}

async function record(name, fn) {
  const started = Date.now();
  try {
    await fn();
    const r = await waitResult(name === 'OCR — searchable PDF' ? 420000 : 180000);
    const ms = Date.now() - started;
    if (r.ok) {
      results.push({ tool: name, status: 'PASS', detail: r.detail, outputs: r.outputs, ms });
      console.log(`PASS  ${name} — ${r.detail} (${ms}ms)`);
    } else {
      failed++;
      results.push({ tool: name, status: 'FAIL', detail: r.detail, ms });
      console.log(`FAIL  ${name} — ${r.detail}`);
    }
  } catch (err) {
    failed++;
    results.push({ tool: name, status: 'ERROR', detail: String(err).split('\n')[0], ms: Date.now() - started });
    console.log(`ERROR ${name} — ${String(err).split('\n')[0]}`);
    await shot(`error-${name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`).catch(() => undefined);
  }
}

try {
  // ── landing surface ──────────────────────────────────────────────
  await page.goto(`${BASE}/?hl=en`, { waitUntil: 'networkidle' });
  const landing = await page.evaluate(() => ({
    title: document.title,
    h1: document.querySelector('h1')?.textContent?.trim(),
    canonical: document.querySelector('link[rel=canonical]')?.getAttribute('href'),
    description: document.querySelector('meta[name=description]')?.getAttribute('content'),
    tools: document.querySelectorAll('.tool-group li').length,
    faq: document.querySelectorAll('.faq details').length,
    overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
  }));
  console.log('landing', JSON.stringify(landing));
  await shot('01-landing');

  const machineFiles = {};
  for (const path of ['/robots.txt', '/sitemap.xml', '/llms.txt', '/ai-summary.json', '/ai/index.json', '/ai/tools.json', '/precache.json', '/manifest.webmanifest']) {
    const res = await page.request.get(`${BASE}${path}`);
    machineFiles[path] = { status: res.status(), type: res.headers()['content-type'] || '' };
  }
  const soft404 = await page.request.get(`${BASE}/does-not-exist.xml`);
  machineFiles['/does-not-exist.xml'] = { status: soft404.status(), type: soft404.headers()['content-type'] || '' };
  console.log('machineFiles', JSON.stringify(machineFiles));

  // ── app boot ─────────────────────────────────────────────────────
  await page.goto(`${BASE}/app/?hl=en`, { waitUntil: 'networkidle' });
  await page.locator('.rail').waitFor({ timeout: 20000 });
  const railCount = await page.locator('.rail-item').count();
  console.log('rail tools', railCount);

  await page.getByRole('button', { name: 'Generate a sample PDF' }).click();
  await page.locator('.file-tab', { hasText: 'nova-pdf-sample.pdf' }).waitFor({ timeout: 30000 });
  await page.locator('.pdf-viewer, .viewer, canvas').first().waitFor({ timeout: 30000 }).catch(() => undefined);
  await shot('02-app-sample');
  const samplePages = await page.locator('.file-tab.active em').innerText().catch(() => '?');
  console.log('sample pages', samplePages);

  // remove the sample, then load deterministic fixtures
  await page.locator('.file-tab.active .tab-close').click();
  await page.waitForTimeout(300);

  await upload([join(fixtures, 'fixture.pdf'), join(fixtures, 'fixture-v2.pdf')]);
  await upload([join(fixtures, 'image.png')]);
  await upload([join(fixtures, 'form.pdf')]);
  await page.setInputFiles('input.hidden-input', [join(fixtures, 'encrypted.pdf')]);
  await page.locator('.dialog').waitFor({ timeout: 15000 });
  await page.locator('.dialog input[type=password]').fill('secret123');
  await page.getByRole('button', { name: 'Unlock', exact: true }).click();
  await page.locator('.file-tab', { hasText: 'encrypted.pdf' }).waitFor({ timeout: 30000 });
  await page.waitForTimeout(500);
  console.log('open documents', await page.locator('.file-tab:not(.add)').allInnerTexts());

  await selectFile('fixture.pdf');

  // ── straightforward tools ───────────────────────────────────────
  const simpleTools = [
    'Split PDF',
    'Rotate PDF',
    'Extract pages',
    'Crop / trim',
    'Resize pages',
    'Multiple pages per sheet',
    'Booklet imposition',
    'Watermark',
    'Page numbers',
    'Header & footer',
    'Bates numbering',
    'Clean & repair',
    'PDF → images',
    'PDF → text',
    'PDF → HTML',
    'PDF → Markdown',
    'PDF → JSON',
    'Convert to PDF/A',
    'Compress PDF',
    'Grayscale PDF',
  ];

  for (const name of simpleTools) {
    await record(name, async () => {
      await selectFile('fixture.pdf');
      await openTool(name);
      await page.locator('.run-btn').click();
    });
  }

  // ── merge + compare need both fixtures ──────────────────────────
  await record('Merge PDFs', async () => {
    await openTool('Merge PDFs');
    await page.locator('.run-btn').click();
  });

  await record('Compare versions', async () => {
    await openTool('Compare versions');
    await page.locator('.run-btn').click();
    await page.waitForFunction(() => /pixel similarity/.test(document.querySelector('.result-card')?.textContent || ''), null, { timeout: 60000 });
    const txt = (await page.locator('.result-card').first().innerText()).replace(/\s+/g, ' ');
    const m = txt.match(/([\d.]+)% pixel similarity/);
    const score = m ? Number(m[1]) : 100;
    if (!m || score >= 99) throw new Error(`Expected a visible difference between fixtures, got: ${txt}`);
  });

  // ── visual editors ──────────────────────────────────────────────
  await record('Organise pages', async () => {
    await selectFile('fixture.pdf');
    await openTool('Organise pages');
    await page.locator('.run-btn').click();
  });

  await record('Sign & stamp', async () => {
    await selectFile('fixture.pdf');
    await openTool('Sign & stamp');
    await page.locator('.tabs button', { hasText: 'Type' }).click();
    await page.locator('.type-sign input').fill('Haris Koufomata');
    await page.getByRole('button', { name: 'Use this signature' }).click();
    await page.getByRole('button', { name: /Place on page/ }).click();
    await page.locator('.placed-row').first().waitFor({ timeout: 10000 });
    await page.locator('.run-btn').click();
  });

  await record('Annotate & mark up', async () => {
    await selectFile('fixture.pdf');
    await openTool('Annotate & mark up');
    const layer = page.locator('.draw-layer').first();
    const box = await layer.boundingBox();
    await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.25);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.32, { steps: 6 });
    await page.mouse.up();
    await page.locator('.anno-row').first().waitFor({ timeout: 10000 });
    await page.locator('.run-btn').click();
  });

  await record('Redact', async () => {
    await selectFile('fixture.pdf');
    await openTool('Redact');
    const layer = page.locator('.redact-layer').first();
    const box = await layer.boundingBox();
    await page.mouse.move(box.x + box.width * 0.15, box.y + box.height * 0.2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.55, box.y + box.height * 0.28, { steps: 8 });
    await page.mouse.up();
    await page.locator('.redact-row').first().waitFor({ timeout: 10000 });
    await page.locator('.run-btn').click();
  });

  await record('Fill forms', async () => {
    await selectFile('form.pdf');
    await openTool('Fill forms');
    await page.locator('.forms-editor').waitFor({ timeout: 20000 });
    const input = page.locator('.form-grid input').first();
    await input.fill('Haris Koufomata');
    await page.locator('.run-btn').click();
  });

  await record('Metadata', async () => {
    await selectFile('fixture.pdf');
    await openTool('Metadata');
    await page.locator('.metadata-editor, .editor-simple').first().waitFor({ timeout: 20000 });
    await page.waitForTimeout(700);
    await page.locator('.run-btn').click();
  });

  await record('Images → PDF', async () => {
    await openTool('Images → PDF');
    await page.locator('.run-btn').click();
  });

  await record('Text / Markdown → PDF', async () => {
    await openTool('Text / Markdown → PDF');
    await page.locator('.options textarea').fill('# Local typesetting\n\nThis PDF was written in the browser.\n\n- Greek: Αυτό δοκιμάζει τοπική γραφή\n- No upload, no server\n\n## Closing\n\nEnd of the document.');
    await page.locator('#opt-title').fill('NOVA PDF typesetting test');
    await page.locator('.run-btn').click();
  });

  await record('Protect with password', async () => {
    await selectFile('fixture.pdf');
    await openTool('Protect with password');
    await page.locator('#opt-userPassword').fill('lapdf2026');
    await page.locator('#opt-ownerPassword').fill('owner2026');
    await page.locator('.run-btn').click();
  });

  await record('Remove password', async () => {
    await selectFile('encrypted.pdf');
    await openTool('Remove password');
    await page.locator('#opt-password').fill('secret123');
    await page.locator('.run-btn').click();
  });

  try {
    await selectFile('fixture.pdf');
    await openTool('Document inspector');
    await page.locator('.info-hero').waitFor({ timeout: 30000 });
    const hero = (await page.locator('.info-hero').innerText()).replace(/\s+/g, ' ').trim();
    results.push({ tool: 'Document inspector', status: 'PASS', detail: hero, outputs: 0, ms: 0 });
    console.log(`PASS  Document inspector — ${hero}`);
  } catch (err) {
    failed++;
    results.push({ tool: 'Document inspector', status: 'ERROR', detail: String(err).split('\n')[0], ms: 0 });
    console.log('ERROR Document inspector —', String(err).split('\n')[0]);
  }

  await record('OCR — searchable PDF', async () => {
    await selectFile('fixture.pdf');
    await openTool('OCR — searchable PDF');
    await page.locator('.run-btn').click();
  });

  await shot('03-final');
} catch (err) {
  failed++;
  console.log('HARNESS ERROR', err);
  await shot('harness-error').catch(() => undefined);
}

const report = {
  base: BASE,
  landing: await page.evaluate(() => ({
    title: document.title,
    canonical: document.querySelector('link[rel=canonical]')?.getAttribute('href'),
    h1: document.querySelector('h1')?.textContent?.trim(),
  })).catch(() => null),
  consoleErrors,
  pageErrors,
  results,
  failed,
};
writeFileSync(join(artifacts, 'e2e-report.json'), JSON.stringify(report, null, 2));
console.log('\n=== SUMMARY ===');
console.log(`passed ${results.filter((r) => r.status === 'PASS').length} / ${results.length}`);
console.log(`failed ${failed}`);
console.log('console errors', consoleErrors.length, consoleErrors.slice(0, 8));
console.log('page errors', pageErrors.length, pageErrors.slice(0, 8));

await browser.close();
process.exit(failed ? 1 : 0);
