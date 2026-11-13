(function (define) {
  define('matching.test.js', function ({ test, assert, core, data }) {
    const catalog = core.loadCatalog(data.catalog).products;
    const ids = list => list.map(p => p.id);
    const run = (budget, texture, fragrance, extra, rules) =>
      ids(core.match(catalog, Object.assign({ budget, texture, fragrance }, extra || {}), rules));

    // ---- 5.1 required cases ----
    test('M01 {6000, light, free} -> [WM-02, WM-05]', () => assert.deepStrictEqual(run(6000, 'light', 'free'), ['WM-02', 'WM-05']));
    test('M02 {3000, light, any} -> [WM-04]', () => assert.deepStrictEqual(run(3000, 'light', 'any'), ['WM-04']));
    test('M03 {9000, light, any} -> [WM-04, WM-02, WM-05] (cap 3, price order)', () => assert.deepStrictEqual(run(9000, 'light', 'any'), ['WM-04', 'WM-02', 'WM-05']));
    test('M04 {2000, rich, free} -> []', () => assert.deepStrictEqual(run(2000, 'rich', 'free'), []));
    test('M05 {8900, rich, free} -> [WM-03] (price == budget eligible)', () => assert.deepStrictEqual(run(8900, 'rich', 'free'), ['WM-03']));
    test('M06 {8899, rich, free} -> [] (one tenge below)', () => assert.deepStrictEqual(run(8899, 'rich', 'free'), []));
    test('M07 {5000, medium, free} -> []', () => assert.deepStrictEqual(run(5000, 'medium', 'free'), []));
    test('M08 {7400, medium, free} -> [WM-06]', () => assert.deepStrictEqual(run(7400, 'medium', 'free'), ['WM-06']));
    test('M09 {7400, medium, any} -> [WM-01, WM-06]', () => assert.deepStrictEqual(run(7400, 'medium', 'any'), ['WM-01', 'WM-06']));
    test('M10 {7400, medium, light} -> [WM-01, WM-06] (like "any")', () => assert.deepStrictEqual(run(7400, 'medium', 'light'), ['WM-01', 'WM-06']));
    test('M11 {1000000, light, any} -> [WM-04, WM-02, WM-05] (still capped)', () => assert.deepStrictEqual(run(1000000, 'light', 'any'), ['WM-04', 'WM-02', 'WM-05']));
    test('M12 {2900, light, free} -> [] (WM-04 scented)', () => assert.deepStrictEqual(run(2900, 'light', 'free'), []));
    test('M13 {2900, light, any} -> [WM-04]', () => assert.deepStrictEqual(run(2900, 'light', 'any'), ['WM-04']));
    test('M14 tie-break: equal price -> id ascending (WM-09 before WM-10)', () => {
      const base = { name: 'Temp', texture: 'light', fragrance_free: true, size_ml: 50, use_time: 'day', limitation: { en: 'x', kk: 'y' }, fictional: true };
      const temp = [Object.assign({}, base, { id: 'WM-10', price: 1000 }), Object.assign({}, base, { id: 'WM-09', price: 1000 })];
      assert.deepStrictEqual(ids(core.match(temp.concat(catalog), { budget: 6000, texture: 'light', fragrance: 'free' })), ['WM-09', 'WM-10', 'WM-02']);
    });
    test('M15 results are the catalog objects themselves; catalog unchanged after 50 calls', () => {
      const before = JSON.stringify(catalog);
      let out;
      for (let i = 0; i < 50; i++) out = core.match(catalog, { budget: 9000 + i, texture: 'light', fragrance: 'any' });
      assert.strictEqual(out[0], catalog.find(p => p.id === 'WM-04'));
      assert.strictEqual(JSON.stringify(catalog), before);
    });
    test('M16 property: 500 seeded random answers obey every hard rule and the cap', () => {
      let seed = 20261113;
      const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
      for (let i = 0; i < 500; i++) {
        const a = { budget: 1 + Math.floor(rnd() * 12000), texture: core.TEXTURES[Math.floor(rnd() * 3)], fragrance: core.FRAGRANCES[Math.floor(rnd() * 3)] };
        const out = core.match(catalog, a);
        assert.ok(out.length <= 3);
        for (const p of out) {
          assert.ok(p.price <= a.budget, `${p.id} over budget ${a.budget}`);
          assert.strictEqual(p.texture, a.texture);
          assert.ok(a.fragrance !== 'free' || p.fragrance_free === true);
          assert.ok(p.in_stock !== false);
        }
        assert.deepStrictEqual(ids(core.analyse(catalog, a).shown), ids(out), 'analyse() disagrees with match()');
      }
    });
    test('M17 empty catalog -> []', () => assert.deepStrictEqual(core.match([], { budget: 9000, texture: 'light', fragrance: 'any' }), []));
    test('M18 one eligible item -> exactly that item (no padding)', () => assert.deepStrictEqual(run(4138, 'rich', 'any'), ['WM-11']));

    // ---- rules: shortlist size, soft fragrance, stock ----
    test('max shortlist size 1 -> only the cheapest', () => assert.deepStrictEqual(run(9000, 'light', 'any', null, { maxResults: 1 }), ['WM-04']));
    test('max shortlist size 5 -> five light products in price order', () =>
      assert.deepStrictEqual(run(1000000, 'light', 'any', null, { maxResults: 5 }), ['WM-04', 'WM-02', 'WM-05', 'WM-07', 'WM-08']));
    test('shortlist size is clamped to 1..5', () => {
      assert.strictEqual(core.normalizeRules({ maxResults: 0 }).maxResults, 1);
      assert.strictEqual(core.normalizeRules({ maxResults: 9 }).maxResults, 5);
      assert.strictEqual(core.normalizeRules({ maxResults: '4' }).maxResults, 3);
    });
    test('soft fragrance mode: scented ranked after fragrance-free, not excluded', () =>
      assert.deepStrictEqual(run(6000, 'light', 'free', null, { fragranceRule: 'soft' }), ['WM-02', 'WM-05', 'WM-04']));
    test('in_stock:false is excluded (WM-12) and returns when back in stock', () => {
      assert.deepStrictEqual(run(10000, 'rich', 'free'), ['WM-03']);
      const restocked = catalog.map(p => (p.id === 'WM-12' ? Object.assign({}, p, { in_stock: true }) : p));
      assert.deepStrictEqual(ids(core.match(restocked, { budget: 10000, texture: 'rich', fragrance: 'free' })), ['WM-03', 'WM-12']);
    });

    // ---- soft criteria re-order (Q4/Q5) ----
    test('Q4/Q5 soft: {9000, light, any, day, travel} -> [WM-02, WM-07, WM-04]', () =>
      assert.deepStrictEqual(run(9000, 'light', 'any', { useTime: 'day', size: 'travel' }), ['WM-02', 'WM-07', 'WM-04']));
    test('Q4 soft: night -> [WM-04, WM-05, WM-08]', () =>
      assert.deepStrictEqual(run(9000, 'light', 'any', { useTime: 'night' }), ['WM-04', 'WM-05', 'WM-08']));
    test('Q5 soft: large -> [WM-09, WM-06]', () =>
      assert.deepStrictEqual(run(20000, 'medium', 'free', { size: 'large' }), ['WM-09', 'WM-06']));
    test('soft answers never change WHICH products are eligible', () => {
      const a = { budget: 9000, texture: 'light', fragrance: 'any' };
      const plain = ids(core.analyse(catalog, a).eligible).sort();
      const soft = ids(core.analyse(catalog, Object.assign({ useTime: 'night', size: 'large' }, a)).eligible).sort();
      assert.deepStrictEqual(soft, plain);
    });
    test('sizeCategory boundaries 30 / 31 / 100 / 101', () => {
      assert.deepStrictEqual([30, 31, 100, 101].map(core.sizeCategory), ['travel', 'standard', 'standard', 'large']);
    });
    test('reasons() and softLimitations()', () => {
      const p = catalog.find(x => x.id === 'WM-02');
      assert.deepStrictEqual(core.reasons(p, { budget: 6000, texture: 'light', fragrance: 'free', useTime: 'day', size: 'travel' }),
        ['texture', 'budget', 'fragranceFree', 'useTime', 'size']);
      assert.deepStrictEqual(core.reasons(p, { budget: 6000, texture: 'light', fragrance: 'any' }), ['texture', 'budget']);
      assert.deepStrictEqual(core.softLimitations(p, { budget: 6000, texture: 'light', fragrance: 'any', useTime: 'night', size: 'large' }), ['useTime', 'size']);
    });

    // ---- F12 / F13 / F14 analysis ----
    test('F12 live count changes at 4137/4138 and 4899/4900', () => {
      const c = b => core.liveCount(catalog, { budget: b }).n;
      assert.deepStrictEqual([c('4137'), c('4138'), c('4899'), c('4900')], [2, 3, 3, 4]);
      assert.strictEqual(core.liveCount(catalog, { budget: 'abc' }).n, 11, 'invalid budget = no price filter (11 in stock)');
      assert.strictEqual(core.liveCount(catalog, {}).total, 12);
    });
    test('explain counts {6000, light, free}: 12 -> 11 in stock -> 5 -> 3 -> 2', () => {
      const a = core.analyse(catalog, { budget: 6000, texture: 'light', fragrance: 'free' });
      assert.deepStrictEqual([a.total, a.stock, a.price, a.texture, a.fragrance, a.shown.length], [12, 11, 5, 3, 2, 2]);
    });
    test('F13 why-not lists EVERY excluded product with all its rules', () => {
      const a = core.analyse(catalog, { budget: 6000, texture: 'light', fragrance: 'free' });
      assert.strictEqual(a.excluded.length + a.shown.length, 12);
      const r = id => a.excluded.find(e => e.product.id === id).reasons;
      assert.deepStrictEqual(r('WM-03'), [{ code: 'price', price: 8900, budget: 6000 }, { code: 'texture', texture: 'rich', wanted: 'light' }]);
      assert.deepStrictEqual(r('WM-04'), [{ code: 'fragrance' }]);
      assert.deepStrictEqual(r('WM-12').map(x => x.code), ['stock', 'price', 'texture']);
      const capped = core.analyse(catalog, { budget: 9000, texture: 'light', fragrance: 'any' }).excluded.filter(e => e.reasons[0].code === 'cap');
      assert.deepStrictEqual(capped.map(e => [e.product.id, e.reasons[0].rank]), [['WM-07', 4], ['WM-08', 5]]);
    });
    test('F14 diff: budget 5000 -> 6000 gives +1 (WM-05 now within budget)', () => {
      const prev = { answers: { budget: 5000, texture: 'light', fragrance: 'free', useTime: null, size: null }, shown: ['WM-02'] };
      const next = { answers: { budget: 6000, texture: 'light', fragrance: 'free', useTime: null, size: null }, shown: ['WM-02', 'WM-05'] };
      const d = core.diffRevision(prev, next, catalog);
      assert.deepStrictEqual(d.changes, [{ field: 'budget', from: 5000, to: 6000 }]);
      assert.deepStrictEqual(d.added, [{ id: 'WM-05', because: 'price' }]);
      assert.deepStrictEqual(d.removed, []);
      assert.strictEqual(d.delta, 1);
    });
    test('formatNumber / formatMoney use a no-break space', () => {
      assert.strictEqual(core.formatNumber(4900), '4 900');
      assert.strictEqual(core.formatMoney(1000000, 'KZT'), '1 000 000 KZT');
    });
  });
})(typeof module === 'object' && module.exports ? require('./harness').define : window.WMTest.define);
