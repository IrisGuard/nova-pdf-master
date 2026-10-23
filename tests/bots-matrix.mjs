// Live AI-crawler visibility matrix for a PUBLIC platform (protocol §0v.2/§0v.5).
// Hits the real origin with real user-agent strings; reports 200/403/other per bot.
// Usage: node bots-matrix.mjs https://pdf.novaecosystem.live

const BASE = (process.argv[2] || 'https://pdf.novaecosystem.live').replace(/\/$/, '');

// Full fleet: the 15 §0v.2 AI crawlers + search engines + newer AI agents (Jina, Vertex, etc.)
const BOTS = [
  ['GPTBot', 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.0; +https://openai.com/gptbot)'],
  ['ChatGPT-User', 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; ChatGPT-User/1.0; +https://openai.com/bot'],
  ['OAI-SearchBot', 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; OAI-SearchBot/1.0; +https://openai.com/searchbot)'],
  ['Google-Extended', 'Google-Extended (+https://developers.google.com/search/docs/crawling-indexing/overview-google-crawlers)'],
  ['Googlebot', 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'],
  ['GoogleOther', 'GoogleOther (+https://developers.google.com/search/docs/crawling-indexing/overview-google-crawlers)'],
  ['Google-CloudVertexBot', 'Google-CloudVertexBot (+https://developers.google.com/search/docs/crawling-indexing/overview-google-crawlers)'],
  ['ClaudeBot', 'ClaudeBot/1.0 (+claudebot@anthropic.com)'],
  ['Claude-Web', 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Claude-Web/1.0; +claude-web@anthropic.com)'],
  ['anthropic-ai', 'anthropic-ai (+https://www.anthropic.com)'],
  ['PerplexityBot', 'PerplexityBot/1.0 (+https://perplexity.ai/perplexitybot)'],
  ['Perplexity-User', 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Perplexity-User/1.0)'],
  ['CCBot', 'CCBot/2.0 (https://commoncrawl.org/faq/)'],
  ['Bytespider', 'Mozilla/5.0 (compatible; Bytespider; spider-feedback@bytedance.com) AppleWebKit/537.36 Chrome/70.0.0.0 Safari/537.36'],
  ['cohere-ai', 'cohere-ai (+https://cohere.com)'],
  ['Applebot', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15 (Applebot/0.1; +http://www.apple.com/go/applebot)'],
  ['Applebot-Extended', 'Applebot-Extended (+https://support.apple.com/en-ca/119829)'],
  ['meta-externalagent', 'meta-externalagent/1.1 (+https://developers.facebook.com/docs/sharing/webmasters/crawler)'],
  ['Amazonbot', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_10_1) AppleWebKit/600.2.5 (KHTML, like Gecko) Version/8.0.2 Safari/600.2.5 (Amazonbot/0.1; +https://developer.amazon.com/support/amazonbot)'],
  ['Bingbot', 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)'],
  ['DuckDuckBot', 'DuckDuckBot/1.1 (+https://duckduckgo.com/duckduckbot)'],
  ['YandexBot', 'Mozilla/5.0 (compatible; YandexBot/3.0; +http://yandex.com/bots)'],
  ['JinaBot', 'Mozilla/5.0 (compatible; JinaBot/1.0; +https://jina.ai)'],
  ['r.jina.ai reader', 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36 (r.jina.ai)'],
  ['ExaBot', 'Mozilla/5.0 (compatible; ExaBot/1.0; +https://exa.ai/bot)'],
  ['Gemini (UA probe)', 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Gemini/1.0)'],
  ['Browser (control)', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36'],
];

let fail = 0;
let n200 = 0;
for (const [name, ua] of BOTS) {
  let status = 'ERR';
  let ctype = '';
  try {
    const res = await fetch(`${BASE}/`, { headers: { 'User-Agent': ua }, redirect: 'manual' });
    status = String(res.status);
    ctype = res.headers.get('content-type') || '';
  } catch (e) {
    status = 'ERR:' + String(e && e.cause ? e.cause.code : e.message).slice(0, 40);
  }
  const ok = status === '200';
  if (ok) n200++;
  else fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(20)} -> ${status} ${ctype}`);
}
console.log(`\n${n200}/${BOTS.length} user-agents returned 200`);
process.exit(fail ? 1 : 0);
