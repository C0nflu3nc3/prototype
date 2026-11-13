/*
 * WellMatch session analytics (F19). Drop exported session JSON files; everything is computed in the browser
 * by WellMatchCore.analyseSessions(). Nothing is uploaded or stored.
 */
(async function () {
  'use strict';
  const { h } = window.WellMatch;
  const data = await window.WellMatch.load({ allowOverride: false });
  const core = data.core;
  const params = new URLSearchParams(location.search);
  const i18n = core.createI18n(data.dicts, { lang: core.LANGS.includes(params.get('lang')) ? params.get('lang') : 'en' });
  const t = (k, v) => i18n.t(k, v);
  const $ = id => document.getElementById(id);
  const SVG = 'http://www.w3.org/2000/svg';
  const BAR = '#2F78B5'; // validated with the dataviz palette checker (lightness, chroma, contrast vs white)

  const model = { sessions: [], keys: new Set(), errors: [] };

  const pct = x => (x == null ? t('analytics.na') : Math.round(x * 100) + '%');
  const num = (x, d) => (x == null ? t('analytics.na') : String(Math.round(x * Math.pow(10, d)) / Math.pow(10, d)));
  const secs = x => (x == null ? t('analytics.na') : t('analytics.seconds', { n: num(x, 1) }));

  async function addFiles(files) {
    for (const f of files) {
      let obj = null;
      try { obj = JSON.parse(await f.text()); } catch (e) { obj = null; }
      if (!core.isSessionLog(obj)) { model.errors.push(t('analytics.error', { file: f.name })); continue; }
      const key = [obj.participant, obj.startedAt, obj.exportedAt].join('|');
      if (model.keys.has(key)) continue;
      model.keys.add(key);
      model.sessions.push(obj);
    }
    render();
    $('an-status').focus();
  }

  function svg(tag, attrs, children) {
    const node = document.createElementNS(SVG, tag);
    for (const [k, v] of Object.entries(attrs || {})) node.setAttribute(k, String(v));
    for (const c of children || []) node.append(c);
    return node;
  }
  function niceStep(max) {
    const raw = max / 4;
    const p = Math.pow(10, Math.floor(Math.log10(raw || 1)));
    for (const m of [1, 2, 5, 10]) if (m * p >= raw) return m * p;
    return 10 * p;
  }

  /** Single-series column chart: thin bars (≤24px) with 4px rounded tops, recessive grid, median reference line, hover/focus tooltip. */
  function chart(rows, median) {
    const done = rows.filter(r => r.timeSec != null);
    if (!done.length) return h('p', { text: t('analytics.chart.none') });
    const W = 640, Hh = 240, m = { l: 44, r: 16, t: 16, b: 36 };
    const iw = W - m.l - m.r, ih = Hh - m.t - m.b;
    const step = niceStep(Math.max(...done.map(r => r.timeSec)));
    const top = Math.ceil(Math.max(...done.map(r => r.timeSec)) / step) * step || step;
    const y = v => m.t + ih - (v / top) * ih;
    const band = iw / done.length;
    const bw = Math.min(24, band * 0.6);
    const g = [];
    for (let v = 0; v <= top + 1e-9; v += step) {
      g.push(svg('line', { x1: m.l, x2: W - m.r, y1: y(v), y2: y(v), stroke: v === 0 ? '#6B7785' : '#E3E8ED', 'stroke-width': 1 }));
      const lab = svg('text', { x: m.l - 6, y: y(v) + 4, 'text-anchor': 'end', 'font-size': 12, fill: '#56616E' });
      lab.textContent = num(v, 1);
      g.push(lab);
    }
    const tip = h('div', { class: 'pg-tooltip', hidden: true, role: 'presentation' });
    done.forEach((r, i) => {
      const cx = m.l + band * i + band / 2;
      const x0 = cx - bw / 2, x1 = cx + bw / 2, yTop = y(r.timeSec), yBase = y(0);
      const rad = Math.min(4, Math.max(0, yBase - yTop));
      const d = `M${x0},${yBase} V${yTop + rad} Q${x0},${yTop} ${x0 + rad},${yTop} H${x1 - rad} Q${x1},${yTop} ${x1},${yTop + rad} V${yBase} Z`;
      const label = (r.participant || '?') + ': ' + secs(r.timeSec);
      const hit = svg('rect', { x: cx - band / 2, y: m.t, width: band, height: ih, fill: 'transparent' });
      const bar = svg('g', { class: 'pg-bar', tabindex: 0, role: 'img', 'aria-label': label }, [hit, svg('path', { d, fill: BAR })]);
      const show = () => {
        tip.textContent = label;
        tip.hidden = false;
        tip.style.left = (cx / W * 100) + '%';
        tip.style.top = ((yTop - 6) / Hh * 100) + '%';
      };
      bar.addEventListener('mouseenter', show);
      bar.addEventListener('focus', show);
      bar.addEventListener('mouseleave', () => { tip.hidden = true; });
      bar.addEventListener('blur', () => { tip.hidden = true; });
      g.push(bar);
      const xl = svg('text', { x: cx, y: Hh - m.b + 18, 'text-anchor': 'middle', 'font-size': 12, fill: '#1F2A36' });
      xl.textContent = r.participant || '?';
      g.push(xl);
    });
    if (median != null) {
      g.push(svg('line', { x1: m.l, x2: W - m.r, y1: y(median), y2: y(median), stroke: '#1F2A36', 'stroke-width': 1, 'stroke-dasharray': '4 4' }));
      const ml = svg('text', { x: m.l + 4, y: y(median) - 6, 'text-anchor': 'start', 'font-size': 12, fill: '#1F2A36',
        stroke: '#FFFFFF', 'stroke-width': 4, 'paint-order': 'stroke', 'stroke-linejoin': 'round' });
      ml.textContent = t('analytics.m.median') + ': ' + secs(median);
      g.push(ml);
    }
    const s = svg('svg', { viewBox: `0 0 ${W} ${Hh}`, role: 'group', 'aria-label': t('analytics.chart.title') }, g);
    return h('div', { class: 'pg-chart' }, [s, tip]);
  }

  function render() {
    document.documentElement.lang = i18n.getLang();
    document.title = t('analytics.title') + ' · ' + t('app.name');
    $('an-brand').textContent = t('app.name') + ' · ' + t('analytics.title');
    const lg = $('an-lang');
    lg.setAttribute('aria-label', t('lang.switch'));
    lg.replaceChildren(...core.LANGS.map(l => h('button', {
      type: 'button', class: 'wm-lang-btn', id: 'an-lang-' + l, lang: l, 'aria-pressed': String(i18n.getLang() === l),
      onclick: () => { i18n.setLang(l); render(); $('an-lang-' + l).focus(); }
    }, [h('span', { 'aria-hidden': 'true', text: t('lang.' + l) }), h('span', { class: 'wm-vh', text: t('lang.' + l + '.name') })])));

    const res = core.analyseSessions(model.sessions);
    const s = res.summary;
    const input = h('input', { type: 'file', id: 'an-file', multiple: true, accept: '.json,application/json', onchange: e => addFiles([...e.target.files]) });
    const drop = h('div', { class: 'pg-drop', id: 'an-drop' }, [
      h('p', { text: t('analytics.drop') }),
      h('span', { class: 'pg-file' }, [input, h('span', { class: 'wm-btn wm-btn-secondary', 'aria-hidden': 'true', text: t('analytics.choose') })]),
      h('label', { for: 'an-file', class: 'wm-vh', text: t('analytics.choose') })
    ]);
    drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('pg-dragging'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('pg-dragging'));
    drop.addEventListener('drop', e => { e.preventDefault(); drop.classList.remove('pg-dragging'); addFiles([...e.dataTransfer.files]); });

    const status = h('p', { class: 'pg-status', id: 'an-status', tabindex: '-1', role: 'status' }, [
      res.rows.length ? t('analytics.loaded', { n: res.rows.length }) : t('analytics.empty')
    ].concat(model.errors.map(e => h('span', { class: 'pg-warn', text: ' ' + e }))));

    const metrics = [
      ['analytics.m.sessions', String(s.sessions)],
      ['analytics.m.completion', pct(s.completionRate)],
      ['analytics.m.median', secs(s.medianTimeSec)],
      ['analytics.m.noMatch', pct(s.noMatchRate)],
      ['analytics.m.errors', num(s.errorsPerSession, 2)],
      ['analytics.m.lang', s.languages.en + ' / ' + s.languages.kk],
      ['analytics.m.clarity', num(s.meanClarity, 2)],
      ['analytics.m.ease', num(s.meanEase, 2)],
      ['analytics.m.confidence', num(s.meanConfidence, 2)],
      ['analytics.m.wouldUse', pct(s.wouldUseYesRate)]
    ];
    const who = r => (r.participant === 'anonymous' ? t('analytics.anonymous') : r.participant || t('analytics.na'));
    const comments = res.rows.flatMap(r => r.comments.map(c => ({ who: who(r), text: c })));
    const yes = b => t(b ? 'analytics.yes' : 'analytics.no');
    const content = res.rows.length ? [
      h('section', { class: 'pg-section', 'aria-labelledby': 'an-sum-h' }, [
        h('h2', { id: 'an-sum-h', text: t('analytics.summary') }),
        h('dl', { class: 'pg-metrics' }, metrics.map(([k, v]) => h('div', { class: 'pg-metric' }, [h('dt', { text: t(k) }), h('dd', { text: v })])))
      ]),
      h('section', { class: 'pg-section', 'aria-labelledby': 'an-chart-h' }, [
        h('h2', { id: 'an-chart-h', text: t('analytics.chart.title') }),
        chart(res.rows, s.medianTimeSec)
      ]),
      h('section', { class: 'pg-section', 'aria-labelledby': 'an-rows-h' }, [
        h('h2', { id: 'an-rows-h', text: t('analytics.perSession') }),
        h('div', { class: 'pg-table-wrap' }, [h('table', { class: 'pg-table', id: 'an-table' }, [
          h('thead', {}, [h('tr', {}, ['participant', 'task', 'completed', 'time', 'noMatch', 'errors', 'lang', 'clarity', 'ease', 'confidence', 'wouldUse']
            .map(k => h('th', { scope: 'col', class: ['time', 'errors', 'clarity', 'ease', 'confidence'].includes(k) ? 'pg-num' : null, text: t('analytics.col.' + k) })))]),
          h('tbody', {}, res.rows.map(r => h('tr', {}, [
            h('th', { scope: 'row', text: who(r) }),
            h('td', { text: r.task || t('analytics.na') }),
            h('td', { text: yes(r.completed) }),
            h('td', { class: 'pg-num', text: r.timeSec == null ? t('analytics.na') : num(r.timeSec, 1) }),
            h('td', { text: yes(r.noMatch) }),
            h('td', { class: 'pg-num', text: String(r.errors) }),
            h('td', { text: t('lang.' + r.lang) }),
            h('td', { class: 'pg-num', text: num(r.clarity, 2) }),
            h('td', { class: 'pg-num', text: num(r.ease, 2) }),
            h('td', { class: 'pg-num', text: num(r.confidence, 2) }),
            h('td', { text: r.wouldUse ? t('feedback.wouldUse.' + r.wouldUse) : t('analytics.na') })
          ])))
        ])])
      ]),
      h('section', { class: 'pg-section', 'aria-labelledby': 'an-com-h' }, [
        h('h2', { id: 'an-com-h', text: t('analytics.comments', { n: comments.length }) }),
        comments.length
          ? h('ul', { id: 'an-comments' }, comments.map(c => h('li', {}, [h('strong', { text: c.who + ': ' }), c.text])))
          : h('p', { text: t('analytics.comments.none') })
      ])
    ] : [];

    $('an-main').replaceChildren(
      h('h1', { text: t('analytics.title') }),
      h('p', { text: t('analytics.intro') }),
      drop,
      status,
      h('div', { class: 'wm-actions' }, [
        h('button', { type: 'button', class: 'wm-btn wm-btn-primary', id: 'an-export', disabled: !res.rows.length, text: t('analytics.export'), onclick: () => exportCSV(res) }),
        h('button', { type: 'button', class: 'wm-btn wm-btn-secondary', id: 'an-clear', disabled: !res.rows.length && !model.errors.length, text: t('analytics.clear'),
          onclick: () => { model.sessions = []; model.keys.clear(); model.errors = []; render(); $('an-file').focus(); } })
      ]),
      ...content
    );
  }

  function exportCSV(res) {
    const blob = new Blob(['﻿' + core.sessionsToCSV(res)], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = h('a', { href: url, download: 'wellmatch_sessions_summary.csv', hidden: true });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  render();
  window.WellMatchAnalytics = { addFiles, model };
})();
