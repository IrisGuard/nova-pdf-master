/**
 * Nova free full-page translation — NOVA PDF.
 *
 * Owner standing order (protocol §0n): every public platform is translated into
 * every Google language, client-side, free, with no API key and no AI tokens.
 * The visitor's own browser calls Google from their own IP, so 100k visitors
 * cost nothing centrally.
 *
 * Public API
 *   window.__novaTranslate('el')   translate now
 *   window.__novaTranslate('en')   restore English
 *   window.__novaGetLang()         current target language or null
 *   window.__novaLangList()        the 109-language list
 *
 * It mounts a compact 🌐 control into `#nova-lang-slot` when present and a
 * floating pill otherwise. The dropdown order is fixed: English, Ελληνικά,
 * then every other language alphabetically. A search field filters by code,
 * English name or native name.
 */
(function () {
  if (window.__novaTranslateReady) return;
  window.__novaTranslateReady = true;

  var PRIMARY = 'https://clients5.google.com/translate_a/t?client=dict-chrome-ex';
  var FALLBACK = 'https://translate.googleapis.com/translate_a/single?client=gtx&dt=t';
  var STORE_KEY = 'nova_pdf_lang';
  var CHUNK = 3500;

  var LANGS = [
    ['en', 'English', 'English'],
    ['el', 'Greek', 'Ελληνικά'],
    ['af', 'Afrikaans', 'Afrikaans'],
    ['sq', 'Albanian', 'Shqip'],
    ['am', 'Amharic', 'አማርኛ'],
    ['ar', 'Arabic', 'العربية'],
    ['hy', 'Armenian', 'Հայերեն'],
    ['az', 'Azerbaijani', 'Azərbaycan'],
    ['eu', 'Basque', 'Euskara'],
    ['be', 'Belarusian', 'Беларуская'],
    ['bn', 'Bengali', 'বাংলা'],
    ['bs', 'Bosnian', 'Bosanski'],
    ['bg', 'Bulgarian', 'Български'],
    ['ca', 'Catalan', 'Català'],
    ['ceb', 'Cebuano', 'Cebuano'],
    ['zh-CN', 'Chinese (Simplified)', '简体中文'],
    ['zh-TW', 'Chinese (Traditional)', '繁體中文'],
    ['co', 'Corsican', 'Corsu'],
    ['hr', 'Croatian', 'Hrvatski'],
    ['cs', 'Czech', 'Čeština'],
    ['da', 'Danish', 'Dansk'],
    ['nl', 'Dutch', 'Nederlands'],
    ['eo', 'Esperanto', 'Esperanto'],
    ['et', 'Estonian', 'Eesti'],
    ['fi', 'Finnish', 'Suomi'],
    ['fr', 'French', 'Français'],
    ['fy', 'Frisian', 'Frysk'],
    ['gl', 'Galician', 'Galego'],
    ['ka', 'Georgian', 'ქართული'],
    ['de', 'German', 'Deutsch'],
    ['gu', 'Gujarati', 'ગુજરાતી'],
    ['ht', 'Haitian Creole', 'Kreyòl ayisyen'],
    ['ha', 'Hausa', 'Hausa'],
    ['haw', 'Hawaiian', 'ʻŌlelo Hawaiʻi'],
    ['he', 'Hebrew', 'עברית'],
    ['hi', 'Hindi', 'हिन्दी'],
    ['hmn', 'Hmong', 'Hmoob'],
    ['hu', 'Hungarian', 'Magyar'],
    ['is', 'Icelandic', 'Íslenska'],
    ['ig', 'Igbo', 'Igbo'],
    ['id', 'Indonesian', 'Bahasa Indonesia'],
    ['ga', 'Irish', 'Gaeilge'],
    ['it', 'Italian', 'Italiano'],
    ['ja', 'Japanese', '日本語'],
    ['jv', 'Javanese', 'Basa Jawa'],
    ['kn', 'Kannada', 'ಕನ್ನಡ'],
    ['kk', 'Kazakh', 'Қазақ'],
    ['km', 'Khmer', 'ខ្មែរ'],
    ['rw', 'Kinyarwanda', 'Kinyarwanda'],
    ['ko', 'Korean', '한국어'],
    ['ku', 'Kurdish', 'Kurdî'],
    ['ky', 'Kyrgyz', 'Кыргызча'],
    ['lo', 'Lao', 'ລາວ'],
    ['la', 'Latin', 'Latina'],
    ['lv', 'Latvian', 'Latviešu'],
    ['lt', 'Lithuanian', 'Lietuvių'],
    ['lb', 'Luxembourgish', 'Lëtzebuergesch'],
    ['mk', 'Macedonian', 'Македонски'],
    ['mg', 'Malagasy', 'Malagasy'],
    ['ms', 'Malay', 'Bahasa Melayu'],
    ['ml', 'Malayalam', 'മലയാളം'],
    ['mt', 'Maltese', 'Malti'],
    ['mi', 'Maori', 'Te reo Māori'],
    ['mr', 'Marathi', 'मराठी'],
    ['mn', 'Mongolian', 'Монгол'],
    ['my', 'Myanmar (Burmese)', 'မြန်မာ'],
    ['ne', 'Nepali', 'नेपाली'],
    ['no', 'Norwegian', 'Norsk'],
    ['ny', 'Nyanja (Chichewa)', 'Chichewa'],
    ['or', 'Odia (Oriya)', 'ଓଡ଼ିଆ'],
    ['ps', 'Pashto', 'پښتو'],
    ['fa', 'Persian', 'فارسی'],
    ['pl', 'Polish', 'Polski'],
    ['pt', 'Portuguese', 'Português'],
    ['pa', 'Punjabi', 'ਪੰਜਾਬੀ'],
    ['ro', 'Romanian', 'Română'],
    ['ru', 'Russian', 'Русский'],
    ['sm', 'Samoan', 'Gagana Samoa'],
    ['gd', 'Scots Gaelic', 'Gàidhlig'],
    ['sr', 'Serbian', 'Српски'],
    ['st', 'Sesotho', 'Sesotho'],
    ['sn', 'Shona', 'ChiShona'],
    ['sd', 'Sindhi', 'سنڌي'],
    ['si', 'Sinhala', 'සිංහල'],
    ['sk', 'Slovak', 'Slovenčina'],
    ['sl', 'Slovenian', 'Slovenščina'],
    ['so', 'Somali', 'Soomaali'],
    ['es', 'Spanish', 'Español'],
    ['su', 'Sundanese', 'Basa Sunda'],
    ['sw', 'Swahili', 'Kiswahili'],
    ['sv', 'Swedish', 'Svenska'],
    ['tl', 'Tagalog', 'Tagalog'],
    ['tg', 'Tajik', 'Тоҷикӣ'],
    ['ta', 'Tamil', 'தமிழ்'],
    ['tt', 'Tatar', 'Татар'],
    ['te', 'Telugu', 'తెలుగు'],
    ['th', 'Thai', 'ไทย'],
    ['tr', 'Turkish', 'Türkçe'],
    ['tk', 'Turkmen', 'Türkmen'],
    ['uk', 'Ukrainian', 'Українська'],
    ['ur', 'Urdu', 'اردو'],
    ['ug', 'Uyghur', 'ئۇيغۇرچە'],
    ['uz', 'Uzbek', 'Oʻzbek'],
    ['vi', 'Vietnamese', 'Tiếng Việt'],
    ['cy', 'Welsh', 'Cymraeg'],
    ['xh', 'Xhosa', 'isiXhosa'],
    ['yi', 'Yiddish', 'ייִדיש'],
    ['yo', 'Yoruba', 'Yorùbá'],
    ['zu', 'Zulu', 'isiZulu'],
  ].filter(function (l) {
    return l[0] && l[1];
  });
  // Order is fixed by protocol: English first, Ελληνικά second, then every
  // other language alphabetically by its English name.
  LANGS = LANGS.slice(0, 2).concat(
    LANGS.slice(2).sort(function (a, b) {
      return a[1].localeCompare(b[1], 'en');
    }),
  );

  var COUNTRY_LANG = {
    GR: 'el', CY: 'el', AL: 'sq', XK: 'sq', MK: 'mk', BG: 'bg', RO: 'ro', RS: 'sr', HR: 'hr', BA: 'bs', SI: 'sl', ME: 'sr',
    IT: 'it', SM: 'it', VA: 'it', ES: 'es', PT: 'pt', AD: 'ca', FR: 'fr', MC: 'fr', BE: 'nl', NL: 'nl', LU: 'lb', DE: 'de', AT: 'de', CH: 'de', LI: 'de',
    GB: 'en', IE: 'en', US: 'en', CA: 'en', AU: 'en', NZ: 'en', ZA: 'en',
    DK: 'da', NO: 'no', SE: 'sv', FI: 'fi', IS: 'is', EE: 'et', LV: 'lv', LT: 'lt', PL: 'pl', CZ: 'cs', SK: 'sk', HU: 'hu',
    UA: 'uk', BY: 'ru', RU: 'ru', KZ: 'ru', GE: 'ka', AM: 'hy', AZ: 'az', TR: 'tr', UZ: 'uz', KG: 'ky', TJ: 'tg', TM: 'tk',
    IL: 'he', SA: 'ar', AE: 'ar', QA: 'ar', KW: 'ar', BH: 'ar', OM: 'ar', EG: 'ar', MA: 'ar', DZ: 'ar', TN: 'ar', LY: 'ar', IQ: 'ar', SY: 'ar', JO: 'ar', LB: 'ar', YE: 'ar', SD: 'ar', SO: 'so', IR: 'fa', AF: 'ps', PK: 'ur',
    IN: 'hi', BD: 'bn', NP: 'ne', LK: 'si', MM: 'my', TH: 'th', LA: 'lo', KH: 'km', VN: 'vi', ID: 'id', MY: 'ms', SG: 'zh-CN', PH: 'tl',
    CN: 'zh-CN', TW: 'zh-TW', HK: 'zh-TW', MO: 'zh-TW', JP: 'ja', KR: 'ko', KP: 'ko', MN: 'mn',
    MX: 'es', GT: 'es', HN: 'es', SV: 'es', NI: 'es', CR: 'es', PA: 'es', CO: 'es', VE: 'es', EC: 'es', PE: 'es', BO: 'es', CL: 'es', AR: 'es', UY: 'es', PY: 'es', CU: 'es', DO: 'es', BR: 'pt', HT: 'ht',
    ET: 'am', KE: 'sw', TZ: 'sw', UG: 'sw', NG: 'ha', GH: 'en', CI: 'fr', SN: 'fr', CM: 'fr', CD: 'fr', ZW: 'sn', MG: 'mg',
  };

  var RTL = ['ar', 'he', 'fa', 'ur', 'ps', 'sd', 'ug'];

  var lang = null;
  var originals = new WeakMap();
  var attrOriginals = new WeakMap();
  var gen = 0;
  var chain = Promise.resolve();
  var observer = null;
  var renderTimer = null;
  var ui = null;
  var titleOriginal = null;
  var metaOriginals = [];

  function normCode(code) {
    var c = String(code || '').toLowerCase();
    if (!c) return 'en';
    if (c === 'zh' || c === 'zh-cn' || c === 'zh-hans') return 'zh-CN';
    if (c === 'zh-tw' || c === 'zh-hk' || c === 'zh-hant') return 'zh-TW';
    if (c === 'iw') return 'he';
    if (c === 'in') return 'id';
    if (c === 'pt-br') return 'pt';
    return c.split('-')[0];
  }

  function langName(code) {
    for (var i = 0; i < LANGS.length; i += 1) if (LANGS[i][0] === code) return LANGS[i][1];
    return code;
  }

  function skip(node) {
    var p = node.parentElement;
    if (!p) return true;
    return !!p.closest(
      "script,style,noscript,iframe,textarea,select,option,code,pre,svg,kbd,[translate='no'],.notranslate,.nv-lang,#nova-lang-slot",
    );
  }

  /* A sentence split by inline markup (<strong>, <a>, <span>) must be sent to
     the translator as ONE sentence. Translating fragments word-by-word is what
     produced nonsense ("σκορμούς" for "links"). So text nodes are grouped by
     their block ancestor, joined with a sentinel that the translator keeps,
     and split back afterwards. */
  var BLOCK_SEL =
    'p,li,h1,h2,h3,h4,h5,h6,button,summary,label,td,th,dt,dd,blockquote,figcaption,caption,legend,address,span.tag,div.field-row';
  var SPLIT = '\n<<<NOVA_SPLIT>>>\n';
  var GROUP = '\n<<<NOVA_GROUP>>>\n';

  function collectGroups() {
    var order = [];
    var seen = new Map();
    if (!document.body) return order;
    var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode: function (n) {
        if (!n.nodeValue || !/[A-Za-z\u0391-\u03c9]/.test(n.nodeValue)) return NodeFilter.FILTER_REJECT;
        if (n.nodeValue.trim().length < 2) return NodeFilter.FILTER_REJECT;
        if (skip(n)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    var n;
    while ((n = walker.nextNode())) {
      var host = n.parentElement && n.parentElement.closest(BLOCK_SEL);
      var key = host || n;
      var group = seen.get(key);
      if (!group) {
        group = [];
        seen.set(key, group);
        order.push(group);
      }
      group.push(n);
    }
    return order;
  }

  function groupText(group) {
    if (group.length === 1) return group[0].nodeValue;
    return group
      .map(function (n) {
        return n.nodeValue;
      })
      .join(SPLIT);
  }

  function chunkGroups(groups) {
    var chunks = [];
    var cur = [];
    var len = 0;
    for (var i = 0; i < groups.length; i += 1) {
      var size = 0;
      for (var k = 0; k < groups[i].length; k += 1) size += groups[i][k].nodeValue.length + 1;
      if (len + size > CHUNK && cur.length) {
        chunks.push(cur);
        cur = [];
        len = 0;
      }
      cur.push(groups[i]);
      len += size;
    }
    if (cur.length) chunks.push(cur);
    return chunks;
  }

  async function callGoogle(text, target, attempt) {
    var url;
    if (attempt === 0) {
      url = PRIMARY + '&sl=en&tl=' + encodeURIComponent(target) + '&q=' + encodeURIComponent(text);
    } else {
      url = FALLBACK + '&sl=en&tl=' + encodeURIComponent(target) + '&q=' + encodeURIComponent(text);
    }
    var res = await fetch(url, { method: 'GET', mode: 'cors' });
    if (!res.ok) throw new Error('http_' + res.status);
    var data = await res.json();
    if (attempt === 0) {
      if (Array.isArray(data) && typeof data[0] === 'string') return data[0];
      if (Array.isArray(data) && Array.isArray(data[0]))
        return data
          .map(function (x) {
            return x[0];
          })
          .join('');
      throw new Error('shape');
    }
    if (Array.isArray(data) && Array.isArray(data[0])) {
      return data[0]
        .map(function (x) {
          return x[0];
        })
        .join('');
    }
    throw new Error('shape');
  }

  async function translateText(text, target) {
    try {
      return await callGoogle(text, target, 0);
    } catch (e1) {
      try {
        return await callGoogle(text, target, 1);
      } catch (e2) {
        return null;
      }
    }
  }

  function setNode(node, value) {
    if (!node || !node.isConnected) return;
    if (!value || !value.trim()) return;
    var old = node.nodeValue || '';
    /* Keep the spaces that sat between this node and its neighbours, otherwise
       "Up to " + "40" + " pages" becomes "Μέχρι40σελίδες". */
    var lead = /^\s*/.exec(old)[0];
    var trail = /\s*$/.exec(old)[0];
    var core = String(value).trim();
    if (!core) return;
    if (!originals.has(node)) originals.set(node, old);
    node.nodeValue = lead + core + trail;
  }

  function applyGroup(group, text) {
    if (!text) return;
    if (group.length === 1) {
      setNode(group[0], text);
      return;
    }
    var pieces = String(text).split(/\s*<<<NOVA_SPLIT>>>\s*/);
    if (pieces.length !== group.length) return; // never scramble a sentence
    for (var i = 0; i < group.length; i += 1) setNode(group[i], pieces[i]);
  }

  /* Visible-but-not-text content: input placeholders and the document title. */
  function translateAttrs(target) {
    var fields = document.querySelectorAll('input[placeholder],textarea[placeholder]');
    var jobs = [];
    fields.forEach(function (el) {
      var p = el.closest('.nv-lang');
      if (p || el.getAttribute('translate') === 'no') return;
      var value = el.getAttribute('placeholder');
      if (!value || !/[A-Za-z]/.test(value)) return;
      if (!attrOriginals.has(el)) attrOriginals.set(el, value);
      jobs.push(
        translateText(value, target).then(function (out) {
          if (out) el.setAttribute('placeholder', out);
        }),
      );
    });
    if (document.title && /[A-Za-z]/.test(document.title)) {
      if (titleOriginal === null) titleOriginal = document.title;
      jobs.push(
        translateText(document.title, target).then(function (out) {
          if (out) document.title = out;
        }),
      );
    }
    var desc = document.querySelector('meta[name="description"]');
    if (desc) {
      var content = desc.getAttribute('content');
      if (content && /[A-Za-z]/.test(content)) {
        if (!metaOriginals.length) metaOriginals.push({ el: desc, value: content });
        jobs.push(
          translateText(content, target).then(function (out) {
            if (out) desc.setAttribute('content', out);
          }),
        );
      }
    }
    return Promise.all(jobs);
  }

  function restoreAttrs() {
    var all = [];
    document.querySelectorAll('input[placeholder],textarea[placeholder]').forEach(function (el) {
      if (attrOriginals.has(el)) all.push(el);
    });
    all.forEach(function (el) {
      el.setAttribute('placeholder', attrOriginals.get(el));
      attrOriginals.delete(el);
    });
    if (titleOriginal !== null) {
      document.title = titleOriginal;
      titleOriginal = null;
    }
    metaOriginals.forEach(function (m) {
      m.el.setAttribute('content', m.value);
    });
    metaOriginals = [];
  }

  async function run(target, myGen) {
    if (myGen !== gen) return;
    document.documentElement.setAttribute('lang', target);
    document.documentElement.setAttribute('dir', RTL.indexOf(target) >= 0 ? 'rtl' : 'ltr');
    var groups = collectGroups();
    if (!groups.length) return;
    var queue = chunkGroups(groups);
    async function worker() {
      while (queue.length) {
        if (myGen !== gen) return;
        var chunk = queue.shift();
        var payload = chunk.map(groupText).join(GROUP);
        var translated = await translateText(payload, target);
        if (myGen !== gen) return;
        var parts = translated ? String(translated).split(/\s*<<<NOVA_GROUP>>>\s*/) : null;
        if (parts && parts.length === chunk.length) {
          for (var i = 0; i < chunk.length; i += 1) applyGroup(chunk[i], parts[i]);
          continue;
        }
        /* The translator merged or dropped groups. Go one block at a time so
           a whole sentence is still translated as a sentence. */
        for (var j = 0; j < chunk.length; j += 1) {
          if (myGen !== gen) return;
          var one = await translateText(groupText(chunk[j]), target);
          if (!one) continue;
          if (chunk[j].length === 1) {
            setNode(chunk[j][0], one);
            continue;
          }
          var pieces = String(one).split(/\s*<<<NOVA_SPLIT>>>\s*/);
          if (pieces.length === chunk[j].length) {
            applyGroup(chunk[j], one);
            continue;
          }
          for (var k = 0; k < chunk[j].length; k += 1) {
            var single = await translateText(chunk[j][k].nodeValue, target);
            if (single) setNode(chunk[j][k], single);
          }
        }
      }
    }
    await Promise.all([worker(), worker(), worker()]);
    if (myGen !== gen) return;
    await translateAttrs(target);
    updateUi();
  }

  /* Runs are serialised and generation-tagged: a fast second language switch
     cancels the one in flight instead of printing two languages on top of
     each other. */
  function requestRun(target) {
    var myGen = ++gen;
    chain = chain.then(
      function () {
        return run(target, myGen);
      },
      function () {
        return run(target, myGen);
      },
    );
    return chain;
  }

  function restore() {
    var all = [];
    if (document.body) {
      var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
      var n;
      while ((n = walker.nextNode())) if (originals.has(n)) all.push(n);
    }
    all.forEach(function (n) {
      n.nodeValue = originals.get(n);
      originals.delete(n);
    });
    restoreAttrs();
    document.documentElement.setAttribute('lang', 'en');
    document.documentElement.setAttribute('dir', 'ltr');
    updateUi();
  }

  function queueTranslate() {
    if (!lang || lang === 'en') return;
    clearTimeout(renderTimer);
    renderTimer = setTimeout(function () {
      requestRun(lang);
    }, 260);
  }

  function startObserver() {
    if (observer || !document.body) return;
    observer = new MutationObserver(function () {
      ensureUi();
      queueTranslate();
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: false });
  }

  function setLang(code, remember) {
    var target = normCode(code);
    try {
      if (remember !== false) localStorage.setItem(STORE_KEY, target);
    } catch (e) {
      /* private mode */
    }
    if (target === 'en') {
      gen += 1; // cancel anything in flight
      lang = null;
      restore();
      return Promise.resolve();
    }
    /* Always translate from the English source, never from the language that is
       currently on screen — otherwise the second switch translates Greek text. */
    if (lang) restore();
    lang = target;
    updateUi();
    return requestRun(lang).then(startObserver);
  }

  /* ------------------------------------------------------------------ UI */

  function css() {
    if (document.getElementById('nv-lang-css')) return;
    /* External stylesheet, not an injected <style> element: the CSP allows
       style-src 'self' only, and a linked sheet keeps the picker styled. */
    var link = document.createElement('link');
    link.id = 'nv-lang-css';
    link.rel = 'stylesheet';
    link.href = '/nova-translate.css';
    document.head.appendChild(link);
  }

  function makeControl(compact, floating) {
    css();
    var wrap = document.createElement('details');
    wrap.className = 'nv-lang' + (floating ? ' nv-lang-float' : '');
    var sum = document.createElement('summary');
    sum.setAttribute('aria-label', 'Change language');
    sum.setAttribute('title', 'Translate this page');
    sum.innerHTML = compact ? '🌐' : '🌐 <span>Translate</span>';
    wrap.appendChild(sum);

    var panel = document.createElement('div');
    panel.className = 'nv-lang-panel';
    var input = document.createElement('input');
    input.type = 'search';
    input.placeholder = 'Search language…';
    input.setAttribute('data-nova-lang-search', '');
    input.setAttribute('aria-label', 'Search language');
    input.setAttribute('translate', 'no');
    panel.appendChild(input);

    var list = document.createElement('div');
    panel.appendChild(list);
    var buttons = [];
    var built = false;

    /* The 109 language buttons are built on the first open, not on load.
       Building them up front cost a ~300 ms long task on every page visit
       (109 elements + listeners) even for the ~99% of visitors who never open
       the dropdown, and it landed inside the interaction window. */
    function buildList() {
      if (built) return;
      built = true;
      LANGS.forEach(function (l) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'nv-lang-btn';
        b.setAttribute('data-nova-lang-option', l[0]);
        b.setAttribute('translate', 'no');
        b.setAttribute('aria-label', l[1] + (l[2] !== l[1] ? ' — ' + l[2] : ''));
        b.innerHTML = l[1] + (l[2] !== l[1] ? ' <small>' + l[2] + '</small>' : '');
        b.addEventListener('click', function () {
          window.__novaLastRun = setLang(l[0]);
          wrap.open = false;
        });
        list.appendChild(b);
        buttons.push({ el: b, hay: (l[0] + ' ' + l[1] + ' ' + l[2]).toLowerCase() });
      });
      syncCurrent(wrap);
      if (input.value.trim()) filter(input.value);
    }

    function filter(value) {
      var q = String(value || '').trim().toLowerCase();
      buttons.forEach(function (item) {
        item.el.style.display = !q || item.hay.indexOf(q) >= 0 ? 'block' : 'none';
      });
    }

    input.addEventListener('input', function () {
      buildList();
      filter(input.value);
    });

    wrap.addEventListener('toggle', function () {
      if (!wrap.open) {
        panel.style.transform = '';
        return;
      }
      buildList();
      input.focus();
      /* Clamp inside the viewport with a transform. Flipping left/right does not
         work here: a header with backdrop-filter is the containing block, so
         `left:0` on a 340px sheet puts it 151px past a 390px screen. */
      panel.style.transform = '';
      var r = panel.getBoundingClientRect();
      var vw = window.innerWidth;
      var dx = 0;
      if (r.right > vw - 8) dx = vw - 8 - r.right;
      else if (r.left < 8) dx = 8 - r.left;
      if (dx) panel.style.transform = 'translateX(' + Math.round(dx) + 'px)';
    });

    wrap.appendChild(panel);
    return { wrap: wrap, buildList: buildList };
  }

  function syncCurrent(root) {
    var current = lang || 'en';
    root.querySelectorAll('[data-nova-lang-option]').forEach(function (b) {
      if (b.getAttribute('data-nova-lang-option') === current) b.setAttribute('aria-current', 'true');
      else b.removeAttribute('aria-current');
    });
  }

  var floatCtl = null;

  function mount() {
    var slot = document.getElementById('nova-lang-slot');
    if (slot) {
      if (!slot.getAttribute('data-nv-mounted')) {
        slot.setAttribute('data-nv-mounted', '1');
        var inline = makeControl(true, false);
        slot.appendChild(inline.wrap);
        ui = inline;
      }
      if (floatCtl) {
        if (floatCtl.wrap.parentNode) floatCtl.wrap.parentNode.removeChild(floatCtl.wrap);
        floatCtl = null;
      }
      updateUi();
      return;
    }
    if (!floatCtl) {
      floatCtl = makeControl(false, true);
      document.body.appendChild(floatCtl.wrap);
    }
    updateUi();
  }

  function ensureUi() {
    var slot = document.getElementById('nova-lang-slot');
    if (slot && !slot.getAttribute('data-nv-mounted')) {
      mount();
      return;
    }
    if (!slot && !floatCtl) mount();
  }

  function updateUi() {
    if (ui) syncCurrent(ui.wrap);
    if (floatCtl) {
      syncCurrent(floatCtl.wrap);
      var name = lang ? langName(lang) : 'Translate';
      var label = floatCtl.wrap.querySelector('summary span');
      if (label) label.textContent = name;
    }
  }

  function detect() {
    var q = new URLSearchParams(window.location.search);
    var fromUrl = q.get('hl');
    if (fromUrl) return Promise.resolve(normCode(fromUrl));
    try {
      var saved = localStorage.getItem(STORE_KEY);
      if (saved) return Promise.resolve(normCode(saved));
    } catch (e) {
      /* private mode */
    }
    // The browser's own locale is an explicit user signal and always wins —
    // including English. Falling through to geo-country here was wrong: a
    // visitor in Sweden with an English browser got Swedish instead of English.
    var rawNav = navigator.language || navigator.userLanguage || '';
    if (rawNav) return Promise.resolve(normCode(rawNav));
    return fetch('/api/geo', { headers: { accept: 'application/json' } })
      .then(function (r) {
        return r.ok ? r.json() : null;
      })
      .then(function (j) {
        var c = j && j.country ? String(j.country).toUpperCase() : '';
        return COUNTRY_LANG[c] || 'en';
      })
      .catch(function () {
        return 'en';
      });
  }

  window.__novaTranslate = function (code) {
    return setLang(code);
  };
  window.__novaGetLang = function () {
    return lang;
  };
  window.__novaLangList = function () {
    return LANGS.slice();
  };
  window.__novaLangName = langName;

  /* The pre-paint script marks `data-nv-pending` when this visit is going to be
     translated, and the platform's CSS keeps the content hidden until the
     translation lands (so the page is painted once, in the right language,
     instead of jumping from English to Greek and scoring a layout shift).
     Clearing the flag is idempotent and always runs — including on failure. */
  function releasePending() {
    var d = document.documentElement;
    if (d && d.hasAttribute('data-nv-pending')) d.removeAttribute('data-nv-pending');
  }

  function boot() {
    mount();
    /* Observe before the first run, not after it. React (the workbench) renders
       its whole UI while the first translation of the boot splash is still in
       flight; when the observer was attached afterwards it missed that render
       and the workbench stayed English. The observer only watches childList, so
       our own text-node updates cannot feed it. */
    startObserver();
    detect()
      .then(function (code) {
        if (code && code !== 'en') return setLang(code);
        updateUi();
        return null;
      })
      .catch(function () {
        /* translation unavailable — show the English page */
      })
      .then(releasePending);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
