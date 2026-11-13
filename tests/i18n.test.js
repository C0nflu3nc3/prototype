(function (define) {
  define('i18n.test.js', function ({ test, assert, core, data, env }) {
    const { en, kk } = data;
    const names = s => [...new Set((s.match(/\{(\w+)(?:\|\w+)?\}/g) || []).map(p => p.replace(/[{}]|\|\w+/g, '')))].sort();

    test('I01 en.json and kk.json have identical key sets', () => {
      const missingInKk = Object.keys(en).filter(k => !(k in kk));
      const extraInKk = Object.keys(kk).filter(k => !(k in en));
      assert.deepStrictEqual({ missingInKk, extraInKk }, { missingInKk: [], extraInKk: [] });
    });
    test('I02 no empty or whitespace-only values', () => {
      const bad = [];
      for (const [name, d] of [['en', en], ['kk', kk]]) for (const k of Object.keys(d)) if (typeof d[k] !== 'string' || !d[k].trim()) bad.push(name + ':' + k);
      assert.deepStrictEqual(bad, []);
    });
    test('I03 every {placeholder} in en appears in the kk value (and kk adds none)', () => {
      const bad = Object.keys(en).filter(k => k in kk && names(en[k]).join() !== names(kk[k]).join());
      assert.deepStrictEqual(bad, []);
    });
    test('I04 plural count line in both languages', () => {
      const i = core.createI18n({ en, kk }, { warn() {} });
      assert.strictEqual(i.t('results.count', { n: 1, total: 6 }), '1 of 6 products match');
      assert.strictEqual(i.t('results.count', { n: 2, total: 6 }), '2 of 6 products match');
      i.setLang('kk');
      assert.strictEqual(i.t('results.count', { n: 1, total: 6 }), '6 өнімнің 1-і сәйкес келеді');
      assert.strictEqual(i.t('results.count', { n: 2, total: 12 }), '12 өнімнің 2-сі сәйкес келеді');
      assert.strictEqual(i.t('catalog.hidden', { n: 2 }), '2 өнім жасырылды: деректер толық емес');
    });
    test('I05 missing key -> en fallback or the key itself, console.warn exactly once', () => {
      let warns = 0;
      const i = core.createI18n({ en: { 'only.en': 'English text' }, kk: {} }, { lang: 'kk', warn() { warns++; } });
      assert.strictEqual(i.t('only.en'), 'English text');
      assert.strictEqual(i.t('only.en'), 'English text');
      assert.strictEqual(warns, 1, 'fallback warns once');
      warns = 0;
      assert.strictEqual(i.t('missing.key'), 'missing.key');
      assert.strictEqual(i.t('missing.key'), 'missing.key');
      assert.strictEqual(warns, 1, 'missing key warns once');
    });
    test('I06 kk.json contains each Kazakh-specific letter ә ғ қ ң ө ұ ү һ і', () => {
      const all = Object.values(kk).join(' ').toLowerCase();
      const missing = ['ә', 'ғ', 'қ', 'ң', 'ө', 'ұ', 'ү', 'һ', 'і'].filter(ch => !all.includes(ch));
      assert.deepStrictEqual(missing, []);
    });
    test('I07 claim guard: no en value says diagnose / cure / treat / guarantee / faster / sales / returns', () => {
      const re = /\b(diagnos\w*|cure[sd]?|treat\w*|guarantee\w*|faster|sales|returns)\b/i;
      const bad = Object.keys(en).filter(k => re.test(en[k])).map(k => k + ': ' + en[k].match(re)[0]);
      assert.deepStrictEqual(bad, []);
    });
    test('Kazakh numeral suffixes (kkPossessive)', () => {
      const got = [0, 1, 2, 3, 6, 7, 9, 10, 12, 20, 40, 50, 100, 1000].map(core.kkPossessive);
      assert.deepStrictEqual(got, ['0-і', '1-і', '2-сі', '3-і', '6-сы', '7-сі', '9-ы', '10-ы', '12-сі', '20-сы', '40-ы', '50-і', '100-і', '1000-ы']);
    });
    test.node('every literal t("key") in the UI scripts exists in en.json', () => {
      const missing = [];
      for (const file of ['wellmatch.js', 'admin.js', 'analytics.js']) {
        const src = env.read(file);
        for (const m of src.matchAll(/\bt\('([\w.]+)'\s*[,)]/g)) {
          const k = m[1];
          if (!(k in en) && !((k + '.other') in en)) missing.push(file + ': ' + k);
        }
      }
      assert.deepStrictEqual([...new Set(missing)], []);
    });
    test.node('no visible text literals in the HTML pages of the app (only i18n)', () => {
      for (const file of ['index.html']) {
        const body = env.read(file).replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<!--[\s\S]*?-->/g, '');
        const text = body.replace(/<[^>]+>/g, '').replace(/\s+/g, '');
        assert.strictEqual(text, '', file + ' contains text: ' + text.slice(0, 60));
      }
    });
  });
})(typeof module === 'object' && module.exports ? require('./harness').define : window.WMTest.define);
