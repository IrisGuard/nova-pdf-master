/* NOVA PDF — always-on analytics + engagement tracking (Owner 2026-10-25).
 *
 * Owner order: count EVERY visit and EVERY click/navigation — even the same
 * visitor returning 30 times a day — so traffic is never under-reported.
 *
 * Page-level telemetry only:
 *   - page_view  (on load + every SPA route change)
 *   - click      (delegated; label = aria-label/title/visible text, never file data)
 * No document content, filename, extracted text or metadata is ever sent.
 *
 * GA4 loads immediately (no consent banner, Owner 2026-10-25). `anonymize_ip`
 * is set as best-effort; GA4 still geolocates from IP for region reports.
 *
 * External file on purpose: an inline <script> would need a CSP hash. A
 * same-origin file needs no hash and can never desync from the CSP.
 */
(function () {
  "use strict";

  var GA_ID = "G-FKX19KJGNL";
  var GA_SRC = "https://www.googletagmanager.com/gtag/js?id=" + GA_ID;

  function loadGA() {
    if (window.__pdfGALoaded) return;
    window.__pdfGALoaded = true;

    var s = document.createElement("script");
    s.async = true;
    s.src = GA_SRC;
    document.head.appendChild(s);

    window.dataLayer = window.dataLayer || [];
    function gtag() { window.dataLayer.push(arguments); }
    window.gtag = gtag;
    gtag("js", new Date());
    gtag("config", GA_ID, { anonymize_ip: true, send_page_view: true });

    trackPageView();
  }

  function trackPageView() {
    if (!window.gtag) return;
    window.gtag("event", "page_view", {
      page_title: (document.title || "").slice(0, 200),
      page_location: location.href
    });
  }

  // Human-meaningful label for a clicked element, never file contents.
  function describe(el) {
    if (!el || el.nodeType !== 1) return "";
    if (el === document.body || el === document.documentElement) return "";
    var label = el.getAttribute("aria-label") || el.getAttribute("title") || el.getAttribute("data-track") || "";
    if (label) return label.slice(0, 120);
    var text = (el.innerText || el.textContent || "").trim();
    if (text && text.length <= 120) return text;
    return (el.tagName || "").toLowerCase();
  }

  // Every click counts: buttons, links, tabs, menu items, submit inputs.
  document.addEventListener("click", function (e) {
    if (!window.gtag) return;
    var el = e.target;
    while (el && el.nodeType !== 1) el = el.parentNode;
    if (!el || el === document.body || el === document.documentElement) return;
    var t = (el.closest && el.closest("a[href],button,[role=button],[role=tab],[role=menuitem],input[type=submit],summary")) || el;
    var href = "";
    if (t.closest && t.closest("a")) href = t.closest("a").getAttribute("href") || "";
    window.gtag("event", "click", {
      event_category: "engagement",
      event_label: describe(t),
      link_url: href.slice(0, 300)
    });
  }, true);

  // SPA navigation: patch history + watch hashchange/popstate so route changes
  // (categories, tools) each count as a page view.
  var last = location.href;
  function onNav() {
    if (location.href !== last) {
      last = location.href;
      trackPageView();
    }
  }
  var _push = history.pushState;
  var _replace = history.replaceState;
  history.pushState = function () { var r = _push.apply(this, arguments); onNav(); return r; };
  history.replaceState = function () { var r = _replace.apply(this, arguments); onNav(); return r; };
  window.addEventListener("popstate", onNav);
  window.addEventListener("hashchange", onNav);

  // Exposed for other code + QA: track custom events without guessing.
  window.__pdfAnalytics = {
    track: function (name, params) { if (window.gtag) window.gtag("event", name, params || {}); },
    page: trackPageView
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", loadGA, { once: true });
  } else {
    loadGA();
  }
})();
