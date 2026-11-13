/*
 * WellMatch retailer view (F16 / F21). Client-side only.
 * Edits live in memory; optionally (checkbox, off by default) in sessionStorage for THIS tab so the shopper app
 * and demo store opened in the same tab use the edited catalog. Never stores shopper answers.
 */
(async function () {
  'use strict';
  const { h, OVERRIDE_KEY } = window.WellMatch;
  const data = await window.WellMatch.load({ allowOverride: true });
  const core = data.core;
  const params = new URLSearchParams(location.search);
  const i18n = core.createI18n(data.dicts, { lang: core.LANGS.includes(params.get('lang')) ? params.get('lang') : 'en' });
  const t = (k, v) => i18n.t(k, v);
  const clone = o => JSON.parse(JSON.stringify(o));
  const $ = id => document.getElementById(id);

  const originalProducts = clone((data.originalCatalog && data.originalCatalog.products) || []);
  const originalVersion = (data.originalCatalog && data.originalCatalog.version) || core.CATALOG_VERSION;
  const model = {
    records: clone((data.rawCatalog && data.rawCatalog.products) || []),
    rules: core.normalizeRules(data.rules),
    persist: !!data.override,
    report: null
  };

  const previewHost = h('div', { id: 'a-preview' });
  const preview = window.WellMatch.create(previewHost, {
    core, dicts: data.dicts, mode: 'inline', lang: i18n.getLang(), ...validate(), rules: model.rules
  });

  // ---------------------------------------------------------------- model helpers
  function validate() {
    const res = core.validateRecords(model.records.map((record, i) => ({ row: i + 1, record })));
    return { products: res.products, hidden: res.hidden };
  }
  function problemsByRow() {
    const map = new Map();
    for (const hd of validate().hidden) map.set(hd.row - 1, hd.reasons);
    return map;
  }
  function save() {
    try {
      if (model.persist) {
        sessionStorage.setItem(OVERRIDE_KEY, JSON.stringify({ catalog: { version: model.rules.catalogVersion, products: model.records }, rules: model.rules }));
      } else sessionStorage.removeItem(OVERRIDE_KEY);
    } catch (e) {
      console.warn('[WellMatch admin] sessionStorage unavailable: ' + e.message);
    }
  }
  let syncTimer = null;
  function sync(immediate) {
    clearTimeout(syncTimer);
    const run = () => {
      const v = validate();
      preview.update({ products: v.products, hidden: v.hidden, rules: model.rules });
      updateStatuses();
      save();
    };
    if (immediate) run(); else syncTimer = setTimeout(run, 150);
  }
  function nextId() {
    const used = new Set(model.records.map(r => r && r.id));
    for (let i = 1; i < 1000; i++) {
      const id = 'WM-' + String(i).padStart(2, '0');
      if (!used.has(id)) return id;
    }
    return 'WM-' + Date.now();
  }
  const intOrRaw = v => (/^\s*\d+\s*$/.test(v) ? Number(v.trim()) : v);

  // ---------------------------------------------------------------- rendering
  function renderChrome() {
    document.documentElement.lang = i18n.getLang();
    document.title = t('admin.title') + ' · ' + t('app.name');
    $('a-brand').textContent = t('app.name') + ' · ' + t('admin.title');
    $('a-nav').replaceChildren(
      h('a', { href: 'index.html', text: t('admin.openApp') }),
      h('a', { href: 'store.html', text: t('admin.openStore') })
    );
    const lg = $('a-lang');
    lg.setAttribute('aria-label', t('lang.switch'));
    lg.replaceChildren(...core.LANGS.map(l => h('button', {
      type: 'button', class: 'wm-lang-btn', id: 'a-lang-' + l, lang: l, 'aria-pressed': String(i18n.getLang() === l),
      onclick: () => setLang(l)
    }, [h('span', { 'aria-hidden': 'true', text: t('lang.' + l) }), h('span', { class: 'wm-vh', text: t('lang.' + l + '.name') })])));
  }

  function setLang(l) {
    if (l === i18n.getLang()) return;
    const keep = document.activeElement && document.activeElement.id;
    i18n.setLang(l);
    preview.dispatch({ type: 'SET_LANG', lang: l });
    render();
    if (keep && $(keep)) $(keep).focus();
  }

  function rulesSection() {
    const r = model.rules;
    const max = h('input', { type: 'number', id: 'a-max', min: '1', max: '5', step: '1', value: String(r.maxResults),
      onchange: e => { model.rules = core.normalizeRules({ ...model.rules, maxResults: parseInt(e.target.value, 10) }); e.target.value = String(model.rules.maxResults); sync(true); } });
    const frag = ['hard', 'soft'].map(v => h('label', {}, [
      h('input', { type: 'radio', name: 'a-frag', id: 'a-frag-' + v, value: v, checked: r.fragranceRule === v,
        onchange: () => { model.rules = core.normalizeRules({ ...model.rules, fragranceRule: v }); sync(true); } }),
      h('span', { text: t('admin.rules.' + v) })
    ]));
    const cur = h('input', { type: 'text', id: 'a-currency', value: r.currency, maxlength: '8',
      oninput: e => { model.rules = core.normalizeRules({ ...model.rules, currency: e.target.value }); sync(); } });
    const ver = h('input', { type: 'text', id: 'a-version', value: r.catalogVersion, maxlength: '40',
      oninput: e => { model.rules = core.normalizeRules({ ...model.rules, catalogVersion: e.target.value }); sync(); } });
    return h('section', { class: 'pg-section', 'aria-labelledby': 'a-rules-h' }, [
      h('h2', { id: 'a-rules-h', text: t('admin.rules.title') }),
      h('div', { class: 'pg-row' }, [
        h('div', { class: 'pg-field' }, [h('label', { for: 'a-max', text: t('admin.rules.max') }), max]),
        h('fieldset', { class: 'pg-field pg-radios' }, [h('legend', { text: t('admin.rules.fragrance') })].concat(frag)),
        h('div', { class: 'pg-field' }, [h('label', { for: 'a-currency', text: t('admin.rules.currency') }), cur]),
        h('div', { class: 'pg-field' }, [h('label', { for: 'a-version', text: t('admin.rules.version') }), ver])
      ])
    ]);
  }

  function reportTable() {
    if (!model.report) return null;
    const { file, res } = model.report;
    const msg = res.fatal ? t('admin.import.fatal', { file })
      : t('admin.import.result', { file, ok: res.products.length, bad: new Set(res.report.map(x => x.row)).size });
    const status = h('p', { class: 'pg-status ' + (res.fatal || res.report.length ? 'pg-bad' : 'pg-good'), id: 'a-import-status', role: 'status', text: msg });
    if (!res.report.length) return h('div', {}, [status, h('p', { text: t('admin.report.none') })]);
    return h('div', {}, [
      status,
      h('div', { class: 'pg-table-wrap' }, [h('table', { class: 'pg-table', id: 'a-report' }, [
        h('caption', { class: 'wm-vh', text: t('admin.report.title') }),
        h('thead', {}, [h('tr', {}, ['admin.report.row', 'admin.report.field', 'admin.report.reason'].map(k => h('th', { scope: 'col', text: t(k) })))]),
        h('tbody', {}, res.report.map(x => h('tr', {}, [
          h('td', { class: 'pg-num', text: String(x.row) }),
          h('td', { text: x.field + (x.id ? ' (' + x.id + ')' : '') }),
          h('td', { text: t('admin.reason.' + x.reason) })
        ])))
      ])])
    ]);
  }

  function importSection() {
    const file = h('input', { type: 'file', id: 'a-file', accept: '.csv,.json,text/csv,application/json',
      onchange: async e => {
        const f = e.target.files && e.target.files[0];
        if (!f) return;
        const res = core.importCatalog(await f.text(), f.name);
        model.report = { file: f.name, res };
        if (!res.fatal) model.records = clone(res.products);
        render();
        sync(true);
        $('a-import-status').focus();
      } });
    return h('section', { class: 'pg-section', 'aria-labelledby': 'a-io-h' }, [
      h('h2', { id: 'a-io-h', text: t('admin.report.title') }),
      h('div', { class: 'pg-row' }, [
        h('span', { class: 'pg-file' }, [file, h('span', { class: 'wm-btn wm-btn-secondary', 'aria-hidden': 'true', text: t('admin.import') })]),
        h('label', { for: 'a-file', class: 'wm-vh', text: t('admin.import') }),
        h('button', { type: 'button', class: 'wm-btn wm-btn-secondary', id: 'a-export', text: t('admin.export'), onclick: exportCatalog })
      ]),
      reportTable()
    ]);
  }

  const COLS = [
    ['id', 'admin.col.id'], ['name', 'admin.col.name'], ['price', 'admin.col.price'], ['texture', 'admin.col.texture'],
    ['fragrance_free', 'admin.col.ff'], ['size_ml', 'admin.col.size'], ['use_time', 'admin.col.useTime'], ['in_stock', 'admin.col.stock'],
    ['limitation.en', 'admin.col.limEn'], ['limitation.kk', 'admin.col.limKk']
  ];

  function cellInput(rec, i, field, labelKey) {
    const rowLabel = (rec && rec.id) || '#' + (i + 1);
    const common = { id: `a-r${i}-${field.replace('.', '-')}`, 'aria-label': t(labelKey) + ' — ' + rowLabel, 'data-field': field };
    const set = v => {
      if (field.startsWith('limitation.')) { rec.limitation = Object.assign({}, rec.limitation, { [field.slice(11)]: v }); }
      else rec[field] = v;
      sync();
    };
    if (field === 'texture' || field === 'use_time') {
      const list = field === 'texture' ? core.TEXTURES : core.USE_TIMES;
      const key = field === 'texture' ? 'texture.' : 'useTime.';
      const sel = h('select', { ...common, onchange: e => set(e.target.value) },
        (list.includes(rec[field]) ? [] : [h('option', { value: String(rec[field] == null ? '' : rec[field]), text: String(rec[field] == null ? '' : rec[field]) })])
          .concat(list.map(v => h('option', { value: v, text: t(key + v) }))));
      sel.value = rec[field] == null ? '' : String(rec[field]);
      return sel;
    }
    if (field === 'fragrance_free' || field === 'in_stock') {
      return h('input', { ...common, type: 'checkbox', checked: field === 'in_stock' ? rec.in_stock !== false : rec[field] === true,
        onchange: e => set(e.target.checked) });
    }
    const raw = field.startsWith('limitation.') ? (rec.limitation || {})[field.slice(11)] : rec[field];
    const input = h('input', { ...common, type: 'text', class: ['price', 'size_ml', 'id'].includes(field) ? 'pg-short' : null,
      inputmode: field === 'price' || field === 'size_ml' ? 'numeric' : null,
      oninput: e => set(field === 'price' || field === 'size_ml' ? intOrRaw(e.target.value) : e.target.value) });
    input.value = raw == null ? '' : String(raw);
    return input;
  }

  function catalogSection() {
    const problems = problemsByRow();
    const rows = model.records.map((rec, i) => h('tr', { id: 'a-row-' + i, class: problems.has(i) ? 'pg-hidden-row' : null }, COLS.map(([field, key]) => h('td', {}, [cellInput(rec, i, field, key)]))
      .concat([
        h('td', { id: 'a-status-' + i }),
        h('td', {}, [h('button', {
          type: 'button', class: 'wm-btn wm-btn-secondary wm-btn-small', id: 'a-del-' + i, text: t('admin.delete'),
          'aria-label': t('admin.delete.aria', { id: (rec && rec.id) || '#' + (i + 1) }),
          onclick: () => {
            model.records.splice(i, 1);
            render();
            sync(true);
            const next = $('a-del-' + Math.min(i, model.records.length - 1)) || $('a-add');
            if (next) next.focus();
          }
        })])
      ])));
    return h('section', { class: 'pg-section', 'aria-labelledby': 'a-cat-h' }, [
      h('h2', { id: 'a-cat-h', text: t('admin.catalog.title', { n: model.records.length }) }),
      h('div', { class: 'pg-table-wrap' }, [h('table', { class: 'pg-table', id: 'a-table' }, [
        h('thead', {}, [h('tr', {}, COLS.map(([, k]) => h('th', { scope: 'col', text: t(k) })).concat([h('th', { scope: 'col', text: t('admin.col.status') }), h('th', { scope: 'col' }, [h('span', { class: 'wm-vh', text: t('admin.delete') })])]))]),
        h('tbody', {}, rows)
      ])]),
      h('div', { class: 'wm-actions' }, [
        h('button', { type: 'button', class: 'wm-btn wm-btn-primary', id: 'a-add', text: t('admin.add'), onclick: addProduct }),
        h('button', { type: 'button', class: 'wm-btn wm-btn-secondary', id: 'a-reset', text: t('admin.reset'), onclick: reset })
      ])
    ]);
  }

  function updateStatuses() {
    const problems = problemsByRow();
    model.records.forEach((rec, i) => {
      const cell = $('a-status-' + i);
      if (!cell) return;
      const p = problems.get(i);
      cell.replaceChildren(h('span', { class: p ? 'pg-warn' : 'pg-ok', text: p ? t('admin.status.hidden', { fields: p.join(', ') }) : t('admin.status.ok') }));
      $('a-row-' + i).classList.toggle('pg-hidden-row', !!p);
      for (const node of $('a-row-' + i).querySelectorAll('[data-field]')) {
        const f = node.getAttribute('data-field');
        const bad = p && (p.includes(f) || (f === 'id' && p.includes('duplicateId')));
        if (bad) node.setAttribute('aria-invalid', 'true'); else node.removeAttribute('aria-invalid');
      }
    });
    const hd = $('a-cat-h');
    if (hd) hd.textContent = t('admin.catalog.title', { n: model.records.length });
  }

  function render() {
    renderChrome();
    const storage = h('label', { class: 'pg-check' }, [
      h('input', { type: 'checkbox', id: 'a-persist', checked: model.persist, onchange: e => { model.persist = e.target.checked; save(); } }),
      h('span', { text: t('admin.storage') })
    ]);
    const left = h('div', {}, [rulesSection(), importSection(), catalogSection()]);
    const right = h('section', { class: 'pg-section pg-sticky-preview', 'aria-labelledby': 'a-prev-h' }, [h('h2', { id: 'a-prev-h', text: t('admin.preview.title') }), previewHost]);
    $('a-main').replaceChildren(
      h('h1', { text: t('admin.title') }),
      h('p', { text: t('admin.intro') }),
      storage,
      h('div', { class: 'pg-grid pg-grid-2' }, [left, right])
    );
    updateStatuses();
  }

  // ---------------------------------------------------------------- actions
  function addProduct() {
    model.records.push({
      id: nextId(), name: t('admin.newName'), price: 1000, texture: 'light', fragrance_free: true, size_ml: 50,
      use_time: 'day', in_stock: true, limitation: { en: '', kk: '' }, fictional: true
    });
    render();
    sync(true);
    $(`a-r${model.records.length - 1}-name`).focus();
  }
  function reset() {
    if (!window.confirm(t('admin.reset.confirm'))) return;
    model.records = clone(originalProducts);
    model.rules = core.normalizeRules({ catalogVersion: originalVersion });
    model.report = null;
    render();
    sync(true);
    $('a-reset').focus();
  }
  function exportCatalog() {
    const blob = new Blob([JSON.stringify({ version: model.rules.catalogVersion, products: model.records }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = h('a', { href: url, download: model.rules.catalogVersion.replace(/[^\w.-]+/g, '_') + '.export.json', hidden: true });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  render();
  sync(true);
  window.WellMatchAdmin = { model, preview, sync, render };
})();
