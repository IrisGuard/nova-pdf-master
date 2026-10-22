/* NOVA PDF service worker — offline shell + on-demand full engine cache. */

const VERSION = 'nova-pdf-v2';
const SHELL_CACHE = `${VERSION}-shell`;
const RUNTIME_CACHE = `${VERSION}-runtime`;
const SHELL = ['/', '/app/', '/theme-init.js', '/manifest.webmanifest', '/favicon.svg', '/icon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL))
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

async function cacheAll(onProgress) {
  const res = await fetch('/precache.json', { cache: 'no-store' });
  if (!res.ok) throw new Error('Precache manifest unavailable');
  const manifest = await res.json();
  const files = Array.isArray(manifest.files) ? manifest.files : [];
  const cache = await caches.open(RUNTIME_CACHE);
  let done = 0;
  let failed = 0;
  const batch = 6;
  for (let i = 0; i < files.length; i += batch) {
    const slice = files.slice(i, i + batch);
    await Promise.all(
      slice.map(async (url) => {
        try {
          const existing = await cache.match(url);
          if (!existing) {
            const r = await fetch(url, { cache: 'no-store' });
            if (r.ok) await cache.put(url, r.clone());
          }
        } catch {
          failed++;
        } finally {
          done++;
        }
      }),
    );
    onProgress(done, files.length, failed);
  }
  return { total: files.length, failed };
}

self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type === 'SKIP_WAITING') self.skipWaiting();
  if (data.type === 'PRECACHE_ALL') {
    const port = event.ports && event.ports[0];
    event.waitUntil(
      cacheAll((done, total, failed) => {
        if (port) port.postMessage({ type: 'PROGRESS', done, total, failed });
      })
        .then((r) => port && port.postMessage({ type: 'DONE', ...r }))
        .catch((err) => port && port.postMessage({ type: 'ERROR', message: String(err && err.message ? err.message : err) })),
    );
  }
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(RUNTIME_CACHE).then((c) => c.put(req, copy)).catch(() => undefined);
          return res;
        })
        .catch(async () => {
          const cached = await caches.match(req);
          if (cached) return cached;
          const app = await caches.match('/app/');
          if (app) return app;
          return new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } });
        }),
    );
    return;
  }

  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) {
        // Refresh long-lived static files in the background.
        fetch(req)
          .then((res) => {
            if (res.ok) caches.open(RUNTIME_CACHE).then((c) => c.put(req, res)).catch(() => undefined);
          })
          .catch(() => undefined);
        return cached;
      }
      return fetch(req)
        .then((res) => {
          if (res.ok && res.type === 'basic') {
            const copy = res.clone();
            caches.open(RUNTIME_CACHE).then((c) => c.put(req, copy)).catch(() => undefined);
          }
          return res;
        })
        .catch(() => new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } }));
    }),
  );
});
