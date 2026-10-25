/* NOVA PDF — Google Analytics consent gate (Owner 2026-10-25).
 *
 * Same pattern as Nova AI Apps (public/analytics.js, G-8ZXWZ34KG6), so the whole
 * ecosystem behaves identically: NOTHING is loaded from Google until the visitor
 * presses "Allow analytics". Declining stores the choice and loads no script.
 *
 * Why gated rather than an unconditional tag: the audience is EU (the Owner is in
 * Greece), where GA4 sets identifiers that count as non-essential storage. The
 * landing page claims the document never leaves the tab — that stays literally
 * true here, because even the analytics hit never carries file data.
 *
 * External file on purpose: an inline <script> would need a CSP hash, and the
 * hash sync (scripts/sync-csp-hash.mjs) already broke once when the GA snippet
 * was added inline. A same-origin file needs no hash and can never desync.
 */
(function () {
  "use strict";

  var GA_ID = "G-FKX19KJGNL";
  var KEY = "nova_pdf_consent"; // 'accepted' | 'denied'
  var GA_SRC = "https://www.googletagmanager.com/gtag/js?id=" + GA_ID;

  function stored() {
    try { return localStorage.getItem(KEY); } catch (e) { return null; }
  }

  function loadGA() {
    if (window.__npdfGALoaded) return;
    window.__npdfGALoaded = true;
    var s = document.createElement("script");
    s.async = true;
    s.src = GA_SRC;
    document.head.appendChild(s);
    window.dataLayer = window.dataLayer || [];
    function gtag() { window.dataLayer.push(arguments); }
    window.gtag = gtag;
    gtag("js", new Date());
    gtag("config", GA_ID, { anonymize_ip: true });
  }

  function decide(value) {
    try { localStorage.setItem(KEY, value); } catch (e) { /* private mode */ }
    var el = document.getElementById("npdf-consent");
    if (el && el.parentNode) el.parentNode.removeChild(el);
    if (value === "accepted") loadGA();
  }

  var COPY = {
    en: {
      label: "Analytics consent",
      text: "We count page views to see which tools are useful. Your PDF never leaves this tab — no file, filename or text is ever sent. Allow analytics?",
      allow: "Allow analytics",
      deny: "No thanks"
    },
    el: {
      label: "Συγκατάθεση στα analytics",
      text: "Μετράμε επισκέψεις για να ξέρουμε ποια εργαλεία χρησιμοποιούνται. Το PDF σας δεν φεύγει ποτέ από αυτή την καρτέλα — δεν στέλνεται ποτέ αρχείο, όνομα ή κείμενο. Να επιτρέψω analytics;",
      allow: "Ναι, επιτρέπω",
      deny: "Όχι, ευχαριστώ"
    }
  };

  function copy() {
    var lang = "";
    try { lang = (navigator.language || "").toLowerCase(); } catch (e) { /* ignore */ }
    return lang.indexOf("el") === 0 ? COPY.el : COPY.en;
  }

  function showBanner() {
    if (document.getElementById("npdf-consent")) return;

    var t = copy();

    var bar = document.createElement("div");
    bar.id = "npdf-consent";
    bar.className = "npdf-consent notranslate";
    // Legal copy: kept out of the machine translator, both because a mistranslated
    // consent notice is a compliance problem and because feeding it to Google
    // Translate on every load polluted the i18n suite's request budget.
    bar.setAttribute("translate", "no");
    bar.setAttribute("role", "dialog");
    bar.setAttribute("aria-label", t.label);
    bar.setAttribute("aria-live", "polite");

    var text = document.createElement("p");
    text.className = "npdf-consent__text";
    text.textContent = t.text;

    var actions = document.createElement("div");
    actions.className = "npdf-consent__actions";

    var allow = document.createElement("button");
    allow.type = "button";
    allow.className = "npdf-consent__btn npdf-consent__btn--allow";
    allow.setAttribute("data-consent", "accepted");
    allow.textContent = t.allow;

    var deny = document.createElement("button");
    deny.type = "button";
    deny.className = "npdf-consent__btn";
    deny.setAttribute("data-consent", "denied");
    deny.textContent = t.deny;

    allow.addEventListener("click", function () { decide("accepted"); });
    deny.addEventListener("click", function () { decide("denied"); });

    actions.appendChild(allow);
    actions.appendChild(deny);
    bar.appendChild(text);
    bar.appendChild(actions);
    document.body.appendChild(bar);
  }

  function boot() {
    var choice = stored();
    if (choice === "accepted") loadGA();
    else if (choice !== "denied") showBanner();
  }

  // Exposed so QA can drive the banner without guessing at selectors.
  window.__npdfConsent = {
    set: decide,
    get: stored,
    state: function () {
      return { choice: stored(), loaded: Boolean(window.__npdfGALoaded) };
    }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
