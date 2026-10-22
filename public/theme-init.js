// NOVA PDF — early theme bootstrapper.
// Blocking script in <head>: applies the saved light/dark theme before first
// paint so there is no flash of the wrong theme. Shares the same localStorage
// key as the workbench (nova-pdf-theme). CSP-safe because it is external, not
// inline (script-src 'self' only).
(function () {
  try {
    var t = localStorage.getItem('nova-pdf-theme');
    if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
  } catch (e) {
    /* storage unavailable — the :root dark palette is the safe default */
  }
})();
