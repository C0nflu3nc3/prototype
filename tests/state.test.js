(function (define, makeClock) {
  define('state.test.js', function ({ test, assert, core, data }) {
    const catalog = core.loadCatalog(data.catalog).products;
    const ctx = (rules) => ({ catalog, rules, now: makeClock() });
    const apply = (s, actions, rules) => { const c = ctx(rules); return actions.reduce((st, a) => core.reduce(st, a, c), s); };
    const answer = a => Object.keys(a).map(field => ({ type: 'SET_ANSWER', field, value: a[field] }));
    const atS1 = () => apply(core.createInitialState(), [{ type: 'SET_CONSENT', value: true }, { type: 'START' }]);
    const submitted = a => apply(atS1(), answer(a).concat([{ type: 'SUBMIT' }]));
    const A6000 = { budget: '6000', texture: 'light', fragrance: 'free' };

    test('S01 initial state', () => {
      const s = core.createInitialState();
      assert.strictEqual(s.screen, 's0');
      assert.strictEqual(s.consent, false);
      assert.strictEqual(s.lang, 'en');
      assert.deepStrictEqual(s.answers, { budget: '', texture: null, fragrance: null, useTime: null, size: null });
    });
    test('S02 START without consent stays on s0 (same object)', () => {
      const s = core.createInitialState();
      assert.strictEqual(core.reduce(s, { type: 'START' }, ctx()), s);
    });
    test('S03 START with consent -> s1', () => assert.strictEqual(atS1().screen, 's1'));
    test('S04 SUBMIT invalid -> stays s1, errors populated', () => {
      const s = apply(atS1(), [{ type: 'SUBMIT' }]);
      assert.strictEqual(s.screen, 's1');
      assert.deepStrictEqual(s.errors, { budget: 'required', texture: 'required', fragrance: 'required' });
    });
    test('S05 SUBMIT valid with results -> s2, results populated', () => {
      const s = submitted(A6000);
      assert.strictEqual(s.screen, 's2');
      assert.deepStrictEqual(s.results.map(p => p.id), ['WM-02', 'WM-05']);
    });
    test('S06 SUBMIT valid with 0 results -> s2b', () => assert.strictEqual(submitted({ budget: '2000', texture: 'rich', fragrance: 'free' }).screen, 's2b'));
    test('S07 CHANGE from s2 / s2b -> s1 with answers preserved', () => {
      for (const a of [A6000, { budget: '2000', texture: 'rich', fragrance: 'free' }]) {
        const s = apply(submitted(a), [{ type: 'CHANGE' }]);
        assert.strictEqual(s.screen, 's1');
        assert.strictEqual(s.answers.budget, a.budget);
        assert.strictEqual(s.answers.texture, a.texture);
      }
    });
    test('S08 SELECT WM-02 -> s3, selected', () => {
      const s = apply(submitted(A6000), [{ type: 'SELECT', id: 'WM-02' }]);
      assert.strictEqual(s.screen, 's3');
      assert.strictEqual(s.selected, 'WM-02');
    });
    test('S09 SELECT id not in results -> ignored (same object)', () => {
      const s = submitted(A6000);
      assert.strictEqual(core.reduce(s, { type: 'SELECT', id: 'WM-03' }, ctx()), s);
    });
    test('S10 FEEDBACK 4 kept; FEEDBACK 7 ignored', () => {
      const s = apply(submitted(A6000), [{ type: 'SELECT', id: 'WM-02' }, { type: 'FEEDBACK', value: 4 }]);
      assert.strictEqual(s.feedback, 4);
      assert.strictEqual(core.reduce(s, { type: 'FEEDBACK', value: 7 }, ctx()), s);
    });
    test('S11 RESTART from any screen -> s0, everything cleared except lang', () => {
      const base = apply(submitted(A6000), [{ type: 'SET_LANG', lang: 'kk' }, { type: 'SELECT', id: 'WM-02' }, { type: 'FEEDBACK', value: 3 }]);
      for (const s of [atS1(), submitted(A6000), base]) {
        const r = apply(s.lang === 'kk' ? s : apply(s, [{ type: 'SET_LANG', lang: 'kk' }]), [{ type: 'RESTART' }]);
        assert.strictEqual(r.screen, 's0');
        assert.strictEqual(r.lang, 'kk');
        assert.strictEqual(r.consent, false);
        assert.deepStrictEqual(r.answers, core.createInitialState().answers);
        assert.deepStrictEqual([r.results, r.selected, r.feedback, r.history], [[], null, null, []]);
      }
    });
    test('S12 LEAVE from s2b behaves like RESTART', () => {
      const r = apply(submitted({ budget: '2000', texture: 'rich', fragrance: 'free' }), [{ type: 'LEAVE' }]);
      assert.strictEqual(r.screen, 's0');
      assert.strictEqual(r.answers.budget, '');
    });
    test('S13 SET_LANG kk on s2 keeps screen, answers and results', () => {
      const s = submitted(A6000);
      const r = apply(s, [{ type: 'SET_LANG', lang: 'kk' }]);
      assert.strictEqual(r.lang, 'kk');
      assert.strictEqual(r.screen, 's2');
      assert.strictEqual(r.answers, s.answers);
      assert.strictEqual(r.results, s.results);
    });
    test('S14 SET_LANG fr -> ignored', () => {
      const s = submitted(A6000);
      assert.strictEqual(core.reduce(s, { type: 'SET_LANG', lang: 'fr' }, ctx()), s);
    });
    test('S15 re-SUBMIT with changed answers clears selection and old results', () => {
      let s = apply(submitted(A6000), [{ type: 'SELECT', id: 'WM-02' }, { type: 'NAVIGATE', screen: 's1' }]);
      assert.strictEqual(s.screen, 's1');
      s = apply(s, answer({ budget: '9000', fragrance: 'any' }));
      assert.deepStrictEqual([s.selected, s.results], [null, []], 'cleared as soon as answers change');
      s = apply(s, [{ type: 'SUBMIT' }]);
      assert.strictEqual(s.selected, null);
      assert.deepStrictEqual(s.results.map(p => p.id), ['WM-04', 'WM-02', 'WM-05']);
      const bad = apply(apply(s, [{ type: 'CHANGE' }]), answer({ budget: 'abc' }).concat([{ type: 'SUBMIT' }]));
      assert.deepStrictEqual(bad.results, []);
    });
    test('S16 #s3 entered directly without a selection -> s0', () => {
      assert.strictEqual(apply(core.createInitialState(), [{ type: 'NAVIGATE', screen: 's3' }]).screen, 's0');
      assert.strictEqual(apply(submitted(A6000), [{ type: 'NAVIGATE', screen: 's3' }]).screen, 's0');
    });

    // ---- browser history / F15 links ----
    test('NAVIGATE back to s1 and forward to s2 keeps answers and results', () => {
      const s = submitted(A6000);
      const back = apply(s, [{ type: 'NAVIGATE', screen: 's1' }]);
      const fwd = apply(back, [{ type: 'NAVIGATE', screen: 's2' }]);
      assert.strictEqual(fwd.screen, 's2');
      assert.strictEqual(fwd.results, s.results);
    });
    test('hash parse/serialise round-trip', () => {
      const h = 's2?b=6000&t=light&f=free&lang=kk';
      const p = core.parseHash('#' + h);
      assert.strictEqual(p.screen, 's2');
      assert.deepStrictEqual(p.params, { answers: { budget: '6000', texture: 'light', fragrance: 'free', useTime: null, size: null }, lang: 'kk' });
      assert.strictEqual(core.serialiseHash({ screen: 's2', answers: core.validateAnswers(p.params.answers).value, lang: 'kk' }), h);
      const full = { screen: 's2', answers: { budget: 1000000, texture: 'rich', fragrance: 'any', useTime: 'night', size: 'travel' }, lang: 'en' };
      const back = core.parseHash(core.serialiseHash(full));
      assert.deepStrictEqual(core.validateAnswers(back.params.answers).value, full.answers);
      assert.deepStrictEqual(core.parseHash('#s1'), { screen: 's1', params: null });
      assert.strictEqual(core.hashForState(submitted({ budget: '2000', texture: 'rich', fragrance: 'free' })), 's2?b=2000&t=rich&f=free&lang=en');
    });
    test('F15 shared link before consent -> s0, then START reproduces the same results', () => {
      const link = core.parseHash('#s2?b=6000&t=light&f=free&lang=kk');
      let s = apply(core.createInitialState(), [{ type: 'NAVIGATE', screen: link.screen, params: link.params }]);
      assert.strictEqual(s.screen, 's0');
      assert.strictEqual(s.lang, 'kk');
      s = apply(s, [{ type: 'SET_CONSENT', value: true }, { type: 'START' }]);
      assert.strictEqual(s.screen, 's2');
      assert.deepStrictEqual(s.results.map(p => p.id), submitted(A6000).results.map(p => p.id));
    });
    test('F15 link with consent and different answers re-submits', () => {
      const link = core.parseHash('#s2?b=9000&t=light&f=any');
      const s = apply(submitted(A6000), [{ type: 'NAVIGATE', screen: 's2', params: link.params }]);
      assert.deepStrictEqual(s.results.map(p => p.id), ['WM-04', 'WM-02', 'WM-05']);
    });

    // ---- F14 history / revision, F22 compare, F16 recompute ----
    test('F14 revision banner data and history (max 10, newest first, restorable)', () => {
      let s = submitted({ budget: '5000', texture: 'light', fragrance: 'free' });
      assert.strictEqual(s.revision, null, 'first submit is not a revision');
      s = apply(s, [{ type: 'CHANGE' }].concat(answer({ budget: '6000' }), [{ type: 'SUBMIT' }]));
      assert.deepStrictEqual(s.revision.changes, [{ field: 'budget', from: 5000, to: 6000 }]);
      assert.deepStrictEqual(s.revision.added, [{ id: 'WM-05', because: 'price' }]);
      assert.deepStrictEqual(s.history.map(h => [h.answers.budget, h.count]), [[6000, 2], [5000, 1]]);
      for (let b = 1; b <= 12; b++) s = apply(s, [{ type: 'CHANGE' }].concat(answer({ budget: String(b * 1000) }), [{ type: 'SUBMIT' }]));
      assert.strictEqual(s.history.length, 10);
      const r = apply(s, [{ type: 'RESTORE', index: 9 }]);
      assert.strictEqual(r.answers.budget, String(s.history[9].answers.budget));
      assert.ok(r.screen === 's2' || r.screen === 's2b');
    });
    test('F22 compare: max 2, third ignored, untick works', () => {
      const s = submitted({ budget: '9000', texture: 'light', fragrance: 'any' });
      const r = apply(s, ['WM-04', 'WM-02', 'WM-05'].map(id => ({ type: 'TOGGLE_COMPARE', id })));
      assert.deepStrictEqual(r.compare, ['WM-04', 'WM-02']);
      assert.deepStrictEqual(apply(r, [{ type: 'TOGGLE_COMPARE', id: 'WM-04' }]).compare, ['WM-02']);
    });
    test('F16 RECOMPUTE: a new 1 000 KZT product appears first immediately', () => {
      const s = submitted(A6000);
      const extra = { id: 'WM-90', name: 'Test Cream', price: 1000, texture: 'light', fragrance_free: true, size_ml: 50, use_time: 'day', limitation: { en: 'x', kk: 'y' }, fictional: true };
      const r = core.reduce(s, { type: 'RECOMPUTE' }, { catalog: [extra].concat(catalog) });
      assert.deepStrictEqual(r.results.map(p => p.id), ['WM-90', 'WM-02', 'WM-05']);
    });
    test('F16 RECOMPUTE with rules: shortlist size 1', () => {
      const r = core.reduce(submitted({ budget: '9000', texture: 'light', fragrance: 'any' }), { type: 'RECOMPUTE' }, { catalog, rules: { maxResults: 1 } });
      assert.deepStrictEqual(r.results.map(p => p.id), ['WM-04']);
    });
    test('unknown action -> same object', () => {
      const s = core.createInitialState();
      assert.strictEqual(core.reduce(s, { type: 'NOPE' }, ctx()), s);
    });
  });
})(typeof module === 'object' && module.exports ? require('./harness').define : window.WMTest.define,
   typeof module === 'object' && module.exports ? require('./harness').makeClock : window.WMTest.makeClock);
