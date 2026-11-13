/*
 * WellMatch widget v1.0 — the shopper UI (vanilla ES2020, no dependencies).
 *
 *   Embed in any shop page (floating "Help me choose" button + panel), ONE line:
 *     <script src="wellmatch.js" data-catalog="data/catalog.v1.json" data-lang="kk"></script>
 *   Full page (index.html):
 *     <script src="wellmatch.js" data-mount="#wellmatch"></script>
 *   Programmatic (admin preview):
 *     <script src="wellmatch.js" data-auto-mount="false"></script>
 *     WellMatch.load().then(d => WellMatch.create(el, { mode: 'inline', ...d }))
 *
 * Loads app.js (pure core) and data/embedded.js (file:// fallback) itself when they are missing.
 * All text comes from i18n via t(); everything is rendered with createElement/textContent.
 */
(function () {
  'use strict';

  const SCRIPT = document.currentScript;
  const BASE = new URL('.', (SCRIPT && SCRIPT.src) || location.href).href;
  const OVERRIDE_KEY = 'wellmatch.retailer.v1';
  const PUSH_ACTIONS = new Set(['START', 'BACK', 'SUBMIT', 'CHANGE', 'SELECT', 'RESTART', 'LEAVE', 'RESTORE']);
  const DEMO_RECORD = {
    id: 'WM-99', name: 'Incomplete Demo Record', price: 4000, texture: 'light', fragrance_free: true,
    size_ml: 50, use_time: 'day', in_stock: true, limitation: { en: 'Demo record missing its Kazakh text.' }, fictional: true
  };
  let counter = 0;

  // ------------------------------------------------------------------ loading
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = () => reject(new Error('Could not load ' + src));
      document.head.appendChild(s);
    });
  }
  async function ensureCore() {
    if (!window.WellMatchCore) await loadScript(BASE + 'app.js');
    return window.WellMatchCore;
  }
  async function ensureEmbedded() {
    if (!window.WELLMATCH_EMBEDDED) {
      try { await loadScript(BASE + 'data/embedded.js'); } catch (e) { console.warn('[WellMatch] ' + e.message); }
    }
    return window.WELLMATCH_EMBEDDED || null;
  }
  function ensureStyles() {
    if (document.querySelector('link[data-wellmatch-css]')) return;
    const l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = BASE + 'styles.css';
    l.setAttribute('data-wellmatch-css', '');
    document.head.appendChild(l);
  }
  /** http(s): fetch the real file. file:// (fetch is blocked there): generated copy in data/embedded.js. */
  async function loadJSON(url, key) {
    if (/^https?:$/.test(location.protocol)) {
      try {
        const res = await fetch(url, { cache: 'no-cache' });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return await res.json();
      } catch (e) {
        console.warn(`[WellMatch] Could not fetch ${url} (${e.message}); using the embedded copy.`);
      }
    }
    const emb = await ensureEmbedded();
    return emb ? emb[key] : null;
  }
  /** Retailer edits saved by admin.html for THIS tab only (catalog + rules, never shopper answers). Read-only here. */
  function readOverride() {
    try {
      const raw = sessionStorage.getItem(OVERRIDE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  async function load(opts) {
    const o = opts || {};
    const core = await ensureCore();
    const [catalogJson, en, kk] = await Promise.all([
      loadJSON(o.catalogUrl || BASE + 'data/catalog.v1.json', 'catalog'),
      loadJSON(BASE + 'i18n/en.json', 'en'),
      loadJSON(BASE + 'i18n/kk.json', 'kk')
    ]);
    const params = new URLSearchParams(location.search);
    const demo = new Set((params.get('demo') || '').split(',').map(s => s.trim()).filter(Boolean));
    const dicts = { en: en || {}, kk: Object.assign({}, kk || {}) };
    if (demo.has('missingkey')) delete dicts.kk['btn.back'];
    let json = catalogJson;
    let rules = null;
    let override = false;
    const ov = o.allowOverride === false ? null : readOverride();
    if (ov && ov.catalog) { json = ov.catalog; rules = ov.rules || null; override = true; }
    if (demo.has('incomplete') && json) json = Object.assign({}, json, { products: (json.products || []).concat([DEMO_RECORD]) });
    const loaded = core.loadCatalog(json, { warn: m => console.warn('[WellMatch] ' + m) });
    const original = core.loadCatalog(catalogJson || {}).products;
    return {
      core, dicts, products: loaded.products, hidden: loaded.hidden, rawCatalog: json, originalCatalog: catalogJson,
      originalProducts: original, rules: rules || { catalogVersion: loaded.version || core.CATALOG_VERSION }, override, params
    };
  }

  // ------------------------------------------------------------------ helpers
  function h(tag, props, children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (v == null || v === false) continue;
      if (k === 'text') node.textContent = v;
      else if (k === 'class') node.className = v;
      else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
      else if (k in node && typeof v !== 'string') node[k] = v;
      else node.setAttribute(k, v === true ? '' : String(v));
    }
    for (const c of [].concat(children || [])) {
      if (c == null || c === false) continue;
      node.append(c instanceof Node ? c : document.createTextNode(String(c)));
    }
    return node;
  }

  function focusables(container) {
    return [...container.querySelectorAll('a[href], button, input, select, textarea, summary, [tabindex]:not([tabindex="-1"])')]
      .filter(x => !x.disabled && !x.closest('[inert]') && !x.closest('[hidden]') && x.getClientRects().length > 0)
      .filter(x => !(x.type === 'radio' && !x.checked && container.querySelector(`input[type=radio][name="${x.name}"]:checked`)));
  }
  function trapTab(container, e) {
    const f = focusables(container);
    if (!f.length) return;
    const first = f[0];
    const last = f[f.length - 1];
    if (e.shiftKey && (document.activeElement === first || !container.contains(document.activeElement))) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && (document.activeElement === last || !container.contains(document.activeElement))) { e.preventDefault(); first.focus(); }
  }

  // ------------------------------------------------------------------ widget
  function create(host, cfg) {
    const core = cfg.core;
    const n = ++counter;
    const P = 'wm' + n + '-';
    const mode = cfg.mode || 'page';
    const page = mode === 'page';
    const floating = mode === 'floating';
    const H = { heading: page ? 'h1' : 'h2', sub: page ? 'h2' : 'h3' };
    const rt = {
      products: cfg.products || [],
      hidden: cfg.hidden || [],
      rules: core.normalizeRules(cfg.rules),
      override: !!cfg.override,
      open: { how: false, why: false, history: false },
      scopeOpener: null,
      liveTimer: null,
      ticker: null,
      listeners: []
    };
    const lang0 = core.LANGS.includes(cfg.lang) ? cfg.lang : 'en';
    const i18n = core.createI18n(cfg.dicts || { en: {}, kk: {} }, { lang: lang0 });
    const t = (k, v) => i18n.t(k, v);
    let state = core.createInitialState({ lang: lang0, test: cfg.testId || null, catalogHidden: rt.hidden.length });
    const ctx = () => ({ catalog: rt.products, rules: rt.rules });
    const money = x => core.formatMoney(x, rt.rules.currency);
    const ml = x => t('unit.ml', { n: x });
    const el = {};
    const on = (target, type, fn) => { target.addEventListener(type, fn); rt.listeners.push([target, type, fn]); };

    // ---------------- shell ----------------
    function langGroup(prefix) {
      const btns = core.LANGS.map(l => h('button', {
        type: 'button', class: 'wm-lang-btn', id: P + prefix + '-' + l, lang: l,
        onclick: () => dispatch({ type: 'SET_LANG', lang: l })
      }));
      const group = h('div', { class: 'wm-lang', role: 'group' }, btns);
      (el.langGroups = el.langGroups || []).push({ group, btns });
      return group;
    }

    function buildShell() {
      el.brand = h('span', { class: 'wm-brand', id: P + 'brand' });
      el.panelClose = floating ? h('button', { type: 'button', class: 'wm-btn wm-btn-secondary wm-btn-small', id: P + 'panel-close', onclick: closePanel }) : null;
      el.testLabel = h('span', { class: 'wm-test-label' });
      el.taskLabel = h('label', { for: P + 'task' });
      el.task = h('select', { id: P + 'task', onchange: e => { dispatch({ type: 'SET_TASK', task: e.target.value }, { render: false }); } },
        [h('option', { value: '' })].concat(core.TASKS.map(x => h('option', { value: x, text: x }))));
      el.metrics = h('span', { class: 'wm-test-metrics', id: P + 'metrics' });
      el.download = h('button', { type: 'button', class: 'wm-btn wm-btn-secondary wm-btn-small', onclick: downloadLog });
      el.testbar = h('div', { class: 'wm-testbar', hidden: !state.test }, [
        h('div', { class: 'wm-wrap wm-testbar-inner' }, [el.testLabel, h('span', { class: 'wm-test-task' }, [el.taskLabel, el.task]), el.metrics, el.download])
      ]);
      el.header = h(page ? 'header' : 'div', { class: 'wm-header' }, [
        h('div', { class: 'wm-wrap wm-bar' }, [el.brand, h('div', { class: 'wm-bar-end' }, [langGroup('hdr'), el.panelClose])]),
        el.testbar
      ]);
      el.notice = h('p', { class: 'wm-notice', hidden: true });
      el.main = h(page ? 'main' : 'div', { class: 'wm-wrap wm-main', id: P + 'main', tabindex: '-1' });
      el.footNotice = h('p');
      el.footVersion = h('p');
      el.retailer = page ? h('a', { href: BASE + 'admin.html' }) : null;
      el.footer = h(page ? 'footer' : 'div', { class: 'wm-footer' }, [
        h('div', { class: 'wm-wrap' }, [el.footNotice, el.footVersion, el.retailer ? h('p', {}, [el.retailer]) : null])
      ]);
      el.app = h('div', { class: 'wm-app' }, [el.header, h('div', { class: 'wm-wrap' }, [el.notice]), el.main, el.footer]);
      el.live = h('div', { class: 'wm-vh', 'aria-live': 'polite', 'aria-atomic': 'true' });

      el.scopeTitle = h('h2', { id: P + 'scope-title' });
      el.scopeBodies = [h('p', { id: P + 'scope-body' }), h('p'), h('p')];
      el.scopeClose = h('button', { type: 'button', class: 'wm-btn wm-btn-primary', onclick: closeScope });
      el.dialogBox = h('div', { class: 'wm-dialog', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': P + 'scope-title', 'aria-describedby': P + 'scope-body' },
        [langGroup('dlg'), el.scopeTitle].concat(el.scopeBodies, [h('div', { class: 'wm-actions' }, [el.scopeClose])]));
      el.dialog = h('div', { class: 'wm-dialog-backdrop', hidden: true }, [el.dialogBox]);
      on(el.dialog, 'click', e => { if (e.target === el.dialog) closeScope(); });
      on(el.dialogBox, 'keydown', e => {
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeScope(); }
        else if (e.key === 'Tab') trapTab(el.dialogBox, e);
      });

      if (floating) {
        el.launch = h('button', { type: 'button', class: 'wm-launch', 'aria-expanded': 'false', 'aria-controls': P + 'panel', onclick: openPanel });
        el.panel = h('div', { class: 'wm-panel', id: P + 'panel', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': P + 'brand', hidden: true },
          [el.app, el.live, el.dialog]);
        on(el.panel, 'keydown', e => {
          if (e.key === 'Escape' && el.dialog.hidden) { e.preventDefault(); closePanel(); }
          else if (e.key === 'Tab' && el.dialog.hidden) trapTab(el.panel, e);
        });
        el.root = h('div', { class: 'wm wm-floating' }, [el.launch, el.panel]);
      } else {
        el.root = h('div', { class: `wm wm-${mode}` }, [el.app, el.live, el.dialog]);
      }
      host.appendChild(el.root);
    }

    // ---------------- dispatch / routing ----------------
    function syncHash(replace) {
      const want = '#' + core.hashForState(state);
      if (location.hash === want) return;
      if (replace) {
        try { history.replaceState(null, '', want); } catch (e) { location.replace(want); }
      } else location.hash = want;
    }

    function dispatch(action, opts) {
      const o = opts || {};
      const prev = state;
      state = core.reduce(state, action, ctx());
      i18n.setLang(state.lang);
      if (page) syncHash(!PUSH_ACTIONS.has(action.type));
      if (state === prev) return;
      if (o.render === false) { renderMetrics(); return; }
      render({
        prevScreen: prev.screen,
        focusInvalid: action.type === 'SUBMIT' && state.screen === 's1' && Object.keys(state.errors).length > 0
      });
      if (action.type === 'SELECT' && state.screen === 's3' && typeof cfg.onSelect === 'function') cfg.onSelect(state.selected);
    }

    // ---------------- rendering ----------------
    function announce(text) {
      el.live.textContent = '';
      setTimeout(() => { el.live.textContent = text; }, 60);
    }
    function heading(text) {
      return h(H.heading, { tabindex: '-1', 'data-wm-heading': '', text });
    }

    function render(info) {
      const i = info || {};
      const changed = i.prevScreen !== undefined && i.prevScreen !== state.screen;
      const active = document.activeElement;
      const keepId = !changed && active && el.main.contains(active) && active.id ? active.id : null;
      const caret = keepId && typeof active.selectionStart === 'number' ? [active.selectionStart, active.selectionEnd] : null;

      if (page) document.documentElement.lang = state.lang;
      el.root.setAttribute('lang', state.lang);
      renderChrome();
      const builders = { s0: screenConsent, s1: screenQuestions, s2: screenResults, s2b: screenNoMatch, s3: screenSelected };
      el.main.replaceChildren(...builders[state.screen]().filter(Boolean));
      if (!el.dialog.hidden) renderScope();
      const hd = el.main.querySelector('[data-wm-heading]');
      if (page) document.title = (hd ? hd.textContent + ' · ' : '') + t('app.name');

      if (keepId) {
        const x = document.getElementById(keepId);
        if (x) {
          x.focus();
          if (caret && x.setSelectionRange) { try { x.setSelectionRange(caret[0], caret[1]); } catch (e) { /* not a text input */ } }
        }
      }
      if (changed) {
        if (hd && (!floating || !el.panel.hidden)) hd.focus();
        if (state.screen === 's2' || state.screen === 's2b') announce(resultAnnouncement());
      }
      if (i.focusInvalid) focusField(core.ANSWER_FIELDS.find(f => state.errors[f]));
    }

    function resultAnnouncement() {
      const an = core.analyse(rt.products, state.submitted, rt.rules);
      const base = state.results.length ? t('results.count', { n: an.eligible.length, total: an.total }) : t('nomatch.title');
      return state.revision ? base + '. ' + revisionText(state.revision) : base;
    }

    function renderChrome() {
      el.brand.textContent = t('app.name');
      for (const { group, btns } of el.langGroups) {
        group.setAttribute('aria-label', t('lang.switch'));
        btns.forEach((b, idx) => {
          const l = core.LANGS[idx];
          b.replaceChildren(h('span', { 'aria-hidden': 'true', text: t('lang.' + l) }), h('span', { class: 'wm-vh', text: t('lang.' + l + '.name') }));
          b.setAttribute('aria-pressed', String(state.lang === l));
        });
      }
      if (floating) {
        el.launch.textContent = t('widget.launch');
        el.panelClose.textContent = t('btn.close');
        el.panelClose.setAttribute('aria-label', t('widget.close'));
      }
      el.testbar.hidden = !state.test;
      if (state.test) {
        el.testLabel.textContent = t('test.session', { id: state.test });
        el.taskLabel.textContent = t('test.task');
        el.task.options[0].textContent = t('test.task.none');
        el.task.value = state.task || '';
        el.download.textContent = t('test.download');
        renderMetrics();
      }
      const notes = [];
      if (rt.override) notes.push(t('catalog.override'));
      if (state.catalogHidden) notes.push(t('catalog.hidden', { n: state.catalogHidden }));
      el.notice.hidden = !notes.length;
      el.notice.textContent = notes.join(' ');
      el.footNotice.textContent = t('footer');
      el.footVersion.textContent = t('footer.version', { app: core.APP_VERSION, catalog: rt.rules.catalogVersion });
      if (el.retailer) el.retailer.textContent = t('footer.retailer');
    }

    function renderMetrics() {
      if (!state.test) return;
      const m = core.summarizeMetrics(state.metrics, Date.now());
      el.metrics.textContent = [
        t('test.timer', { s: m.elapsedSeconds == null ? 0 : Math.floor(m.elapsedSeconds) }),
        t('test.errors', { n: m.validationErrors }),
        t('test.revisions', { n: m.revisions }),
        t('test.langSwitches', { n: m.langSwitches })
      ].join(' · ');
    }

    function progress(step) {
      return h('div', { class: 'wm-progress' }, [
        h('p', { class: 'wm-progress-text', text: t('progress', { n: step }) }),
        h('div', { class: 'wm-progress-track', 'aria-hidden': 'true' }, [h('div', { class: 'wm-progress-fill', style: `width:${Math.round((step / 3) * 100)}%` })])
      ]);
    }
    function scopeLink() {
      const btn = h('button', { type: 'button', class: 'wm-link', id: P + 'scope-link', text: t('scope.link') });
      btn.addEventListener('click', () => openScope(btn));
      return h('p', { class: 'wm-scope-row' }, [btn]);
    }
    function valueLabel(field, v) {
      if (field === 'budget') return money(v);
      if (v == null) return t(field + '.none');
      return t(field + '.' + v);
    }
    function summaryText(a) {
      return [money(a.budget), t('texture.' + a.texture), t('fragrance.' + a.fragrance),
        a.useTime ? t('useTime.' + a.useTime) : null, a.size ? t('size.' + a.size) : null].filter(Boolean).join(' · ');
    }

    // ----- S0 -----
    function screenConsent() {
      const start = h('button', {
        type: 'button', class: 'wm-btn wm-btn-primary', id: P + 'start', disabled: !state.consent, text: t('btn.start'),
        onclick: () => dispatch({ type: 'START' })
      });
      const cb = h('input', {
        type: 'checkbox', id: P + 'consent', checked: state.consent,
        onchange: e => { dispatch({ type: 'SET_CONSENT', value: e.target.checked }, { render: false }); start.disabled = !state.consent; },
        onkeydown: e => { if (e.key === 'Enter') { e.preventDefault(); cb.click(); } }
      });
      return [
        heading(t('consent.title')),
        h('p', { class: 'wm-lead', text: t('consent.intro') }),
        h('ul', { class: 'wm-list' }, ['consent.p1', 'consent.p2', 'consent.p3', 'consent.p4'].map(k => h('li', { text: t(k) }))),
        state.test ? h('p', { class: 'wm-test-note', text: t('consent.test') }) : null,
        h('label', { class: 'wm-check', for: P + 'consent' }, [cb, h('span', { text: t('consent.check') })]),
        h('div', { class: 'wm-actions' }, [start]),
        scopeLink()
      ];
    }

    // ----- S1 -----
    const BASE_DESC = { budget: 'budget-hint', texture: '', fragrance: 'fragrance-note', useTime: '', size: '' };
    function errorMessage(field, code) {
      if (field === 'budget') return t(code === 'tooLarge' ? 'error.budget.large' : 'error.budget');
      return t('error.' + field);
    }
    function setFieldError(field, code, scope) {
      const root = scope || el.main;
      const err = root.querySelector('#' + P + field + '-error');
      if (!err) return;
      err.textContent = code ? errorMessage(field, code) : '';
      err.hidden = !code;
      const inputs = field === 'budget' ? [root.querySelector('#' + P + 'budget')] : [...root.querySelectorAll(`input[name="${P + field}"]`)];
      const desc = [BASE_DESC[field] ? P + BASE_DESC[field] : '', code ? P + field + '-error' : ''].filter(Boolean).join(' ');
      for (const inp of inputs) {
        if (code) inp.setAttribute('aria-invalid', 'true'); else inp.removeAttribute('aria-invalid');
        if (desc) inp.setAttribute('aria-describedby', desc); else inp.removeAttribute('aria-describedby');
      }
      const group = root.querySelector('#' + P + field + '-group');
      if (group) group.classList.toggle('wm-invalid', !!code);
    }
    function focusField(field) {
      if (!field) return;
      if (field === 'budget') { const b = document.getElementById(P + 'budget'); if (b) b.focus(); return; }
      const radios = [...el.main.querySelectorAll(`input[name="${P + field}"]`)];
      const target = radios.find(r => r.checked) || radios[0];
      if (target) target.focus();
    }
    function liveText() {
      const c = core.liveCount(rt.products, state.answers, rt.rules);
      return t('live.count', { n: c.n, total: c.total });
    }
    function scheduleLive() {
      clearTimeout(rt.liveTimer);
      rt.liveTimer = setTimeout(() => {
        const node = document.getElementById(P + 'live-count');
        if (node) node.textContent = liveText();
      }, 150);
    }
    function choiceGroup(name, options, legendKey, noteKey, soft) {
      const row = h('div', { class: 'wm-choices' + (options.length === 4 ? ' wm-choices-4' : '') });
      for (const opt of options) {
        const rid = P + name + '-' + opt;
        const value = opt === 'none' ? null : opt;
        const checked = soft ? (state.answers[name] || 'none') === opt : state.answers[name] === opt;
        const input = h('input', {
          type: 'radio', name: P + name, id: rid, value: opt, checked,
          onchange: () => { dispatch({ type: 'SET_ANSWER', field: name, value }, { render: false }); setFieldError(name, null); scheduleLive(); }
        });
        row.append(h('div', { class: 'wm-choice' }, [input, h('label', { for: rid, text: t(`${name}.${opt}`) })]));
      }
      return h('fieldset', { class: 'wm-field', id: P + name + '-group' }, [
        h('legend', { text: t(legendKey) }),
        noteKey ? h('p', { class: 'wm-hint', id: P + name + '-note', text: t(noteKey) }) : null,
        row,
        h('p', { class: 'wm-error', id: P + name + '-error', hidden: true })
      ]);
    }
    function screenQuestions() {
      const budget = h('input', {
        class: 'wm-input', id: P + 'budget', name: P + 'budget', type: 'text', inputmode: 'numeric',
        autocomplete: 'off', spellcheck: 'false', 'aria-describedby': P + 'budget-hint',
        oninput: e => { dispatch({ type: 'SET_ANSWER', field: 'budget', value: e.target.value }, { render: false }); setFieldError('budget', null); scheduleLive(); }
      });
      budget.value = state.answers.budget;
      const form = h('form', { novalidate: true, onsubmit: e => { e.preventDefault(); dispatch({ type: 'SUBMIT' }); } }, [
        h('div', { class: 'wm-field', id: P + 'budget-group' }, [
          h('label', { for: P + 'budget', text: t('q.budget') }),
          h('p', { class: 'wm-hint', id: P + 'budget-hint', text: t('q.budget.hint') }),
          budget,
          h('p', { class: 'wm-error', id: P + 'budget-error', hidden: true })
        ]),
        choiceGroup('texture', core.TEXTURES, 'q.texture'),
        choiceGroup('fragrance', core.FRAGRANCES, 'q.fragrance', 'q.fragrance.note'),
        h('div', { class: 'wm-soft', role: 'group', 'aria-labelledby': P + 'soft-title' }, [
          h(H.sub, { id: P + 'soft-title', text: t('q.soft.title') }),
          h('p', { class: 'wm-hint', text: t('q.soft.note') }),
          choiceGroup('useTime', ['none'].concat(core.USE_TIMES), 'q.useTime', null, true),
          choiceGroup('size', ['none'].concat(core.SIZES), 'q.size', null, true)
        ]),
        h('p', { class: 'wm-live-count', id: P + 'live-count', role: 'status', text: liveText() }),
        h('div', { class: 'wm-actions' }, [
          h('button', { type: 'button', class: 'wm-btn wm-btn-secondary', id: P + 'back', text: t('btn.back'), onclick: () => dispatch({ type: 'BACK' }) }),
          h('button', { type: 'submit', class: 'wm-btn wm-btn-primary', id: P + 'show', text: t('btn.show') })
        ])
      ]);
      for (const [f, code] of Object.entries(state.errors)) setFieldError(f, code, form);
      return [progress(1), heading(t('q.title')), form];
    }

    // ----- S2 / S2b shared parts -----
    function reasonText(p, a) {
      return core.reasons(p, a).map(code => {
        if (code === 'texture') return t('results.textureMatch', { texture: t('texture.' + p.texture) });
        if (code === 'budget') return t('results.withinBudget', { budget: money(a.budget) });
        if (code === 'fragranceFree') return t('results.fragranceFree');
        if (code === 'useTime') return t('reason.useTime.' + a.useTime);
        return t('reason.size.' + a.size, { ml: p.size_ml });
      }).join(' · ');
    }
    function limitText(p, a) {
      const extra = core.softLimitations(p, a).map(code => {
        if (code === 'fragrance') return t('limit.fragrance');
        if (code === 'useTime') return t('limit.useTime.' + p.use_time);
        return t('limit.size.' + a.size, { ml: p.size_ml });
      });
      return [p.limitation[state.lang] || p.limitation.en].concat(extra).join(' · ');
    }
    function howSteps(a, an) {
      const prefs = [a.useTime ? t('useTime.' + a.useTime) : null, a.size ? t('size.' + a.size) : null].filter(Boolean).join(', ');
      return [
        t('results.how.start', { n: an.total }),
        t('results.how.stock', { n: an.stock }),
        t('results.how.price', { budget: money(a.budget), n: an.price }),
        t('results.how.texture', { texture: t('texture.' + a.texture), n: an.texture }),
        an.fragranceMode === 'hard' ? t('results.how.fragranceFree', { n: an.fragrance })
          : an.fragranceMode === 'soft' ? t('results.how.fragranceSoft', { n: an.fragrance })
            : t('results.how.fragranceAny', { fragrance: t('fragrance.' + a.fragrance), n: an.fragrance }),
        an.softApplied ? t('results.how.soft', { prefs, max: an.max, n: an.shown.length }) : t('results.how.order', { max: an.max, n: an.shown.length })
      ];
    }
    function details(key, summaryText, body) {
      const d = h('details', { class: 'wm-details', id: P + key, open: rt.open[key] }, [h('summary', { text: summaryText })].concat(body));
      d.addEventListener('toggle', () => { rt.open[key] = d.open; });
      return d;
    }
    function howExpander(a, an) {
      return details('how', t('results.how'), [h('ol', {}, howSteps(a, an).map(s => h('li', { text: s })))]);
    }
    function whyNotReason(r) {
      if (r.code === 'price') return t('whynot.price', { price: money(r.price), budget: money(r.budget) });
      if (r.code === 'texture') return t('whynot.texture', { texture: t('texture.' + r.texture), wanted: t('texture.' + r.wanted) });
      if (r.code === 'fragrance') return t('whynot.fragrance');
      if (r.code === 'stock') return t('whynot.stock');
      return t('whynot.cap', { rank: r.rank, max: r.max });
    }
    function whyNotExpander(an) {
      const body = an.excluded.length
        ? h('ul', {}, an.excluded.map(e => h('li', {
          text: t('whynot.item', { id: e.product.id, name: e.product.name, reasons: e.reasons.map(whyNotReason).join('; ') })
        })))
        : h('p', { class: 'wm-hint', text: t('whynot.none') });
      return details('why', t('whynot.title', { n: an.excluded.length }), [body]);
    }
    function revisionText(rev) {
      const changes = rev.changes.map(c => t('revision.field', { field: t('field.' + c.field), from: valueLabel(c.field, c.from), to: valueLabel(c.field, c.to) })).join(', ');
      const delta = rev.delta === 0 ? t('revision.same') : t('revision.delta', { n: Math.abs(rev.delta), sign: rev.delta > 0 ? '+' : '−' });
      const items = rev.added.map(x => t('revision.added.' + x.because, { id: x.id, max: rev.max }))
        .concat(rev.removed.map(x => t('revision.removed.' + x.because, { id: x.id, max: rev.max })));
      return t('revision.title', { changes, delta }) + (items.length ? ' (' + items.join(', ') + ')' : '');
    }
    function revisionBanner() {
      return state.revision ? h('p', { class: 'wm-revision', id: P + 'revision', text: revisionText(state.revision) }) : null;
    }
    function historyBlock() {
      if (state.history.length < 2) return null;
      const list = h('ul', { class: 'wm-history-list' }, state.history.map((entry, idx) => h('li', {}, [
        h('button', {
          type: 'button', class: 'wm-link', id: P + 'hist-' + idx,
          'aria-current': core.sameAnswers(entry.answers, state.submitted) ? 'true' : null,
          text: t('history.item', { summary: summaryText(entry.answers), n: entry.count }),
          onclick: () => dispatch({ type: 'RESTORE', index: idx })
        })
      ])));
      return details('history', t('history.title', { n: state.history.length }), [h('p', { class: 'wm-hint', text: t('history.hint') }), list]);
    }
    function printBlock(a, an) {
      return h('div', { class: 'wm-print-only' }, [
        h('ol', {}, howSteps(a, an).map(s => h('li', { text: s }))),
        h('p', { text: t('print.footer', { date: new Date().toISOString().slice(0, 10), app: core.APP_VERSION, catalog: rt.rules.catalogVersion }) })
      ]);
    }

    // ----- S2 -----
    function productCard(p, a, idx) {
      const inCmp = state.compare.includes(p.id);
      const cmp = h('input', {
        type: 'checkbox', id: P + 'cmp-' + p.id, checked: inCmp, disabled: !inCmp && state.compare.length >= 2,
        'aria-label': t('compare.label.aria', { name: p.name }),
        onchange: () => dispatch({ type: 'TOGGLE_COMPARE', id: p.id })
      });
      return h('li', { class: 'wm-card' }, [
        h('div', { class: 'wm-ph', 'aria-hidden': 'true' }),
        h('div', {}, [
          h(H.sub, { text: p.name }),
          h('p', { class: 'wm-meta' }, [h('span', { class: 'wm-price', text: money(p.price) }), ' · ', ml(p.size_ml), ' · ', t('useTime.' + p.use_time)]),
          h('p', { class: 'wm-why' }, [h('strong', { text: t('results.why') }), ' ', reasonText(p, a)]),
          h('p', { class: 'wm-limit' }, [h('strong', { text: t('results.limit') }), ' ', limitText(p, a)]),
          h('div', { class: 'wm-card-actions' }, [
            state.results.length > 1 ? h('label', { class: 'wm-compare-check', for: cmp.id }, [cmp, h('span', { text: t('compare.label') })]) : null,
            h('button', {
              type: 'button', class: 'wm-btn wm-btn-primary', id: P + 'sel-' + p.id, text: t('btn.select'),
              'aria-label': t('btn.select.aria', { name: p.name }),
              onclick: () => dispatch({ type: 'SELECT', id: p.id })
            })
          ])
        ])
      ]);
    }
    function compareBlock(a) {
      if (state.results.length < 2) return null;
      if (state.compare.length < 2) return h('p', { class: 'wm-hint wm-compare-hint', text: t('compare.hint') });
      const [x, y] = state.compare.map(id => state.results.find(p => p.id === id));
      const ff = p => t(p.fragrance_free ? 'compare.ff.yes' : 'compare.ff.no');
      const rows = [
        ['price', money(x.price), money(y.price)],
        ['texture', t('texture.' + x.texture), t('texture.' + y.texture)],
        ['fragrance', ff(x), ff(y)],
        ['size', ml(x.size_ml), ml(y.size_ml)],
        ['useTime', t('useTime.' + x.use_time), t('useTime.' + y.use_time)],
        ['limitation', limitText(x, a), limitText(y, a)]
      ];
      const table = h('table', { class: 'wm-compare-table', id: P + 'compare' }, [
        h('caption', { text: t('compare.title') }),
        h('thead', {}, [h('tr', {}, [h('td'), h('th', { scope: 'col', text: x.name }), h('th', { scope: 'col', text: y.name })])]),
        h('tbody', {}, rows.map(([key, vx, vy]) => {
          const diff = vx !== vy;
          return h('tr', { class: diff ? 'wm-diff' : null }, [
            h('th', { scope: 'row' }, [t('compare.row.' + key), diff ? h('span', { class: 'wm-differs', text: t('compare.differs') }) : null]),
            h('td', { text: vx }),
            h('td', { text: vy })
          ]);
        }))
      ]);
      return h('div', {}, [h('p', { class: 'wm-hint wm-compare-hint', text: t('compare.limit') }), h('div', { class: 'wm-table-wrap' }, [table])]);
    }
    function screenResults() {
      const a = state.submitted;
      const an = core.analyse(rt.products, a, rt.rules);
      const count = h('p', { class: 'wm-count', id: P + 'count' }, [t('results.count', { n: an.eligible.length, total: an.total })]);
      if (an.eligible.length > state.results.length) count.append(' ', h('span', { class: 'wm-count-sub', text: t('results.capped', { shown: state.results.length }) }));
      return [
        progress(2),
        heading(t('results.title')),
        revisionBanner(),
        h('div', { class: 'wm-summary' }, [
          h('span', { class: 'wm-summary-label', text: t('results.summary') }),
          h('span', { class: 'wm-chip', text: summaryText(a) }),
          h('button', { type: 'button', class: 'wm-link', id: P + 'change', text: t('results.changeLink'), onclick: () => dispatch({ type: 'CHANGE' }) })
        ]),
        count,
        h('ul', { class: 'wm-cards' }, state.results.map((p, idx) => productCard(p, a, idx))),
        compareBlock(a),
        howExpander(a, an),
        whyNotExpander(an),
        historyBlock(),
        h('p', { class: 'wm-note', text: t('results.note') }),
        printBlock(a, an),
        scopeLink()
      ];
    }

    // ----- S2b -----
    function screenNoMatch() {
      const a = state.submitted;
      const an = core.analyse(rt.products, a, rt.rules);
      return [
        progress(2),
        heading(t('nomatch.title')),
        revisionBanner(),
        h('div', { class: 'wm-panel-warn' }, [
          h('p', { class: 'wm-strong', text: t('nomatch.body', { budget: money(a.budget), texture: t('texture.' + a.texture), fragrance: t('fragrance.' + a.fragrance), total: an.total }) }),
          h('p', { text: t('nomatch.hint') })
        ]),
        howExpander(a, an),
        whyNotExpander(an),
        historyBlock(),
        h('div', { class: 'wm-actions' }, [
          h('button', { type: 'button', class: 'wm-btn wm-btn-primary', id: P + 'change', text: t('btn.change'), onclick: () => dispatch({ type: 'CHANGE' }) }),
          h('button', { type: 'button', class: 'wm-btn wm-btn-secondary', id: P + 'leave', text: t('btn.leave'), onclick: () => dispatch({ type: 'LEAVE' }) })
        ]),
        scopeLink()
      ];
    }

    // ----- S3 -----
    function hostTile(id) {
      if (!floating) return null;
      return [...document.querySelectorAll('[data-wm-id]')].find(x => x.getAttribute('data-wm-id') === id && !el.root.contains(x)) || null;
    }
    // ----- S3 feedback form (all optional; saved into the in-memory session and the JSON download) -----
    function draftValue(field) {
      return state.feedbackDraft && state.feedbackDraft[field] != null ? state.feedbackDraft[field] : null;
    }
    function setFeedbackField(field, value) {
      dispatch({ type: 'SET_FEEDBACK_FIELD', field, value }, { render: false });
      const err = document.getElementById(P + 'fb-error');
      if (err) { err.hidden = true; err.textContent = ''; }
      const st = document.getElementById(P + 'fb-status');
      if (st) st.textContent = '';
      const ta = document.getElementById(P + 'fb-comment');
      if (ta) ta.removeAttribute('aria-invalid');
    }
    function feedbackSaved() {
      if (!state.feedbackForm) return false;
      const v = core.validateFeedback(state.feedbackDraft);
      return v.ok && JSON.stringify(v.value) === JSON.stringify(state.feedbackForm);
    }
    function scaleGroup(field, legendKey, scaleKey) {
      const row = h('div', { class: 'wm-scale' });
      for (let v = 1; v <= 5; v++) {
        const rid = P + 'fb-' + field + '-' + v;
        row.append(h('div', { class: 'wm-choice' }, [
          h('input', {
            type: 'radio', name: P + 'fb-' + field, id: rid, value: String(v), checked: draftValue(field) === v,
            'aria-describedby': P + 'fb-' + field + '-scale', onchange: () => setFeedbackField(field, v)
          }),
          h('label', { for: rid, text: String(v) })
        ]));
      }
      return h('fieldset', { class: 'wm-field', id: P + 'fb-' + field + '-group' }, [
        h('legend', { text: t(legendKey) }),
        h('p', { class: 'wm-hint', id: P + 'fb-' + field + '-scale', text: t(scaleKey) }),
        row
      ]);
    }
    function feedbackForm() {
      const errs = state.feedbackErrors || {};
      const errText = errs.comment ? t('feedback.error.tooLong') : errs.form ? t('feedback.error.empty') : '';
      const comment = h('textarea', {
        class: 'wm-input wm-textarea', id: P + 'fb-comment', rows: '4', maxlength: String(core.COMMENT_MAX),
        'aria-describedby': P + 'fb-comment-hint ' + P + 'fb-comment-count' + (errs.comment ? ' ' + P + 'fb-error' : ''),
        'aria-invalid': errs.comment ? 'true' : null,
        oninput: e => {
          setFeedbackField('comment', e.target.value);
          document.getElementById(P + 'fb-comment-count').textContent = t('feedback.comment.count', { n: e.target.value.length });
        }
      });
      comment.value = draftValue('comment') || '';
      const would = h('div', { class: 'wm-choices' }, core.WOULD_USE.map(o => {
        const rid = P + 'fb-wouldUse-' + o;
        return h('div', { class: 'wm-choice' }, [
          h('input', { type: 'radio', name: P + 'fb-wouldUse', id: rid, value: o, checked: draftValue('wouldUse') === o, onchange: () => setFeedbackField('wouldUse', o) }),
          h('label', { for: rid, text: t('feedback.wouldUse.' + o) })
        ]);
      }));
      return h('form', {
        class: 'wm-feedback', id: P + 'fb-form', novalidate: true, 'aria-labelledby': P + 'fb-title',
        onsubmit: e => {
          e.preventDefault();
          dispatch({ type: 'SUBMIT_FEEDBACK' });
          const target = document.getElementById(P + (Object.keys(state.feedbackErrors).length ? (state.feedbackErrors.comment ? 'fb-comment' : 'fb-error') : 'fb-status'));
          if (target) target.focus();
        }
      }, [
        h(H.sub, { id: P + 'fb-title', text: t('feedback.title') }),
        scaleGroup('clarity', 'feedback.label', 'feedback.scale'),
        scaleGroup('ease', 'feedback.ease', 'feedback.ease.scale'),
        scaleGroup('confidence', 'feedback.confidence', 'feedback.confidence.scale'),
        h('fieldset', { class: 'wm-field', id: P + 'fb-wouldUse-group' }, [h('legend', { text: t('feedback.wouldUse') }), would]),
        h('div', { class: 'wm-field' }, [
          h('label', { for: P + 'fb-comment', text: t('feedback.comment') }),
          h('p', { class: 'wm-hint', id: P + 'fb-comment-hint', text: t('feedback.comment.hint') }),
          comment,
          h('p', { class: 'wm-hint wm-count-hint', id: P + 'fb-comment-count', text: t('feedback.comment.count', { n: comment.value.length }) })
        ]),
        h('p', { class: 'wm-error', id: P + 'fb-error', tabindex: '-1', hidden: !errText, text: errText }),
        h('button', { type: 'submit', class: 'wm-btn wm-btn-secondary', id: P + 'fb-save', text: t('btn.saveFeedback') }),
        h('p', { class: 'wm-rating-status', id: P + 'fb-status', role: 'status', tabindex: '-1', text: feedbackSaved() ? t('feedback.saved') : '' })
      ]);
    }
    function downloadBlock() {
      return h('div', { class: 'wm-download', role: 'group', 'aria-labelledby': P + 'dl-title' }, [
        h(H.sub, { id: P + 'dl-title', text: t('download.title') }),
        h('p', { class: 'wm-hint', id: P + 'dl-hint', text: t('download.hint') }),
        h('button', { type: 'button', class: 'wm-btn wm-btn-secondary', id: P + 'download-session', 'aria-describedby': P + 'dl-hint', text: t('btn.downloadSession'), onclick: downloadLog })
      ]);
    }

    function screenSelected() {
      const p = state.results.find(x => x.id === state.selected);
      const tile = hostTile(p.id);
      return [
        progress(3),
        heading(t('selected.title', { name: p.name })),
        h('p', { class: 'wm-meta' }, [h('span', { class: 'wm-price', text: money(p.price) }), ' · ', ml(p.size_ml)]),
        h('p', { class: 'wm-disclaimer', text: t('selected.body') }),
        feedbackForm(),
        downloadBlock(),
        h('div', { class: 'wm-actions' }, [
          tile ? h('button', {
            type: 'button', class: 'wm-btn wm-btn-secondary', id: P + 'show-in-shop', text: t('btn.showInShop'),
            onclick: () => { closePanel(); tile.focus(); }
          }) : null,
          h('button', { type: 'button', class: 'wm-btn wm-btn-primary', id: P + 'restart', text: t('btn.restart'), onclick: () => dispatch({ type: 'RESTART' }) })
        ])
      ];
    }

    // ---------------- dialog / panel ----------------
    function renderScope() {
      el.scopeTitle.textContent = t('scope.title');
      ['scope.body', 'scope.body2', 'scope.body3'].forEach((k, idx) => { el.scopeBodies[idx].textContent = t(k); });
      el.scopeClose.textContent = t('btn.close');
    }
    function openScope(opener) {
      rt.scopeOpener = opener;
      renderScope();
      el.dialog.hidden = false;
      el.app.inert = true;
      el.app.setAttribute('aria-hidden', 'true');
      el.scopeClose.focus();
    }
    function closeScope() {
      if (el.dialog.hidden) return;
      el.dialog.hidden = true;
      el.app.inert = false;
      el.app.removeAttribute('aria-hidden');
      const target = rt.scopeOpener && rt.scopeOpener.isConnected ? rt.scopeOpener : document.getElementById(P + 'scope-link');
      if (target) target.focus();
      rt.scopeOpener = null;
    }
    function openPanel() {
      if (!floating || !el.panel.hidden) return;
      el.panel.hidden = false;
      el.launch.setAttribute('aria-expanded', 'true');
      const hd = el.main.querySelector('[data-wm-heading]');
      if (hd) hd.focus();
    }
    function closePanel() {
      if (!floating || el.panel.hidden) return;
      closeScope();
      el.panel.hidden = true;
      el.launch.setAttribute('aria-expanded', 'false');
      el.launch.focus();
    }

    // ---------------- test log ----------------
    function downloadLog() {
      const now = new Date();
      const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
      const blob = new Blob([core.exportLog(state, { catalogVersion: rt.rules.catalogVersion, now: now.toISOString() })], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = h('a', { href: url, download: `${state.test || 'session'}_${stamp}.json`, hidden: true });
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    }

    // ---------------- keyboard shortcuts (F23) ----------------
    function onKey(e) {
      if (e.altKey && !e.ctrlKey && !e.metaKey && e.code === 'KeyL') {
        if (floating && el.panel.hidden) return;
        e.preventDefault();
        dispatch({ type: 'SET_LANG', lang: state.lang === 'en' ? 'kk' : 'en' });
      }
    }

    // ---------------- boot ----------------
    buildShell();
    if (page) {
      const parsed = core.parseHash(location.hash);
      state = core.reduce(state, { type: 'NAVIGATE', screen: parsed.screen, params: parsed.params }, ctx());
      i18n.setLang(state.lang);
      syncHash(true);
      on(window, 'hashchange', () => {
        const p = core.parseHash(location.hash);
        dispatch({ type: 'NAVIGATE', screen: p.screen, params: p.params });
      });
    }
    if (page || floating) on(document, 'keydown', onKey);
    if (state.test) rt.ticker = setInterval(renderMetrics, 1000);
    render({});

    return {
      get state() { return state; },
      dispatch,
      open: openPanel,
      close: closePanel,
      /** Admin preview: swap catalog / rules live; results recompute immediately. */
      update(next) {
        if (next.products) rt.products = next.products;
        if (next.hidden) rt.hidden = next.hidden;
        if (next.rules) rt.rules = core.normalizeRules(next.rules);
        state = core.reduce(state, { type: 'RECOMPUTE', catalogHidden: rt.hidden.length }, ctx());
        render({});
      },
      destroy() {
        clearInterval(rt.ticker);
        clearTimeout(rt.liveTimer);
        for (const [target, type, fn] of rt.listeners) target.removeEventListener(type, fn);
        el.root.remove();
      }
    };
  }

  /** Default host integration for the floating widget: scroll to and highlight the shop tile. */
  function highlightTile(id) {
    const tile = [...document.querySelectorAll('[data-wm-id]')].find(x => x.getAttribute('data-wm-id') === id);
    document.querySelectorAll('.wm-highlight').forEach(x => x.classList.remove('wm-highlight'));
    document.dispatchEvent(new CustomEvent('wellmatch:select', { detail: { id } }));
    if (!tile) return;
    tile.classList.add('wm-highlight');
    if (!tile.hasAttribute('tabindex')) tile.setAttribute('tabindex', '-1');
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    tile.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' });
  }

  async function autoBoot() {
    if (!SCRIPT || SCRIPT.getAttribute('data-auto-mount') === 'false') return;
    ensureStyles();
    const ds = SCRIPT.dataset;
    const data = await load({ catalogUrl: ds.catalog ? new URL(ds.catalog, location.href).href : null });
    const core = data.core;
    const lang = core.LANGS.includes(data.params.get('lang')) ? data.params.get('lang') : (core.LANGS.includes(ds.lang) ? ds.lang : 'en');
    const mountTarget = ds.mount ? document.querySelector(ds.mount) : null;
    const instance = create(mountTarget || document.body, Object.assign({}, data, {
      mode: mountTarget ? 'page' : 'floating',
      lang,
      testId: core.parseTestId(location.search),
      onSelect: mountTarget ? null : highlightTile
    }));
    window.WellMatch.instance = instance;
  }

  window.WellMatch = { version: 'v1.0', load, create, highlightTile, base: BASE, h, OVERRIDE_KEY };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', autoBoot);
  else autoBoot();
})();
