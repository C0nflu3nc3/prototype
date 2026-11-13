(function (define, makeClock) {
  define('feedback.test.js', function ({ test, assert, core, data }) {
    const catalog = core.loadCatalog(data.catalog).products;
    const toS3 = (testId) => {
      const c = { catalog, now: makeClock() };
      let s = core.createInitialState({ test: testId || null, now: c.now });
      const steps = [{ type: 'SET_CONSENT', value: true }, { type: 'START' },
        { type: 'SET_ANSWER', field: 'budget', value: '6000' }, { type: 'SET_ANSWER', field: 'texture', value: 'light' },
        { type: 'SET_ANSWER', field: 'fragrance', value: 'free' }, { type: 'SUBMIT' }, { type: 'SELECT', id: 'WM-02' }];
      for (const a of steps) s = core.reduce(s, a, c);
      return { s, c, run: (st, actions) => actions.reduce((x, a) => core.reduce(x, a, c), st) };
    };
    const fill = f => Object.keys(f).map(field => ({ type: 'SET_FEEDBACK_FIELD', field, value: f[field] }));
    const FULL = { clarity: 4, ease: 5, confidence: 3, wouldUse: 'yes', comment: '  Clear, but I wanted SPF.  ' };

    test('validateFeedback: all optional, at least one answer, ranges, comment length', () => {
      assert.deepStrictEqual(core.validateFeedback({}).errors, { form: 'empty' });
      assert.deepStrictEqual(core.validateFeedback({ comment: '   ' }).errors, { form: 'empty' }, 'whitespace-only comment counts as empty');
      assert.deepStrictEqual(core.validateFeedback({ clarity: 2 }).value, { clarity: 2, ease: null, confidence: null, wouldUse: null, comment: null });
      assert.deepStrictEqual(core.validateFeedback({ clarity: 7, ease: 0, confidence: 2.5, wouldUse: 'maybe' }).errors,
        { clarity: 'invalid', ease: 'invalid', confidence: 'invalid', wouldUse: 'invalid' });
      assert.strictEqual(core.validateFeedback({ comment: 'x'.repeat(501) }).errors.comment, 'tooLong');
      assert.strictEqual(core.validateFeedback({ comment: 'x'.repeat(500) }).ok, true);
      assert.strictEqual(core.validateFeedback(FULL).value.comment, 'Clear, but I wanted SPF.', 'comment is trimmed');
    });
    test('SUBMIT_FEEDBACK empty -> error, nothing saved; valid -> saved, clarity mirrored, event logged without comment text', () => {
      const { s, run } = toS3('P07');
      const empty = run(s, [{ type: 'SUBMIT_FEEDBACK' }]);
      assert.deepStrictEqual(empty.feedbackErrors, { form: 'empty' });
      assert.strictEqual(empty.feedbackForm, null);
      const saved = run(s, fill(FULL).concat([{ type: 'SUBMIT_FEEDBACK' }]));
      assert.deepStrictEqual(saved.feedbackForm, { clarity: 4, ease: 5, confidence: 3, wouldUse: 'yes', comment: 'Clear, but I wanted SPF.' });
      assert.strictEqual(saved.feedback, 4);
      const ev = saved.log.filter(e => e.event === 'feedback_form');
      assert.strictEqual(ev.length, 1);
      assert.deepStrictEqual(ev[0].detail, { id: 'WM-02', clarity: 4, ease: 5, confidence: 3, wouldUse: 'yes', commentLength: 24 });
    });
    test('feedback fields only on S3; draft survives a language switch; new selection resets the form', () => {
      const { s, run } = toS3();
      const atS1 = core.createInitialState();
      assert.strictEqual(core.reduce(atS1, { type: 'SET_FEEDBACK_FIELD', field: 'ease', value: 3 }, {}), atS1);
      assert.strictEqual(core.reduce(s, { type: 'SET_FEEDBACK_FIELD', field: 'name', value: 'x' }, {}), s, 'unknown field ignored');
      const kk = run(s, fill({ ease: 2, comment: 'жақсы' }).concat([{ type: 'SET_LANG', lang: 'kk' }]));
      assert.deepStrictEqual(kk.feedbackDraft, { ease: 2, comment: 'жақсы' });
      const again = run(kk, [{ type: 'NAVIGATE', screen: 's2' }, { type: 'SELECT', id: 'WM-05' }]);
      assert.deepStrictEqual([again.feedbackDraft, again.feedbackForm], [null, null]);
    });
    test('download for everyone: export has participant "anonymous", the saved form and the comment text', () => {
      const { s, run } = toS3();
      const saved = run(s, fill(FULL).concat([{ type: 'SUBMIT_FEEDBACK' }]));
      const j = JSON.parse(core.exportLog(saved));
      assert.strictEqual(j.participant, 'anonymous');
      assert.strictEqual(j.feedback.comment, 'Clear, but I wanted SPF.');
      assert.ok(j.events.some(e => e.event === 'select') && j.events.some(e => e.event === 'feedback_form'));
      const restarted = run(saved, [{ type: 'RESTART' }]);
      const j2 = JSON.parse(core.exportLog(restarted));
      assert.strictEqual(j2.feedback, null, 'current form cleared after Start again');
      assert.strictEqual(j2.runs[0].feedback.wouldUse, 'yes', 'finished run keeps its feedback');
    });
    test('analytics aggregates ease, confidence, would-use and comments', () => {
      const a = toS3('P01');
      const s1 = a.run(a.s, fill(FULL).concat([{ type: 'SUBMIT_FEEDBACK' }]));
      const b = toS3('P02');
      const s2 = b.run(b.s, fill({ clarity: 2, ease: 3, wouldUse: 'no' }).concat([{ type: 'SUBMIT_FEEDBACK' }, { type: 'RESTART' }]));
      const c = toS3();
      const s3 = c.run(c.s, fill({ comment: 'Fine' }).concat([{ type: 'SUBMIT_FEEDBACK' }]));
      const res = core.analyseSessions([s1, s2, s3].map(s => JSON.parse(core.exportLog(s))));
      assert.deepStrictEqual(res.rows.map(r => [r.participant, r.clarity, r.ease, r.confidence, r.wouldUse, r.comments]), [
        ['P01', 4, 5, 3, 'yes', ['Clear, but I wanted SPF.']],
        ['P02', 2, 3, null, 'no', []],
        ['anonymous', null, null, null, null, ['Fine']]
      ]);
      const sum = res.summary;
      assert.deepStrictEqual([sum.meanClarity, sum.meanEase, sum.meanConfidence, sum.wouldUseYesRate, sum.comments], [3, 4, 3, 0.5, 2]);
      const csv = core.sessionsToCSV(res).split('\r\n');
      assert.strictEqual(csv[1], 'P01,,true,3,false,0,en,4,5,3,yes,"Clear, but I wanted SPF."');
      assert.ok(csv.includes('would_use_yes_rate,0.5'));
    });
  });
})(typeof module === 'object' && module.exports ? require('./harness').define : window.WMTest.define,
   typeof module === 'object' && module.exports ? require('./harness').makeClock : window.WMTest.makeClock);
