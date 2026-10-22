/**
 * Edge gate for NOVA PDF (protocol §0v — PUBLIC surface, 10/10).
 * Run against a live deployment or `wrangler dev`:
 *   node tests/edge.mjs https://pdf.novaecosystem.live
 *   node tests/edge.mjs http://127.0.0.1:8899
 */
const BASE = (process.argv[2] || 'http://127.0.0.1:8899').replace(/\/$/, '');

const AI_BOTS = [
  'GPTBot', 'ChatGPT-User', 'OAI-SearchBot', 'Google-Extended', 'ClaudeBot', 'Claude-Web',
  'anthropic-ai', 'PerplexityBot', 'Perplexity-User', 'CCBot', 'Bytespider', 'cohere-ai',
  'Applebot-Extended', 'meta-externalagent', 'Amazonbot',
];

const checks = [];
function check(name, ok, detail) {
  checks.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

async function get(path) {
  const res = await fetch(`${BASE}${path}`, { redirect: 'manual' });
  const body = await res.text();
  return { status: res.status, type: res.headers.get('content-type') || '', headers: res.headers, body };
}

// ── 1. robots.txt ────────────────────────────────────────────────
const robots = await get('/robots.txt');
check('robots.txt 200', robots.status === 200, `${robots.status} ${robots.type}`);
check('robots allows everything', /User-agent:\s*\*/i.test(robots.body) && /Allow:\s*\//i.test(robots.body));
check('robots has no Disallow: /', !/Disallow:\s*\/\s*$/im.test(robots.body));
const missingBots = AI_BOTS.filter((b) => !new RegExp(`User-agent:\\s*${b}\\b`, 'i').test(robots.body));
check('robots lists all AI crawlers', missingBots.length === 0, missingBots.length ? `missing ${missingBots.join(', ')}` : `${AI_BOTS.length} agents`);

// ── 2. sitemap declarations ──────────────────────────────────────
const sitemapLines = (robots.body.match(/^Sitemap:.*$/gim) || []).map((l) => l.split(':').slice(1).join(':').trim());
check('exactly one sitemap declared', sitemapLines.length === 1, sitemapLines.join(' | '));

// ── 3. sitemap.xml ───────────────────────────────────────────────
const sitemap = await get('/sitemap.xml');
check('sitemap.xml 200 xml', sitemap.status === 200 && /xml/.test(sitemap.type), `${sitemap.status} ${sitemap.type}`);
check('sitemap closed tag', /<\/urlset>\s*$/.test(sitemap.body.trim()));
const locs = [...sitemap.body.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
check('sitemap has URLs', locs.length > 0, `${locs.length} urls`);
check('sitemap has no duplicate loc', new Set(locs).size === locs.length);
check('sitemap is a urlset (single level)', /<urlset\b/.test(sitemap.body) && !/<sitemapindex\b/.test(sitemap.body));

// ── 4. machine files ─────────────────────────────────────────────
const summary = await get('/ai-summary.json');
check('ai-summary.json 200 json', summary.status === 200 && /json/.test(summary.type));
const aiIndex = await get('/ai/index.json');
check('ai/index.json 200 json', aiIndex.status === 200 && /json/.test(aiIndex.type));
const llms = await get('/llms.txt');
check('llms.txt 200', llms.status === 200 && /text\/plain/.test(llms.type));
check('llms links the AI index', /\/ai\/index\.json/.test(llms.body));

// ── 5. no soft-404 for machine paths ─────────────────────────────
for (const path of ['/nope.xml', '/nope.txt', '/nope.json', '/nope-sitemap.xml']) {
  const r = await get(path);
  check(`${path} is a real 404`, r.status === 404, `${r.status} ${r.type}`);
}

// ── 6. canonical per page ────────────────────────────────────────
for (const [path, expected] of [['/', 'https://pdf.novaecosystem.live/'], ['/app/', 'https://pdf.novaecosystem.live/app/']]) {
  const page = await get(path);
  check(`${path} 200`, page.status === 200, `${page.status}`);
  const canon = [...page.body.matchAll(/<link[^>]+rel=["']canonical["'][^>]*>/gi)];
  const href = canon[0]?.[0]?.match(/href=["']([^"']+)["']/i)?.[1];
  check(`${path} exactly one canonical`, canon.length === 1, `${canon.length} tag(s)`);
  check(`${path} self-canonical`, href === expected, `${href}`);
  check(`${path} has visible text`, /<h1[^>]*>[\s\S]*?[A-Za-z]{3,}/.test(page.body));
}

// ── 7. security + indexing headers ───────────────────────────────
const landing = await get('/');
const robotsHeader = landing.headers.get('x-robots-tag') || '';
check('X-Robots-Tag allows indexing publicly', /index/.test(robotsHeader) && !/noindex/.test(robotsHeader), robotsHeader);
check('CSP present', Boolean(landing.headers.get('content-security-policy')));
check('HSTS present', Boolean(landing.headers.get('strict-transport-security')));
check('X-Content-Type-Options nosniff', landing.headers.get('x-content-type-options') === 'nosniff');
const nf = await get('/nope.xml');
check('404 carries noindex', /noindex/.test(nf.headers.get('x-robots-tag') || ''));

const failed = checks.filter((c) => !c.ok);
console.log(`\n=== EDGE SUMMARY ===`);
console.log(`base ${BASE}`);
console.log(`passed ${checks.length - failed.length} / ${checks.length}`);
if (failed.length) {
  console.log('failures:');
  for (const f of failed) console.log(` - ${f.name}${f.detail ? ` (${f.detail})` : ''}`);
}
process.exit(failed.length ? 1 : 0);
