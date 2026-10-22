import { actions } from './store';

/**
 * Count anything that could be an upload: a non-GET request, or a request to
 * another origin. The workbench only ever fetches its own static assets, so the
 * badge stays at "0 uploads" unless something unexpected happens.
 */
export function installNetMonitor() {
  if (typeof window === 'undefined') return;
  const w = window as Window & { __novaNetInstalled?: boolean };
  if (w.__novaNetInstalled) return;
  w.__novaNetInstalled = true;

  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    try {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      const method = (init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
      const absolute = new URL(url, location.href);
      const crossOrigin = absolute.origin !== location.origin;
      if (crossOrigin || (method !== 'GET' && method !== 'HEAD')) actions.bumpNet();
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
        if (absolute.origin !== location.origin || (m !== 'GET' && m !== 'HEAD')) actions.bumpNet();
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
