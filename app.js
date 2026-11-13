/*
 * WellMatch v1.0 — PURE CORE (no DOM). Vanilla ES2020, no dependencies.
 * Used by: wellmatch.js (widget UI), admin.js, analytics.js, tests (Node and browser).
 * Exposed as `module.exports` in Node and `window.WellMatchCore` in browsers.
 */
(function (root) {
  'use strict';

  // ===================================================================
  // Constants & rules
  // ===================================================================
  const APP_VERSION = 'v1.0';
  const CATALOG_VERSION = 'catalog-v1';
  const MAX_BUDGET = 1000000;
  const LANGS = ['en', 'kk'];
  const TEXTURES = ['light', 'medium', 'rich'];
  const FRAGRANCES = ['free', 'light', 'any'];
  const USE_TIMES = ['day', 'night', 'both'];
  const SIZES = ['travel', 'standard', 'large'];
  const TRAVEL_MAX_ML = 30;
  const STANDARD_MAX_ML = 100;
  const SCREENS = ['s0', 's1', 's2', 's2b', 's3'];
  const ANSWER_FIELDS = ['budget', 'texture', 'fragrance', 'useTime', 'size'];
  const HISTORY_MAX = 10;
  const TASKS = ['T1', 'T2', 'T3', 'T4', 'T5'];

  const DEFAULT_RULES = Object.freeze({ maxResults: 3, fragranceRule: 'hard', currency: 'KZT', catalogVersion: CATALOG_VERSION });

  /** Retailer rules, clamped to safe values. */
  function normalizeRules(r) {
    const x = r || {};
    const max = Number.isInteger(x.maxResults) ? Math.min(5, Math.max(1, x.maxResults)) : DEFAULT_RULES.maxResults;
    const currency = typeof x.currency === 'string' && x.currency.trim() ? x.currency.trim().slice(0, 8) : DEFAULT_RULES.currency;
    const version = typeof x.catalogVersion === 'string' && x.catalogVersion.trim() ? x.catalogVersion.trim().slice(0, 40) : DEFAULT_RULES.catalogVersion;
    return { maxResults: max, fragranceRule: x.fragranceRule === 'soft' ? 'soft' : 'hard', currency, catalogVersion: version };
  }

  // ===================================================================
  // Soft criteria (use time, pack size) — never exclude, only re-order
  // ===================================================================
  function sizeCategory(ml) {
    return ml <= TRAVEL_MAX_ML ? 'travel' : ml <= STANDARD_MAX_ML ? 'standard' : 'large';
  }
  /** user "day" suits day|both products; "night" suits night|both; "both" suits only both. */
  function suitsUseTime(product, useTime) {
    if (!useTime) return false;
    if (useTime === 'both') return product.use_time === 'both';
    return product.use_time === useTime || product.use_time === 'both';
  }
  function softScore(product, answers) {
    return (suitsUseTime(product, answers.useTime) ? 1 : 0) +
      (answers.size && sizeCategory(product.size_ml) === answers.size ? 1 : 0);
  }
  function compareFor(answers, rules) {
    const softFragrance = answers.fragrance === 'free' && rules.fragranceRule === 'soft';
    return (a, b) =>
      (softFragrance ? (b.fragrance_free === true) - (a.fragrance_free === true) : 0) ||
      softScore(b, answers) - softScore(a, answers) ||
      a.price - b.price ||
      a.id.localeCompare(b.id);
  }

  // ===================================================================
  // F3 — matching (deterministic filter + sort + cap; never pads)
  // ===================================================================
  function match(catalog, answers, rules) {
    const r = normalizeRules(rules);
    const { budget, texture, fragrance } = answers;
    return catalog
      .filter(p => p.in_stock !== false)
      .filter(p => p.price <= budget)
      .filter(p => p.texture === texture)
      .filter(p => fragrance !== 'free' || r.fragranceRule === 'soft' || p.fragrance_free === true)
      .sort(compareFor(answers, r))
      .slice(0, r.maxResults);
  }

  /**
   * Full analysis used for "how", "why not", the revision diff and the live counter.
   * excluded[] lists EVERY product not shown with every rule that removed it (incl. the cap).
   */
  function analyse(catalog, answers, rules) {
    const r = normalizeRules(rules);
    const a = answers;
    const hardFragrance = a.fragrance === 'free' && r.fragranceRule === 'hard';
    const inStock = catalog.filter(p => p.in_stock !== false);
    const byPrice = inStock.filter(p => p.price <= a.budget);
    const byTexture = byPrice.filter(p => p.texture === a.texture);
    const byFragrance = byTexture.filter(p => !hardFragrance || p.fragrance_free === true);
    const eligible = byFragrance.slice().sort(compareFor(a, r));
    const shown = eligible.slice(0, r.maxResults);

    const excluded = [];
    for (const p of catalog) {
      const reasons = [];
      if (p.in_stock === false) reasons.push({ code: 'stock' });
      if (!(p.price <= a.budget)) reasons.push({ code: 'price', price: p.price, budget: a.budget });
      if (p.texture !== a.texture) reasons.push({ code: 'texture', texture: p.texture, wanted: a.texture });
      if (hardFragrance && p.fragrance_free !== true) reasons.push({ code: 'fragrance' });
      if (reasons.length) excluded.push({ product: p, reasons });
    }
    eligible.slice(r.maxResults).forEach((p, i) => {
      excluded.push({ product: p, reasons: [{ code: 'cap', rank: r.maxResults + i + 1, max: r.maxResults }] });
    });
    excluded.sort((x, y) => x.product.id.localeCompare(y.product.id));

    return {
      total: catalog.length,
      stock: inStock.length,
      price: byPrice.length,
      texture: byTexture.length,
      fragrance: byFragrance.length,
      eligible,
      shown,
      excluded,
      fragranceMode: a.fragrance === 'free' ? r.fragranceRule : 'none',
      softApplied: !!(a.useTime || a.size),
      max: r.maxResults
    };
  }

  /** Reason codes for the green "Why:" line — only criteria that were applied and met. */
  function reasons(product, answers) {
    const out = [];
    if (product.texture === answers.texture) out.push('texture');
    if (product.price <= answers.budget) out.push('budget');
    if (answers.fragrance === 'free' && product.fragrance_free === true) out.push('fragranceFree');
    if (suitsUseTime(product, answers.useTime)) out.push('useTime');
    if (answers.size && sizeCategory(product.size_ml) === answers.size) out.push('size');
    return out;
  }

  /** Soft mismatches, shown on the amber "Limitation:" line next to the catalog limitation. */
  function softLimitations(product, answers) {
    const out = [];
    if (answers.fragrance === 'free' && product.fragrance_free !== true) out.push('fragrance'); // soft-fragrance mode only
    if (answers.useTime && !suitsUseTime(product, answers.useTime)) out.push('useTime');
    if (answers.size && sizeCategory(product.size_ml) !== answers.size) out.push('size');
    return out;
  }

  /** F12 — count with whatever has been answered so far (unanswered / invalid = not filtered). */
  function liveCount(catalog, partial, rules) {
    const r = normalizeRules(rules);
    const p = partial || {};
    const b = validateBudget(p.budget);
    const n = catalog
      .filter(x => x.in_stock !== false)
      .filter(x => !b.ok || x.price <= b.value)
      .filter(x => !TEXTURES.includes(p.texture) || x.texture === p.texture)
      .filter(x => p.fragrance !== 'free' || r.fragranceRule === 'soft' || x.fragrance_free === true)
      .length;
    return { n, total: catalog.length };
  }

  // ===================================================================
  // Validation
  // ===================================================================
  /**
   * Budget: whole number 1..1 000 000. Leading/trailing AND internal spaces are allowed
   * ("6 000" -> 6000, documented decision V08). Codes: required | notNumber | notInteger | notPositive | tooLarge
   */
  function validateBudget(raw) {
    const s = String(raw == null ? '' : raw).trim();
    if (s === '') return { ok: false, code: 'required' };
    const c = s.replace(/[\s  ]+/g, '');
    if (/^[+-]?\d+$/.test(c)) {
      const n = Number(c);
      if (n <= 0) return { ok: false, code: 'notPositive' };
      if (n > MAX_BUDGET) return { ok: false, code: 'tooLarge' };
      return { ok: true, value: n };
    }
    if (/^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(c)) return { ok: false, code: 'notInteger' };
    return { ok: false, code: 'notNumber' };
  }

  /** All answers at once. Required: budget, texture, fragrance. Optional (soft): useTime, size. */
  function validateAnswers(answers) {
    const a = answers || {};
    const errors = {};
    const b = validateBudget(a.budget);
    if (!b.ok) errors.budget = b.code;
    const check = (field, list, required) => {
      const v = a[field];
      if (v == null || v === '') { if (required) errors[field] = 'required'; return; }
      if (!list.includes(v)) errors[field] = 'invalid';
    };
    check('texture', TEXTURES, true);
    check('fragrance', FRAGRANCES, true);
    check('useTime', USE_TIMES, false);
    check('size', SIZES, false);
    if (Object.keys(errors).length) return { ok: false, errors };
    return {
      ok: true,
      errors: {},
      value: { budget: b.value, texture: a.texture, fragrance: a.fragrance, useTime: a.useTime || null, size: a.size || null }
    };
  }

  // ===================================================================
  // End-of-session feedback form (all fields optional, at least one required to save)
  // ===================================================================
  const FEEDBACK_FIELDS = ['clarity', 'ease', 'confidence', 'wouldUse', 'comment'];
  const WOULD_USE = ['yes', 'unsure', 'no'];
  const COMMENT_MAX = 500;

  /** -> { ok, value:{clarity, ease, confidence, wouldUse, comment}, errors } ; codes: invalid | tooLong | empty */
  function validateFeedback(form) {
    const f = form || {};
    const errors = {};
    const value = {};
    for (const k of ['clarity', 'ease', 'confidence']) {
      const v = f[k];
      if (v == null || v === '') value[k] = null;
      else if (Number.isInteger(v) && v >= 1 && v <= 5) value[k] = v;
      else errors[k] = 'invalid';
    }
    if (f.wouldUse == null || f.wouldUse === '') value.wouldUse = null;
    else if (WOULD_USE.includes(f.wouldUse)) value.wouldUse = f.wouldUse;
    else errors.wouldUse = 'invalid';
    const comment = typeof f.comment === 'string' ? f.comment.trim() : '';
    if (comment.length > COMMENT_MAX) errors.comment = 'tooLong';
    value.comment = comment || null;
    if (!Object.keys(errors).length && FEEDBACK_FIELDS.every(k => value[k] == null)) errors.form = 'empty';
    return Object.keys(errors).length ? { ok: false, errors } : { ok: true, value, errors: {} };
  }

  function sameAnswers(x, y) {
    if (!x || !y) return false;
    return ANSWER_FIELDS.every(f => (x[f] == null ? null : x[f]) === (y[f] == null ? null : y[f]));
  }
  function toRawAnswers(v) {
    return { budget: String(v.budget), texture: v.texture, fragrance: v.fragrance, useTime: v.useTime || null, size: v.size || null };
  }

  // ===================================================================
  // F11 / F16 — catalog integrity, JSON + CSV import
  // ===================================================================
  function productProblems(p) {
    if (!p || typeof p !== 'object' || Array.isArray(p)) return ['record'];
    const out = [];
    if (typeof p.id !== 'string' || !p.id.trim()) out.push('id');
    if (typeof p.name !== 'string' || !p.name.trim()) out.push('name');
    if (!Number.isInteger(p.price) || p.price <= 0) out.push('price');
    if (!TEXTURES.includes(p.texture)) out.push('texture');
    if (typeof p.fragrance_free !== 'boolean') out.push('fragrance_free');
    if (!Number.isInteger(p.size_ml) || p.size_ml <= 0) out.push('size_ml');
    if (!USE_TIMES.includes(p.use_time)) out.push('use_time');
    if (p.in_stock !== undefined && typeof p.in_stock !== 'boolean') out.push('in_stock');
    const lim = p.limitation && typeof p.limitation === 'object' ? p.limitation : {};
    if (typeof lim.en !== 'string' || !lim.en.trim()) out.push('limitation.en');
    if (typeof lim.kk !== 'string' || !lim.kk.trim()) out.push('limitation.kk');
    if (p.fictional !== true) out.push('fictional');
    return out;
  }

  function fieldValue(rec, field) {
    if (!rec || typeof rec !== 'object') return undefined;
    if (field.startsWith('limitation.')) return rec.limitation ? rec.limitation[field.slice(11)] : undefined;
    return rec[field];
  }

  /** Validate a list of { row, record }. Invalid or duplicate records are withheld and reported. */
  function validateRecords(items) {
    const products = [];
    const report = [];
    const hidden = [];
    const seen = new Set();
    for (const { row, record } of items) {
      const problems = productProblems(record);
      if (!problems.length && seen.has(record.id)) problems.push('duplicateId');
      if (problems.length) {
        const id = record && typeof record.id === 'string' ? record.id : null;
        hidden.push({ index: row - 1, row, id, reasons: problems });
        for (const f of problems) {
          const v = fieldValue(record, f);
          const reason = f === 'duplicateId' ? 'duplicateId' : (v === undefined || v === null || v === '') ? 'missing' : 'invalid';
          report.push({ row, id, field: f === 'duplicateId' ? 'id' : f, reason });
        }
      } else {
        seen.add(record.id);
        products.push(record);
      }
    }
    return { products, hidden, report };
  }

  /** Load a catalog object ({version, products} or a bare array). Never throws. */
  function loadCatalog(json, opts) {
    const warn = (opts && opts.warn) || function () {};
    const list = Array.isArray(json) ? json : (json && Array.isArray(json.products) ? json.products : []);
    const version = json && !Array.isArray(json) && typeof json.version === 'string' ? json.version : null;
    if (version !== CATALOG_VERSION) warn(`Catalog version is "${version}", expected "${CATALOG_VERSION}". Loading anyway.`);
    const res = validateRecords(list.map((record, i) => ({ row: i + 1, record })));
    for (const h of res.hidden) warn(`Catalog record #${h.index} (${h.id || 'no id'}) hidden — invalid: ${h.reasons.join(', ')}`);
    return { version, products: res.products, hidden: res.hidden, report: res.report };
  }

  /** RFC 4180-style CSV parser: quotes, "" escapes, commas/newlines inside quotes, CRLF/LF/CR, BOM. */
  function parseCSV(text) {
    const s = String(text).replace(/^﻿/, '');
    const rows = [];
    let row = [];
    let cell = '';
    let quoted = false;
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (quoted) {
        if (ch === '"') {
          if (s[i + 1] === '"') { cell += '"'; i++; } else quoted = false;
        } else cell += ch;
      } else if (ch === '"') quoted = true;
      else if (ch === ',') { row.push(cell); cell = ''; }
      else if (ch === '\r' || ch === '\n') {
        if (ch === '\r' && s[i + 1] === '\n') i++;
        row.push(cell); rows.push(row); row = []; cell = '';
      } else cell += ch;
    }
    if (quoted) throw new Error('Unclosed quote');
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    return rows;
  }

  const CSV_REQUIRED = ['id', 'name', 'price', 'texture', 'fragrance_free', 'size_ml', 'use_time', 'limitation_en', 'limitation_kk', 'fictional'];
  const CSV_OPTIONAL = ['in_stock'];

  function csvInt(s) { return s === undefined || s === '' ? undefined : /^\d+$/.test(s) ? Number(s) : s; }
  function csvBool(s) {
    if (s === undefined || s === '') return undefined;
    const l = s.toLowerCase();
    return l === 'true' ? true : l === 'false' ? false : s;
  }

  function csvToProducts(text) {
    let rows;
    try { rows = parseCSV(text); } catch (e) { return { products: [], report: [{ row: 0, id: null, field: '', reason: 'parse' }], fatal: true }; }
    rows = rows.filter(r => r.some(c => c.trim() !== ''));
    if (!rows.length) return { products: [], report: [{ row: 0, id: null, field: '', reason: 'empty' }], fatal: true };
    const header = rows[0].map(h => h.trim().toLowerCase());
    const missing = CSV_REQUIRED.filter(c => !header.includes(c));
    if (missing.length) return { products: [], report: missing.map(c => ({ row: 1, id: null, field: c, reason: 'missingColumn' })), fatal: true };
    if (rows.length < 2) return { products: [], report: [{ row: 1, id: null, field: '', reason: 'empty' }], fatal: true };
    const col = name => header.indexOf(name);
    const items = rows.slice(1).map((cells, i) => {
      const get = name => (col(name) >= 0 && cells[col(name)] !== undefined ? cells[col(name)].trim() : undefined);
      const record = {
        id: get('id'),
        name: get('name'),
        price: csvInt(get('price')),
        texture: get('texture'),
        fragrance_free: csvBool(get('fragrance_free')),
        size_ml: csvInt(get('size_ml')),
        use_time: get('use_time'),
        limitation: { en: get('limitation_en'), kk: get('limitation_kk') },
        fictional: csvBool(get('fictional'))
      };
      const stock = CSV_OPTIONAL.includes('in_stock') ? csvBool(get('in_stock')) : undefined;
      if (stock !== undefined) record.in_stock = stock;
      return { row: i + 2, record }; // row 1 is the header
    });
    const res = validateRecords(items);
    return { products: res.products, report: res.report, fatal: false };
  }

  /** Import a file's text: JSON ({version, products} or array) or CSV. */
  function importCatalog(text, filename) {
    const name = String(filename || '');
    const trimmed = String(text).replace(/^﻿/, '').trim();
    if (/\.json$/i.test(name) || trimmed.startsWith('{') || trimmed.startsWith('[')) {
      let json;
      try { json = JSON.parse(trimmed); } catch (e) { return { products: [], report: [{ row: 0, id: null, field: '', reason: 'parse' }], fatal: true }; }
      const list = Array.isArray(json) ? json : json && Array.isArray(json.products) ? json.products : null;
      if (!list || !list.length) return { products: [], report: [{ row: 0, id: null, field: '', reason: 'empty' }], fatal: true };
      const res = validateRecords(list.map((record, i) => ({ row: i + 1, record })));
      return { products: res.products, report: res.report, fatal: false };
    }
    return csvToProducts(trimmed);
  }

  // ===================================================================
  // Formatting & i18n
  // ===================================================================
  function formatNumber(n) {
    return String(Math.trunc(Number(n))).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  }
  function formatMoney(n, currency) {
    return formatNumber(n) + ' ' + (currency || DEFAULT_RULES.currency);
  }

  /** "{n}" placeholders; "{n|poss}" applies a language formatter. Unknown placeholders stay as-is. */
  function interpolate(str, vars, formatters) {
    if (!vars) return str;
    return str.replace(/\{(\w+)(?:\|(\w+))?\}/g, (m, k, mod) => {
      if (!Object.prototype.hasOwnProperty.call(vars, k)) return m;
      const v = vars[k];
      return mod && formatters && typeof formatters[mod] === 'function' ? formatters[mod](v) : String(v);
    });
  }

  function pluralCategory(lang, n) {
    try { return new Intl.PluralRules(lang).select(n); } catch (e) { return n === 1 ? 'one' : 'other'; }
  }

  /**
   * Kazakh 3rd-person possessive after a numeral: 1-і, 2-сі, 6-сы, 9-ы, 10-ы, 20-сы, 50-і, 100-і, 1000-ы.
   * The suffix follows the last spoken word of the number (vowel harmony + vowel/consonant ending).
   */
  function kkPossessive(n) {
    const num = Math.abs(Math.trunc(Number(n)));
    const units = { 1: 'і', 2: 'сі', 3: 'і', 4: 'і', 5: 'і', 6: 'сы', 7: 'сі', 8: 'і', 9: 'ы' };
    const tens = { 1: 'ы', 2: 'сы', 3: 'ы', 4: 'ы', 5: 'і', 6: 'ы', 7: 'і', 8: 'і', 9: 'ы' };
    let suffix;
    if (num === 0) suffix = 'і';                       // нөлі
    else if (num % 10) suffix = units[num % 10];
    else if (num % 100) suffix = tens[(num % 100) / 10];
    else if (num % 1000) suffix = 'і';                 // жүзі
    else suffix = 'ы';                                 // мыңы, миллионы
    return num + '-' + suffix;
  }

  const FORMATTERS = { en: {}, kk: { poss: kkPossessive } };

  /**
   * t(key, vars): current language -> English fallback (console.warn once per key) -> key itself.
   * Plural keys: t('results.count', {n}) resolves results.count.one / results.count.other.
   */
  function createI18n(dicts, opts) {
    const o = opts || {};
    const warn = o.warn || (m => console.warn(m));
    const warned = new Set();
    let lang = LANGS.includes(o.lang) ? o.lang : 'en';
    const has = (l, k) => !!dicts[l] && typeof dicts[l][k] === 'string' && dicts[l][k].trim() !== '';
    function resolve(l, key, vars) {
      const keys = vars && typeof vars.n === 'number' ? [key + '.' + pluralCategory(l, vars.n), key, key + '.other'] : [key];
      for (const k of keys) if (has(l, k)) return dicts[l][k];
      return undefined;
    }
    function warnOnce(id, msg) { if (!warned.has(id)) { warned.add(id); warn(msg); } }
    function t(key, vars) {
      let used = lang;
      let s = resolve(lang, key, vars);
      if (s === undefined && lang !== 'en') { s = resolve('en', key, vars); used = 'en'; }
      if (s === undefined) {
        warnOnce(lang + ':' + key, `[i18n] Missing key "${key}" in ${lang}.json and en.json`);
        return key;
      }
      if (used !== lang) warnOnce(lang + ':' + key, `[i18n] Missing key "${key}" in ${lang}.json, falling back to en.json`);
      return interpolate(s, vars, FORMATTERS[used]);
    }
    return {
      t,
      setLang(l) { if (LANGS.includes(l)) lang = l; },
      getLang() { return lang; }
    };
  }

  // ===================================================================
  // F15 — reproducible result URL in the hash
  // ===================================================================
  /** "#s2?b=6000&t=light&f=free&u=day&p=travel&lang=kk" -> { screen, params:{answers, lang} | null } */
  function parseHash(hash) {
    const raw = String(hash || '').replace(/^#/, '');
    const q = raw.indexOf('?');
    const screen = (q < 0 ? raw : raw.slice(0, q)) || 's0';
    if (q < 0) return { screen, params: null };
    const sp = new URLSearchParams(raw.slice(q + 1));
    return {
      screen,
      params: {
        answers: { budget: sp.get('b') || '', texture: sp.get('t'), fragrance: sp.get('f'), useTime: sp.get('u'), size: sp.get('p') },
        lang: sp.get('lang')
      }
    };
  }
  function serialiseHash(o) {
    if (!o || !o.answers) return (o && o.screen) || 's0';
    const sp = new URLSearchParams();
    const a = o.answers;
    sp.set('b', String(a.budget));
    sp.set('t', a.texture);
    sp.set('f', a.fragrance);
    if (a.useTime) sp.set('u', a.useTime);
    if (a.size) sp.set('p', a.size);
    if (o.lang) sp.set('lang', o.lang);
    return o.screen + '?' + sp.toString();
  }

  /** F9 — only P01..P99 accepted. */
  function parseTestId(search) {
    const v = new URLSearchParams(String(search || '')).get('test');
    return v && /^P\d{2}$/.test(v) ? v : null;
  }

  // ===================================================================
  // F14 — revision diff
  // ===================================================================
  const REASON_FIELD = { price: 'budget', texture: 'texture', fragrance: 'fragrance', stock: null, cap: null };

  function diffRevision(prev, next, catalog, rules) {
    const changes = ANSWER_FIELDS
      .filter(f => (prev.answers[f] == null ? null : prev.answers[f]) !== (next.answers[f] == null ? null : next.answers[f]))
      .map(f => ({ field: f, from: prev.answers[f] == null ? null : prev.answers[f], to: next.answers[f] == null ? null : next.answers[f] }));
    const changed = new Set(changes.map(c => c.field));
    const pa = analyse(catalog, prev.answers, rules);
    const na = analyse(catalog, next.answers, rules);
    const because = (an, id) => {
      const e = an.excluded.find(x => x.product.id === id);
      if (!e) return 'cap';
      const hit = e.reasons.find(r => REASON_FIELD[r.code] && changed.has(REASON_FIELD[r.code]));
      return (hit || e.reasons[0]).code;
    };
    return {
      changes,
      added: next.shown.filter(id => !prev.shown.includes(id)).map(id => ({ id, because: because(pa, id) })),
      removed: prev.shown.filter(id => !next.shown.includes(id)).map(id => ({ id, because: because(na, id) })),
      delta: next.shown.length - prev.shown.length,
      max: normalizeRules(rules).maxResults
    };
  }

  // ===================================================================
  // State machine (reducer) — S0 consent → S1 → S2 | S2b → S3 → S0
  // ===================================================================
  function emptyMetrics() {
    return { firstInteractionAt: null, selectedAt: null, validationErrors: 0, revisions: 0, langSwitches: 0 };
  }

  function createInitialState(opts) {
    const o = opts || {};
    const now = o.now || (() => new Date().toISOString());
    return {
      lang: LANGS.includes(o.lang) ? o.lang : 'en',
      screen: 's0',
      consent: false,
      answers: { budget: '', texture: null, fragrance: null, useTime: null, size: null },
      errors: {},
      results: [],
      submitted: null,   // validated answers that produced `results` (guards #s2/#s3)
      last: null,        // { answers, shown } of the last valid submit (for the revision diff)
      revision: null,
      history: [],
      compare: [],
      selected: null,
      feedback: null,       // clarity rating 1–5 (also set by the feedback form)
      feedbackDraft: null,  // feedback form while it is being filled in (survives a language switch)
      feedbackForm: null,   // last saved feedback form (exported with the session)
      feedbackErrors: {},
      pendingLink: null, // answers from a shared #s2?… link, applied after consent
      test: o.test || null,
      task: null,
      catalogHidden: o.catalogHidden || 0,
      metrics: emptyMetrics(),
      runs: [],
      log: [],
      startedAt: now()
    };
  }

  /** Every session keeps an in-memory log (never persisted or sent) so anyone can download it at the end. */
  function addLog(s, env, event, detail) {
    return { ...s, log: s.log.concat([{ t: env.now(), screen: s.screen, event, detail: detail || {} }]) };
  }

  function summarizeMetrics(m, nowMs) {
    const elapsed = m.firstInteractionAt == null ? null : Math.round(((m.selectedAt != null ? m.selectedAt : nowMs) - m.firstInteractionAt) / 100) / 10;
    return { elapsedSeconds: elapsed, completed: m.selectedAt != null, validationErrors: m.validationErrors, revisions: m.revisions, langSwitches: m.langSwitches };
  }

  function pushHistory(history, entry) {
    const rest = history.filter(h => !sameAnswers(h.answers, entry.answers));
    return [entry].concat(rest).slice(0, HISTORY_MAX);
  }

  function submit(state, env) {
    let s = { ...state, results: [], submitted: null, selected: null, feedback: null, compare: [], revision: null };
    const v = validateAnswers(s.answers);
    if (!v.ok) {
      s = addLog(s, env, 'submit', { valid: false });
      for (const f of ANSWER_FIELDS) {
        if (!v.errors[f]) continue;
        const value = f === 'budget' ? String(s.answers.budget == null ? '' : s.answers.budget).slice(0, 40) : (s.answers[f] == null ? null : s.answers[f]);
        s = addLog(s, env, 'validation_error', { field: f, code: v.errors[f], value });
      }
      const n = Object.keys(v.errors).length;
      return { ...s, screen: 's1', errors: v.errors, metrics: { ...s.metrics, validationErrors: s.metrics.validationErrors + n } };
    }
    const results = match(env.catalog, v.value, env.rules);
    const an = analyse(env.catalog, v.value, env.rules);
    const shownIds = results.map(p => p.id);
    const revision = state.last && !sameAnswers(state.last.answers, v.value)
      ? diffRevision(state.last, { answers: v.value, shown: shownIds }, env.catalog, env.rules)
      : null;
    s = addLog(s, env, 'submit', { valid: true, ...v.value, revision: !!revision });
    s = addLog(s, env, 'results', { count: results.length, eligible: an.eligible.length });
    return {
      ...s,
      errors: {},
      results,
      submitted: v.value,
      last: { answers: v.value, shown: shownIds },
      revision,
      history: pushHistory(state.history, { answers: v.value, count: an.eligible.length }),
      metrics: { ...s.metrics, revisions: s.metrics.revisions + (revision ? 1 : 0) },
      screen: results.length ? 's2' : 's2b'
    };
  }

  /**
   * reduce(state, action, ctx) -> new state (or the SAME object when the action is ignored).
   * ctx = { catalog, rules, now: () => ISO string }
   */
  function reduce(state, action, ctx) {
    const c = ctx || {};
    const env = { catalog: c.catalog || [], rules: normalizeRules(c.rules), now: c.now || (() => new Date().toISOString()) };
    const nowMs = () => Date.parse(env.now());
    const type = action && action.type;

    switch (type) {
      case 'SET_CONSENT':
        if (state.screen !== 's0' || state.consent === !!action.value) return state;
        return { ...state, consent: !!action.value };

      case 'START': {
        if (state.screen !== 's0' || !state.consent) return state;
        let s = { ...addLog(state, env, 'consent', { given: true }), screen: 's1' };
        if (s.pendingLink) {
          s = { ...s, answers: { ...s.pendingLink }, pendingLink: null };
          return submit(s, env);
        }
        return s;
      }

      case 'BACK':
        if (state.screen !== 's1') return state;
        return { ...state, screen: 's0' };

      case 'SET_ANSWER': {
        if (state.screen !== 's1' || !ANSWER_FIELDS.includes(action.field)) return state;
        const value = action.field === 'budget' ? String(action.value == null ? '' : action.value) : (action.value || null);
        if (state.answers[action.field] === value) return state;
        const errors = { ...state.errors };
        delete errors[action.field];
        const metrics = state.metrics.firstInteractionAt == null ? { ...state.metrics, firstInteractionAt: nowMs() } : state.metrics;
        return {
          ...state, answers: { ...state.answers, [action.field]: value }, errors, metrics,
          results: [], submitted: null, selected: null, feedback: null, compare: []
        };
      }

      case 'SUBMIT':
        if (state.screen !== 's1') return state;
        return submit(state, env);

      case 'RESTORE': {
        const entry = state.history[action.index];
        if (!entry || !['s1', 's2', 's2b'].includes(state.screen)) return state;
        return submit({ ...state, answers: toRawAnswers(entry.answers), screen: 's1' }, env);
      }

      case 'CHANGE':
        if (state.screen !== 's2' && state.screen !== 's2b') return state;
        return { ...state, screen: 's1' };

      case 'TOGGLE_COMPARE': {
        if (state.screen !== 's2' || !state.results.some(p => p.id === action.id)) return state;
        if (state.compare.includes(action.id)) return { ...state, compare: state.compare.filter(id => id !== action.id) };
        if (state.compare.length >= 2) return state;
        return { ...state, compare: state.compare.concat([action.id]) };
      }

      case 'SELECT': {
        if (state.screen !== 's2') return state;
        const idx = state.results.findIndex(p => p.id === action.id);
        if (idx < 0) return state;
        const m = state.metrics;
        const selectedAt = m.selectedAt != null ? m.selectedAt : nowMs();
        const elapsedMs = m.firstInteractionAt != null ? selectedAt - m.firstInteractionAt : null;
        const s = addLog(state, env, 'select', { id: action.id, rank: idx + 1, elapsedMs });
        return {
          ...s, selected: action.id, feedback: null, feedbackDraft: null, feedbackForm: null, feedbackErrors: {},
          screen: 's3', metrics: { ...m, selectedAt }
        };
      }

      case 'FEEDBACK': {
        const n = action.value;
        if (state.screen !== 's3' || !Number.isInteger(n) || n < 1 || n > 5) return state;
        return { ...addLog(state, env, 'feedback', { value: n, id: state.selected }), feedback: n };
      }

      case 'SET_FEEDBACK_FIELD': {
        if (state.screen !== 's3' || !FEEDBACK_FIELDS.includes(action.field)) return state;
        const draft = { ...(state.feedbackDraft || {}), [action.field]: action.value };
        return { ...state, feedbackDraft: draft, feedbackErrors: {} };
      }

      case 'SUBMIT_FEEDBACK': {
        if (state.screen !== 's3') return state;
        const v = validateFeedback(state.feedbackDraft);
        if (!v.ok) return { ...state, feedbackErrors: v.errors };
        const f = v.value;
        const s = addLog(state, env, 'feedback_form', {
          id: state.selected, clarity: f.clarity, ease: f.ease, confidence: f.confidence, wouldUse: f.wouldUse,
          commentLength: f.comment ? f.comment.length : 0
        });
        return { ...s, feedbackForm: f, feedbackErrors: {}, feedback: f.clarity != null ? f.clarity : s.feedback };
      }

      case 'RESTART':
      case 'LEAVE': {
        const s = addLog(state, env, 'restart', { via: type === 'LEAVE' ? 'leave' : 'restart', from: state.screen });
        const run = state.metrics.firstInteractionAt != null
          ? [{ task: state.task, ...summarizeMetrics(state.metrics, nowMs()), feedback: state.feedbackForm }]
          : [];
        return {
          ...createInitialState({ lang: s.lang, test: s.test, catalogHidden: s.catalogHidden, now: env.now }),
          log: s.log, startedAt: s.startedAt, task: s.task, runs: s.runs.concat(run)
        };
      }

      case 'SET_LANG': {
        if (!LANGS.includes(action.lang) || action.lang === state.lang) return state;
        const s = addLog(state, env, 'lang_switch', { from: state.lang, to: action.lang });
        return { ...s, lang: action.lang, metrics: { ...s.metrics, langSwitches: s.metrics.langSwitches + 1 } };
      }

      case 'SET_TASK': {
        const task = TASKS.includes(action.task) ? action.task : null;
        if (task === state.task) return state;
        return { ...addLog(state, env, 'task', { task }), task };
      }

      case 'NAVIGATE': {
        let s = state;
        const p = action.params;
        if (p && LANGS.includes(p.lang) && p.lang !== s.lang) s = { ...s, lang: p.lang };
        let target = action.screen === 's2b' ? 's2' : action.screen;
        if (!SCREENS.includes(target)) target = 's0';
        if (target === 's2' && p && p.answers) {
          if (!s.consent) return { ...s, screen: 's0', pendingLink: { ...p.answers } };
          const v = validateAnswers(p.answers);
          if (!(v.ok && s.submitted && sameAnswers(v.value, s.submitted))) {
            return submit({ ...s, answers: { ...p.answers }, screen: 's1' }, env);
          }
        }
        if (target === 's3' && !s.selected) target = 's0';
        if (target !== 's0' && !s.consent) target = 's0';
        if (target === 's2') target = s.submitted ? (s.results.length ? 's2' : 's2b') : 's1';
        if (target === s.screen) return s;
        return { ...s, screen: target };
      }

      case 'RECOMPUTE': {
        let s = { ...state, catalogHidden: action.catalogHidden == null ? state.catalogHidden : action.catalogHidden };
        if (!s.submitted) return s;
        const results = match(env.catalog, s.submitted, env.rules);
        const has = id => results.some(p => p.id === id);
        const selected = has(s.selected) ? s.selected : null;
        let screen = s.screen;
        if (screen === 's2' || screen === 's2b' || (screen === 's3' && !selected)) screen = results.length ? 's2' : 's2b';
        return { ...s, results, selected, screen, compare: s.compare.filter(has), last: { answers: s.submitted, shown: results.map(p => p.id) } };
      }

      default:
        return state;
    }
  }

  /** Hash for the current state: S2/S2b carry the answers (F15). */
  function hashForState(state) {
    if ((state.screen === 's2' || state.screen === 's2b') && state.submitted) {
      return serialiseHash({ screen: 's2', answers: state.submitted, lang: state.lang });
    }
    return state.screen === 's2b' ? 's2' : state.screen;
  }

  // ===================================================================
  // F9 / F18 — session log export
  // ===================================================================
  function exportLog(state, meta) {
    const m = meta || {};
    const nowIso = m.now || new Date().toISOString();
    return JSON.stringify({
      participant: state.test || 'anonymous',
      appVersion: APP_VERSION,
      catalogVersion: m.catalogVersion || CATALOG_VERSION,
      startedAt: state.startedAt,
      exportedAt: nowIso,
      task: state.task,
      lang: state.lang,
      catalogHidden: state.catalogHidden,
      metrics: summarizeMetrics(state.metrics, Date.parse(nowIso)),
      feedback: state.feedbackForm,
      runs: state.runs,
      events: state.log
    }, null, 2);
  }

  // ===================================================================
  // F19 — session analytics (pure aggregation)
  // ===================================================================
  function isSessionLog(o) {
    return !!o && typeof o === 'object' && Array.isArray(o.events) && typeof o.appVersion === 'string';
  }
  const mean = xs => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  function median(xs) {
    if (!xs.length) return null;
    const s = xs.slice().sort((a, b) => a - b);
    const mid = Math.floor(s.length / 2);
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
  }

  function analyseSessions(sessions) {
    const rows = sessions.filter(isSessionLog).map(s => {
      const ev = s.events;
      const select = ev.find(e => e.event === 'select');
      let time = null;
      if (select && select.detail && typeof select.detail.elapsedMs === 'number') time = Math.round(select.detail.elapsedMs / 100) / 10;
      else if (select && s.metrics && typeof s.metrics.elapsedSeconds === 'number') time = s.metrics.elapsedSeconds;
      const forms = ev.filter(e => e.event === 'feedback_form' && e.detail).map(e => e.detail);
      const ints = xs => xs.filter(x => Number.isInteger(x));
      const ratings = ints(ev.filter(e => e.event === 'feedback' && e.detail).map(e => e.detail.value).concat(forms.map(f => f.clarity)));
      const ease = ints(forms.map(f => f.ease));
      const confidence = ints(forms.map(f => f.confidence));
      const would = forms.map(f => f.wouldUse).filter(x => WOULD_USE.includes(x));
      const comments = [s.feedback].concat((s.runs || []).map(r => r && r.feedback))
        .map(f => f && typeof f.comment === 'string' ? f.comment.trim() : '').filter(Boolean);
      return {
        participant: s.participant || null,
        task: s.task || null,
        completed: !!select,
        timeSec: time,
        noMatch: ev.some(e => e.event === 'results' && e.detail && e.detail.count === 0),
        errors: ev.filter(e => e.event === 'validation_error').length,
        lang: s.lang === 'kk' ? 'kk' : 'en',
        clarity: ratings.length ? mean(ratings) : null,
        ease: ease.length ? mean(ease) : null,
        confidence: confidence.length ? mean(confidence) : null,
        wouldUse: would.length ? would[would.length - 1] : null,
        comments
      };
    });
    const n = rows.length;
    const times = rows.filter(r => r.timeSec != null).map(r => r.timeSec);
    const clarities = rows.filter(r => r.clarity != null).map(r => r.clarity);
    const answeredWould = rows.filter(r => r.wouldUse != null);
    return {
      rows,
      summary: {
        sessions: n,
        completionRate: n ? rows.filter(r => r.completed).length / n : null,
        medianTimeSec: median(times),
        noMatchRate: n ? rows.filter(r => r.noMatch).length / n : null,
        errorsPerSession: n ? rows.reduce((a, r) => a + r.errors, 0) / n : null,
        languages: { en: rows.filter(r => r.lang === 'en').length, kk: rows.filter(r => r.lang === 'kk').length },
        meanClarity: mean(clarities),
        meanEase: mean(rows.filter(r => r.ease != null).map(r => r.ease)),
        meanConfidence: mean(rows.filter(r => r.confidence != null).map(r => r.confidence)),
        wouldUseYesRate: answeredWould.length ? answeredWould.filter(r => r.wouldUse === 'yes').length / answeredWould.length : null,
        comments: rows.reduce((a, r) => a + r.comments.length, 0)
      }
    };
  }

  function csvCell(v) {
    const s = v == null ? '' : String(v);
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function sessionsToCSV(result) {
    const lines = [['participant', 'task', 'completed', 'time_to_selection_s', 'saw_no_match', 'validation_errors', 'language',
      'clarity', 'ease', 'confidence', 'would_use', 'comments'].join(',')];
    const r2 = x => (x == null ? '' : Math.round(x * 100) / 100);
    for (const r of result.rows) {
      lines.push([r.participant, r.task, r.completed, r.timeSec, r.noMatch, r.errors, r.lang,
        r2(r.clarity), r2(r.ease), r2(r.confidence), r.wouldUse, (r.comments || []).join(' | ')].map(csvCell).join(','));
    }
    const s = result.summary;
    const round = x => (x == null ? '' : Math.round(x * 1000) / 1000);
    lines.push('', 'metric,value');
    lines.push(`sessions,${s.sessions}`);
    lines.push(`completion_rate,${round(s.completionRate)}`);
    lines.push(`median_time_to_selection_s,${round(s.medianTimeSec)}`);
    lines.push(`no_match_rate,${round(s.noMatchRate)}`);
    lines.push(`validation_errors_per_session,${round(s.errorsPerSession)}`);
    lines.push(`language_en,${s.languages.en}`);
    lines.push(`language_kk,${s.languages.kk}`);
    lines.push(`mean_clarity,${round(s.meanClarity)}`);
    lines.push(`mean_ease,${round(s.meanEase)}`);
    lines.push(`mean_confidence,${round(s.meanConfidence)}`);
    lines.push(`would_use_yes_rate,${round(s.wouldUseYesRate)}`);
    lines.push(`comments,${s.comments}`);
    return lines.join('\r\n') + '\r\n';
  }

  // ===================================================================
  const core = {
    APP_VERSION, CATALOG_VERSION, MAX_BUDGET, LANGS, TEXTURES, FRAGRANCES, USE_TIMES, SIZES, SCREENS, ANSWER_FIELDS,
    TASKS, HISTORY_MAX, DEFAULT_RULES, TRAVEL_MAX_ML, STANDARD_MAX_ML,
    normalizeRules, sizeCategory, suitsUseTime, softScore,
    match, analyse, reasons, softLimitations, liveCount,
    validateBudget, validateAnswers, sameAnswers, toRawAnswers,
    validateFeedback, FEEDBACK_FIELDS, WOULD_USE, COMMENT_MAX,
    productProblems, validateRecords, loadCatalog, parseCSV, csvToProducts, importCatalog, CSV_REQUIRED, CSV_OPTIONAL,
    formatNumber, formatMoney, interpolate, pluralCategory, kkPossessive, createI18n,
    parseHash, serialiseHash, hashForState, parseTestId,
    diffRevision, createInitialState, reduce, summarizeMetrics, exportLog,
    isSessionLog, analyseSessions, sessionsToCSV, median
  };

  if (typeof module === 'object' && module && module.exports) module.exports = core;
  if (root) root.WellMatchCore = core;
})(typeof window !== 'undefined' ? window : null);
