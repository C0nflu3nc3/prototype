(function (define) {
  define('catalog.test.js', function ({ test, assert, core, data, env }) {
    const base = data.catalog.products[1]; // WM-02, valid
    const clone = o => JSON.parse(JSON.stringify(o));
    const withRecord = rec => ({ version: 'catalog-v1', products: [clone(base), rec] });
    const hiddenReasons = json => core.loadCatalog(json).hidden.map(h => h.reasons);
    const variant = patch => Object.assign(clone(base), { id: 'WM-99' }, patch);

    test('C01 shipped catalog.v1.json loads with 12 products, 0 hidden', () => {
      const r = core.loadCatalog(data.catalog);
      assert.strictEqual(r.version, 'catalog-v1');
      assert.strictEqual(r.products.length, 12);
      assert.deepStrictEqual(r.hidden, []);
    });
    test('C02 missing limitation.kk -> hidden, reason limitation.kk', () => {
      const rec = variant({ limitation: { en: 'x' } });
      assert.deepStrictEqual(hiddenReasons(withRecord(rec)), [['limitation.kk']]);
    });
    test('C03 price "4900" (string) -> hidden, reason price', () => assert.deepStrictEqual(hiddenReasons(withRecord(variant({ price: '4900' }))), [['price']]));
    test('C04 price 0 -> hidden', () => assert.deepStrictEqual(hiddenReasons(withRecord(variant({ price: 0 }))), [['price']]));
    test('C05 texture "Light" (wrong case) -> hidden', () => assert.deepStrictEqual(hiddenReasons(withRecord(variant({ texture: 'Light' }))), [['texture']]));
    test('C06 fragrance_free "true" (string) -> hidden', () => assert.deepStrictEqual(hiddenReasons(withRecord(variant({ fragrance_free: 'true' }))), [['fragrance_free']]));
    test('C07 fictional false -> hidden', () => assert.deepStrictEqual(hiddenReasons(withRecord(variant({ fictional: false }))), [['fictional']]));
    test('C08 duplicate id -> second record hidden, reason duplicateId', () => {
      const r = core.loadCatalog({ version: 'catalog-v1', products: [clone(base), clone(base)] });
      assert.strictEqual(r.products.length, 1);
      assert.deepStrictEqual(r.hidden.map(h => [h.index, h.reasons]), [[1, ['duplicateId']]]);
    });
    test('C09 version != catalog-v1 -> warning, products still load', () => {
      const warnings = [];
      const r = core.loadCatalog({ version: 'catalog-v0', products: [clone(base)] }, { warn: m => warnings.push(m) });
      assert.strictEqual(r.products.length, 1);
      assert.strictEqual(warnings.length, 1);
      assert.match(warnings[0], /catalog-v0/);
    });
    test('C10 hidden count surfaces to the UI state', () => {
      const r = core.loadCatalog(withRecord(variant({ price: '4900' })));
      const s = core.createInitialState({ catalogHidden: r.hidden.length });
      assert.strictEqual(s.catalogHidden, r.hidden.length);
      assert.strictEqual(s.catalogHidden, 1);
      const s2 = core.reduce(s, { type: 'RECOMPUTE', catalogHidden: 3 }, {});
      assert.strictEqual(s2.catalogHidden, 3);
    });
    test('new fields: use_time required, in_stock optional boolean', () => {
      assert.deepStrictEqual(hiddenReasons(withRecord(variant({ use_time: 'evening' }))), [['use_time']]);
      assert.deepStrictEqual(hiddenReasons(withRecord(variant({ in_stock: 'no' }))), [['in_stock']]);
      const noStock = variant({});
      delete noStock.in_stock;
      assert.deepStrictEqual(hiddenReasons(withRecord(noStock)), []);
    });

    // ---- CSV import ----
    const HEADER = 'id,name,price,texture,fragrance_free,size_ml,use_time,in_stock,limitation_en,limitation_kk,fictional';
    const ROW = 'WM-20,Test Cream,1000,light,true,50,day,true,"No SPF, small",SPF жоқ,true';
    test('CSV: valid file loads; quoted comma kept', () => {
      const r = core.importCatalog(HEADER + '\n' + ROW + '\n', 'a.csv');
      assert.strictEqual(r.fatal, false);
      assert.deepStrictEqual(r.report, []);
      assert.strictEqual(r.products[0].price, 1000);
      assert.strictEqual(r.products[0].limitation.en, 'No SPF, small');
      assert.strictEqual(r.products[0].in_stock, true);
    });
    test('CSV: missing column -> whole file rejected, column reported', () => {
      const r = core.importCatalog(HEADER.replace(',use_time', '') + '\nWM-20,Test,1000,light,true,50,true,a,b,true', 'a.csv');
      assert.strictEqual(r.fatal, true);
      assert.deepStrictEqual(r.report, [{ row: 1, id: null, field: 'use_time', reason: 'missingColumn' }]);
      assert.strictEqual(r.products.length, 0);
    });
    test('CSV: wrong type -> that row rejected with row/field/reason; valid rows kept', () => {
      const bad = 'WM-21,Bad,cheap,light,maybe,50,day,,a,b,true';
      const r = core.importCatalog([HEADER, ROW, bad].join('\n'), 'a.csv');
      assert.deepStrictEqual(r.products.map(p => p.id), ['WM-20']);
      assert.deepStrictEqual(r.report, [
        { row: 3, id: 'WM-21', field: 'price', reason: 'invalid' },
        { row: 3, id: 'WM-21', field: 'fragrance_free', reason: 'invalid' }
      ]);
    });
    test('CSV: duplicate id -> second row rejected', () => {
      const r = core.importCatalog([HEADER, ROW, ROW].join('\n'), 'a.csv');
      assert.strictEqual(r.products.length, 1);
      assert.deepStrictEqual(r.report, [{ row: 3, id: 'WM-20', field: 'id', reason: 'duplicateId' }]);
    });
    test('CSV: UTF-8 BOM is ignored', () => {
      const r = core.importCatalog('﻿' + HEADER + '\n' + ROW, 'a.csv');
      assert.strictEqual(r.fatal, false);
      assert.strictEqual(r.products.length, 1);
    });
    test('CSV: CRLF line endings and a quoted line break', () => {
      const row2 = 'WM-22,"Two\r\nLines",2000,rich,false,30,night,false,x,y,true';
      const r = core.importCatalog([HEADER, ROW, row2].join('\r\n') + '\r\n', 'a.csv');
      assert.deepStrictEqual(r.products.map(p => p.id), ['WM-20', 'WM-22']);
      assert.strictEqual(r.products[1].name, 'Two\r\nLines');
      assert.strictEqual(r.products[1].in_stock, false);
    });
    test('CSV: empty value -> reason "missing"; empty file -> fatal', () => {
      const r = core.importCatalog(HEADER + '\nWM-23,,1000,light,true,50,day,,a,,true', 'a.csv');
      assert.deepStrictEqual(r.report.map(x => [x.field, x.reason]), [['name', 'missing'], ['limitation.kk', 'missing']]);
      assert.strictEqual(core.importCatalog('', 'a.csv').fatal, true);
      assert.strictEqual(core.importCatalog('"unclosed', 'a.csv').report[0].reason, 'parse');
    });
    test('JSON import: object or array; broken JSON is fatal', () => {
      assert.strictEqual(core.importCatalog(JSON.stringify(data.catalog), 'c.json').products.length, 12);
      assert.strictEqual(core.importCatalog(JSON.stringify([base]), 'c.json').products.length, 1);
      assert.strictEqual(core.importCatalog('{oops', 'c.json').fatal, true);
    });
    test.node('store.html: 12 tiles whose ids, names and prices match the catalog; one-line embed present', () => {
      const html = env.read('store.html');
      const tiles = [...html.matchAll(/data-wm-id="([^"]+)">[\s\S]*?<h2>([^<]+)<\/h2>[\s\S]*?store-price">([^<]+)</g)]
        .map(m => [m[1], m[2], Number(m[3].replace(/&nbsp;|₸|\s/g, ''))]);
      assert.deepStrictEqual(tiles, data.catalog.products.map(p => [p.id, p.name, p.price]));
      assert.match(html, /<script src="wellmatch\.js" data-catalog="data\/catalog\.v1\.json" data-lang="kk"><\/script>/);
    });
    test.node('data/embedded.js equals the JSON sources (run `node tests/run.js --sync` if not)', () => {
      assert.strictEqual(env.read('data/embedded.js'), env.embeddedSource(data));
    });
  });
})(typeof module === 'object' && module.exports ? require('./harness').define : window.WMTest.define);
