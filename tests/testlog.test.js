(function (define, makeClock) {
  define('testlog.test.js', function ({ test, assert, core, data, env }) {
    const catalog = core.loadCatalog(data.catalog).products;
    const answer = a => Object.keys(a).map(field => ({ type: 'SET_ANSWER', field, value: a[field] }));

    function session(id) {
      const c = { catalog, now: makeClock() };
      const actions = [
        { type: 'SET_TASK', task: 'T2' },
        { type: 'SET_CONSENT', value: true }, { type: 'START' },
        { type: 'SUBMIT' },
        ...answer({ budget: '6000', texture: 'light', fragrance: 'free' }), { type: 'SUBMIT' },
        { type: 'SET_LANG', lang: 'kk' },
        { type: 'SELECT', id: 'WM-02' },
        { type: 'FEEDBACK', value: 4 }
      ];
      let s = core.createInitialState({ test: id, now: c.now });
      for (const a of actions) s = core.reduce(s, a, c);
      return { s, c };
    }

    test('T01 ?test=P01 -> "P01"; empty or absent -> null', () => {
      assert.strictEqual(core.parseTestId('?test=P01'), 'P01');
      assert.strictEqual(core.parseTestId('?test='), null);
      assert.strictEqual(core.parseTestId(''), null);
      assert.strictEqual(core.createInitialState({ test: core.parseTestId('?test=P01') }).test, 'P01');
    });
    test('T02 only /^P\\d{2}$/ accepted', () => {
      for (const bad of ['?test=<script>', '?test=P1', '?test=P001', '?test=p01', '?test=X01']) assert.strictEqual(core.parseTestId(bad), null, bad);
    });
    test('T03 events appended in order with their details', () => {
      const { s, c } = session('P01');
      const s2 = core.reduce(s, { type: 'RESTART' }, c);
      assert.deepStrictEqual(s2.log.map(e => e.event), ['task', 'consent', 'submit', 'validation_error', 'validation_error', 'validation_error',
        'submit', 'results', 'lang_switch', 'select', 'feedback', 'restart']);
      const ev = name => s2.log.filter(e => e.event === name);
      assert.deepStrictEqual(ev('validation_error').map(e => e.detail.field), ['budget', 'texture', 'fragrance']);
      assert.strictEqual(ev('results')[0].detail.count, 2);
      assert.deepStrictEqual([ev('lang_switch')[0].detail.from, ev('lang_switch')[0].detail.to], ['en', 'kk']);
      assert.strictEqual(ev('select')[0].detail.id, 'WM-02');
      assert.strictEqual(ev('feedback')[0].detail.value, 4);
    });
    test('T03b without a test id the log is still kept in memory (end-of-session download), participant "anonymous"', () => {
      const c = { catalog, now: makeClock() };
      let s = core.createInitialState();
      for (const a of [{ type: 'SET_CONSENT', value: true }, { type: 'START' }, { type: 'SUBMIT' }]) s = core.reduce(s, a, c);
      assert.deepStrictEqual(s.log.map(e => e.event), ['consent', 'submit', 'validation_error', 'validation_error', 'validation_error']);
      assert.strictEqual(JSON.parse(core.exportLog(s)).participant, 'anonymous');
      assert.strictEqual(core.createInitialState().test, null, 'no test badge without ?test');
    });
    test('T04 every event has an ISO timestamp and a screen', () => {
      for (const e of session('P01').s.log) {
        assert.match(e.t, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
        assert.ok(core.SCREENS.includes(e.screen), e.screen);
      }
    });
    test('T05 exportLog() shape; no data beyond the answer values', () => {
      const { s } = session('P05');
      const j = JSON.parse(core.exportLog(s, { now: '2026-11-13T10:01:00.000Z' }));
      assert.strictEqual(j.participant, 'P05');
      assert.strictEqual(j.appVersion, 'v1.1');
      assert.strictEqual(j.catalogVersion, 'catalog-v1');
      assert.ok(j.startedAt && Array.isArray(j.events));
      const allowed = new Set(['given', 'valid', 'budget', 'texture', 'fragrance', 'useTime', 'size', 'revision', 'field', 'code', 'value',
        'count', 'eligible', 'from', 'to', 'id', 'rank', 'elapsedMs', 'via', 'task',
        'clarity', 'ease', 'confidence', 'wouldUse', 'commentLength']); // comment TEXT is never in events, only in `feedback`
      const extra = j.events.flatMap(e => Object.keys(e.detail)).filter(k => !allowed.has(k));
      assert.deepStrictEqual(extra, []);
      assert.deepStrictEqual(Object.keys(j.events[0]).sort(), ['detail', 'event', 'screen', 't']);
    });
    test.node('T06 nothing is persisted: no storage/cookies in the core or for logs', () => {
      const coreSrc = env.read('app.js');
      assert.ok(!/localStorage|sessionStorage|document\.cookie|indexedDB/.test(coreSrc), 'app.js uses storage');
      const ui = env.read('wellmatch.js');
      assert.ok(!/localStorage|document\.cookie|indexedDB/.test(ui), 'wellmatch.js uses persistent storage');
      const ss = ui.match(/sessionStorage\.\w+/g) || [];
      assert.ok(ss.every(x => x === 'sessionStorage.getItem'), 'widget may only READ the retailer catalog override');
      assert.deepStrictEqual(core.createInitialState({ test: 'P01' }).log, []);
    });
    test('F18 timer: starts at first answer after consent, stops at Select; counters', () => {
      const { s } = session('P01');
      const m = core.summarizeMetrics(s.metrics, Date.parse('2030-01-01T00:00:00Z'));
      const select = s.log.find(e => e.event === 'select');
      assert.strictEqual(m.completed, true);
      assert.strictEqual(m.elapsedSeconds * 1000, select.detail.elapsedMs, 'stopped at Select, not "now"');
      assert.strictEqual(select.detail.elapsedMs, 4000, 'clock ticks: submit, results, lang_switch, select');
      assert.deepStrictEqual([m.validationErrors, m.revisions, m.langSwitches], [3, 0, 1]);
      assert.strictEqual(s.task, 'T2');
    });
    test('F18 export includes metrics, task and finished runs', () => {
      const { s, c } = session('P01');
      const r = core.reduce(s, { type: 'RESTART' }, c);
      const j = JSON.parse(core.exportLog(r));
      assert.strictEqual(j.task, 'T2');
      assert.strictEqual(j.runs.length, 1);
      assert.strictEqual(j.runs[0].completed, true);
      assert.strictEqual(j.runs[0].task, 'T2');
      assert.ok('metrics' in j);
    });
  });
})(typeof module === 'object' && module.exports ? require('./harness').define : window.WMTest.define,
   typeof module === 'object' && module.exports ? require('./harness').makeClock : window.WMTest.makeClock);
