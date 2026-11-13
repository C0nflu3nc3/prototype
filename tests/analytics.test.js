(function (define, makeClock) {
  define('analytics.test.js', function ({ test, assert, core, data }) {
    const catalog = core.loadCatalog(data.catalog).products;
    const ev = (event, detail, t) => ({ t: t || '2026-11-13T10:00:00.000Z', screen: 's1', event, detail: detail || {} });

    // P01 is produced end-to-end by the real reducer + exportLog; P02 and P03 are hand-written.
    function p01() {
      const c = { catalog, now: makeClock() };
      let s = core.createInitialState({ test: 'P01', now: c.now });
      const steps = [{ type: 'SET_CONSENT', value: true }, { type: 'START' },
        { type: 'SET_ANSWER', field: 'budget', value: '6000' }, { type: 'SET_ANSWER', field: 'texture', value: 'light' },
        { type: 'SET_ANSWER', field: 'fragrance', value: 'free' }, { type: 'SUBMIT' }, { type: 'SELECT', id: 'WM-02' }, { type: 'FEEDBACK', value: 4 }];
      for (const a of steps) s = core.reduce(s, a, c);
      return JSON.parse(core.exportLog(s));
    }
    const p02 = {
      participant: 'P02', appVersion: 'v1.0', catalogVersion: 'catalog-v1', task: 'T3', lang: 'kk', metrics: {},
      events: [ev('validation_error', { field: 'budget' }), ev('validation_error', { field: 'texture' }),
        ev('results', { count: 0 }), ev('results', { count: 2 }), ev('select', { id: 'WM-05', elapsedMs: 80000 }), ev('feedback', { value: 2 })]
    };
    const p03 = {
      participant: 'P03', appVersion: 'v1.0', catalogVersion: 'catalog-v1', task: 'T4', lang: 'en', metrics: {},
      events: [ev('validation_error', { field: 'budget' }), ev('results', { count: 0 }), ev('restart', { via: 'leave' })]
    };

    test('analytics on 3 sample logs', () => {
      const r = core.analyseSessions([p01(), p02, p03, { not: 'a log' }]);
      assert.strictEqual(r.rows.length, 3, 'non-log objects are ignored');
      assert.deepStrictEqual(r.rows.map(x => [x.participant, x.completed, x.timeSec, x.noMatch, x.errors, x.lang, x.clarity]), [
        ['P01', true, 3, false, 0, 'en', 4],
        ['P02', true, 80, true, 2, 'kk', 2],
        ['P03', false, null, true, 1, 'en', null]
      ]);
      const s = r.summary;
      assert.strictEqual(s.sessions, 3);
      assert.strictEqual(s.completionRate, 2 / 3);
      assert.strictEqual(s.medianTimeSec, 41.5);
      assert.strictEqual(s.noMatchRate, 2 / 3);
      assert.strictEqual(s.errorsPerSession, 1);
      assert.deepStrictEqual(s.languages, { en: 2, kk: 1 });
      assert.strictEqual(s.meanClarity, 3);
    });
    test('analytics CSV export', () => {
      const csv = core.sessionsToCSV(core.analyseSessions([p02, p03]));
      const lines = csv.split('\r\n');
      assert.strictEqual(lines[0], 'participant,task,completed,time_to_selection_s,saw_no_match,validation_errors,language,clarity');
      assert.strictEqual(lines[1], 'P02,T3,true,80,true,2,kk,2');
      assert.ok(lines.includes('completion_rate,0.5'));
      assert.ok(lines.includes('median_time_to_selection_s,80'));
    });
    test('median of even / odd / empty lists', () => {
      assert.strictEqual(core.median([3, 1, 2]), 2);
      assert.strictEqual(core.median([4, 1, 3, 2]), 2.5);
      assert.strictEqual(core.median([]), null);
      assert.strictEqual(core.analyseSessions([]).summary.completionRate, null);
    });
  });
})(typeof module === 'object' && module.exports ? require('./harness').define : window.WMTest.define,
   typeof module === 'object' && module.exports ? require('./harness').makeClock : window.WMTest.makeClock);
