import { actions } from './store';

/**
 * The free client-side translation feature (protocol §0n) calls Google Translate
 * from the visitor's own browser. Those requests carry page UI text only — never
 * the document — and are disclosed in the CSP `connect-src`. They are NOT an
 * upload, so they must not move the badge off "0 uploads"; counting them made the
 * badge read "N external" and contradict the "nothing leaves this tab" promise.
 */
const TRANSLATE_HOSTS = ['clients5.google.com', 'translate.googleapis.com'];

/**
 * Count anything that could be an upload: a non-GET request, or a request to
 * another origin (other than the disclosed translation endpoints). The workbench
 * only ever fetches its own static assets, so the badge stays at "0 uploads"
 * unless something unexpected happens.
 */
export function installNetMonitor() {
  if (typeof window === 'undefined') return;
  const w = window as Window & { __novaNetInstalled?: boolean };
  if (w.__novaNetInstalled) return;
  w.__novaNetInstalled = true;

  const isUploadLike = (url: URL, method: string) => {
    if (TRANSLATE_HOSTS.includes(url.hostname)) return false;
    return url.origin !== location.origin || (method !== 'GET' && method !== 'HEAD');
  };

  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    try {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      const method = (init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
      const absolute = new URL(url, location.href);
      if (isUploadLike(absolute, method)) actions.bumpNet();
    } catch {
      /* never let the monitor break a request */
    }
    return originalFetch(input as RequestInfo, init);
  };

  const XHR = window.XMLHttpRequest;
  if (XHR) {
    const open = XHR.prototype.open;
    const send = XHR.prototype.send;
    XHR.prototype.open = function (method: string, url: string | URL, ...rest: unknown[]) {
      try {
        const absolute = new URL(String(url), location.href);
        const m = (method || 'GET').toUpperCase();
        if (isUploadLike(absolute, m)) actions.bumpNet();
      } catch {
        /* ignore */
      }
      // eslint-disable-next-line prefer-rest-params
      return (open as unknown as (...args: unknown[]) => void).apply(this, [method, url, ...rest]);
    };
    XHR.prototype.send = function (...args: unknown[]) {
      // eslint-disable-next-line prefer-rest-params
      return (send as unknown as (...a: unknown[]) => void).apply(this, args);
    };
  }
}
