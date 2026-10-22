const nav = document.querySelector<HTMLElement>('.nav');

const onScroll = () => nav?.classList.toggle('scrolled', window.scrollY > 8);
onScroll();
window.addEventListener('scroll', onScroll, { passive: true });

/* ---------- light / dark theme toggle (shared key with the workbench) ---------- */

const THEME_KEY = 'nova-pdf-theme';
const themeBtn = document.getElementById('theme-btn') as HTMLButtonElement | null;

function applyTheme(theme: 'light' | 'dark') {
  document.documentElement.setAttribute('data-theme', theme);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'light' ? '#f3f2ec' : '#07080b');
}

// The inline <head> script already set data-theme from localStorage; sync the
// theme-color meta once on load and wire the button.
applyTheme(document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark');

themeBtn?.addEventListener('click', () => {
  const next = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
  applyTheme(next);
  try {
    localStorage.setItem(THEME_KEY, next);
  } catch {
    /* storage unavailable — theme still applies for this session */
  }
});

const targets = document.querySelectorAll<HTMLElement>(
  '.section-head, .card, .tool-group, .table-wrap, .step, .tech-item, .faq-list, .final-cta, .strip',
);

if ('IntersectionObserver' in window && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
  targets.forEach((el) => el.classList.add('reveal'));
  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add('in');
          io.unobserve(entry.target);
        }
      }
    },
    { rootMargin: '0px 0px -8% 0px', threshold: 0.08 },
  );
  targets.forEach((el) => io.observe(el));
}

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => undefined);
  });
}

/* ---------- explicit offline installation ---------- */

const offlineBtn = document.getElementById('offline-btn') as HTMLButtonElement | null;
const offlineStatus = document.getElementById('offline-status');

type PrecacheMessage =
  | { type: 'PROGRESS'; done: number; total: number; failed: number }
  | { type: 'DONE'; total: number; failed: number }
  | { type: 'ERROR'; message: string };

async function makeAvailableOffline() {
  if (!offlineBtn) return;
  if (!('serviceWorker' in navigator)) {
    if (offlineStatus) offlineStatus.textContent = 'This browser does not support offline apps.';
    return;
  }
  offlineBtn.disabled = true;
  offlineBtn.textContent = 'Preparing…';
  try {
    await navigator.serviceWorker.register('/sw.js');
    const registration = await navigator.serviceWorker.ready;
    const worker = registration.active;
    if (!worker) throw new Error('Service worker is not active yet. Reload and try again.');

    const channel = new MessageChannel();
    await new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(() => reject(new Error('The download timed out. Try again.')), 10 * 60 * 1000);
      channel.port1.onmessage = (event: MessageEvent<PrecacheMessage>) => {
        const msg = event.data;
        if (msg.type === 'PROGRESS') {
          const pct = msg.total ? Math.round((msg.done / msg.total) * 100) : 0;
          offlineBtn.textContent = `Downloading engine… ${pct}%`;
          if (offlineStatus) offlineStatus.textContent = `${msg.done} of ${msg.total} files cached`;
        } else if (msg.type === 'DONE') {
          window.clearTimeout(timer);
          offlineBtn.textContent = 'Available offline ✓';
          if (offlineStatus) {
            offlineStatus.textContent = msg.failed
              ? `Cached ${msg.total - msg.failed} of ${msg.total} files. ${msg.failed} failed — try again on a stable connection.`
              : `Ready: ${msg.total} files cached. NOVA PDF and OCR now work without a connection.`;
          }
          resolve();
        } else if (msg.type === 'ERROR') {
          window.clearTimeout(timer);
          reject(new Error(msg.message));
        }
      };
      worker.postMessage({ type: 'PRECACHE_ALL' }, [channel.port2]);
    });
  } catch (error) {
    offlineBtn.disabled = false;
    offlineBtn.textContent = 'Make available offline';
    if (offlineStatus) {
      offlineStatus.textContent = error instanceof Error ? error.message : 'Offline download failed.';
    }
  }
}

offlineBtn?.addEventListener('click', makeAvailableOffline);
