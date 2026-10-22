/**
 * NOVA PDF — Cloudflare Worker edge.
 * Serves the static build and adds the public-surface hardening headers.
 */

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  'X-Frame-Options': 'DENY',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
};

const CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "worker-src 'self' blob:",
  "child-src 'self' blob:",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  // §0n: the free, client-side Google translation endpoints. A proxy through
  // the Worker is forbidden — the edge IP gets 429; the visitor's browser does not.
  "connect-src 'self' https://clients5.google.com https://translate.googleapis.com",
  "media-src 'self' blob:",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'none'",
  "upgrade-insecure-requests",
].join('; ');

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // §0n auto-language: the visitor's country decides the first language when
    // neither ?hl= nor a saved choice nor the browser locale says otherwise.
    if (url.pathname === '/api/geo') {
      const country = (request.cf && request.cf.country) || '';
      return new Response(JSON.stringify({ country }), {
        headers: {
          ...SECURITY_HEADERS,
          'Content-Type': 'application/json; charset=utf-8',
          'Content-Security-Policy': CSP,
          'Cache-Control': 'private, max-age=1800',
          'X-Robots-Tag': 'noindex, nofollow, noarchive',
        },
      });
    }

    const response = await env.ASSETS.fetch(request);
    const headers = new Headers(response.headers);
    const path = url.pathname;

    for (const [key, value] of Object.entries(SECURITY_HEADERS)) headers.set(key, value);
    headers.set('Content-Security-Policy', CSP);

    // A missing machine-readable file must be a real 404, never the SPA shell
    // served as 200 text/html (soft-404). Robots, sitemaps and llms.txt are
    // real assets, so only the fallback path reaches this branch.
    const isMachineFile = /\.(xml|txt|json|webmanifest|rss|atom)$/i.test(path);
    if (isMachineFile && (response.headers.get('content-type') || '').includes('text/html')) {
      const fallback = await env.ASSETS.fetch(new URL('/404.html', url));
      const notFoundHeaders = new Headers(fallback.headers);
      for (const [key, value] of Object.entries(SECURITY_HEADERS)) notFoundHeaders.set(key, value);
      notFoundHeaders.set('Content-Security-Policy', CSP);
      notFoundHeaders.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
      notFoundHeaders.set('Cache-Control', 'no-store');
      return new Response(fallback.body, { status: 404, statusText: 'Not Found', headers: notFoundHeaders });
    }

    headers.set('X-Robots-Tag', response.status === 404 ? 'noindex, nofollow, noarchive' : 'index, follow, max-image-preview:large');

    if (path === '/' || path.endsWith('.html') || path.endsWith('/')) {
      // `no-transform` also stops the edge from injecting its analytics beacon,
      // so the "no telemetry" promise is true in the browser as well.
      headers.set('Cache-Control', 'public, max-age=0, must-revalidate, no-transform');
    } else if (path.startsWith('/assets/') || path.startsWith('/pdfjs/') || path.startsWith('/tesseract/') || path.startsWith('/tessdata/') || path.startsWith('/fonts/') || path.startsWith('/pdf.worker')) {
      headers.set('Cache-Control', 'public, max-age=31536000, immutable');
    } else if (path.endsWith('.json') || path.endsWith('.txt') || path.endsWith('.xml') || path.endsWith('.webmanifest') || path === '/sw.js') {
      headers.set('Cache-Control', 'public, max-age=300');
    }

    headers.set('Vary', 'Accept-Encoding');

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  },
};
