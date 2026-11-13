(function (define) {
  define('validate.test.js', function ({ test, assert, core }) {
    const ok = { texture: 'light', fragrance: 'free' };
    const budgetErr = b => core.validateAnswers(Object.assign({ budget: b }, ok)).errors.budget;

    test('V01 budget "" -> required', () => assert.strictEqual(budgetErr(''), 'required'));
    test('V02 budget "abc" -> notNumber', () => assert.strictEqual(budgetErr('abc'), 'notNumber'));
    test('V03 budget "0" -> notPositive', () => assert.strictEqual(budgetErr('0'), 'notPositive'));
    test('V04 budget "-5" -> notPositive', () => assert.strictEqual(budgetErr('-5'), 'notPositive'));
    test('V05 budget "12.5" -> notInteger', () => assert.strictEqual(budgetErr('12.5'), 'notInteger'));
    test('V06 budget "1e5" -> notInteger (not parsed as 100000)', () => assert.strictEqual(budgetErr('1e5'), 'notInteger'));
    test('V07 budget " 6000 " -> ok, 6000', () => {
      const r = core.validateAnswers(Object.assign({ budget: ' 6000 ' }, ok));
      assert.strictEqual(r.ok, true);
      assert.strictEqual(r.value.budget, 6000);
    });
    test('V08 budget "6 000" -> ok, 6000 (decision: internal spaces allowed)', () => {
      const r = core.validateAnswers(Object.assign({ budget: '6 000' }, ok));
      assert.strictEqual(r.ok, true);
      assert.strictEqual(r.value.budget, 6000);
      assert.strictEqual(core.validateBudget('1 000 000').value, 1000000, 'no-break spaces too');
    });
    test('V09 budget "2000000" -> tooLarge', () => assert.strictEqual(budgetErr('2000000'), 'tooLarge'));
    test('V10 budget "1000000" -> ok (inclusive)', () => assert.strictEqual(core.validateAnswers(Object.assign({ budget: '1000000' }, ok)).ok, true));
    test('V11 texture missing -> required', () => assert.strictEqual(core.validateAnswers({ budget: '6000', fragrance: 'free' }).errors.texture, 'required'));
    test('V12 texture "gel" -> invalid', () => assert.strictEqual(core.validateAnswers({ budget: '6000', texture: 'gel', fragrance: 'free' }).errors.texture, 'invalid'));
    test('V13 fragrance missing -> required', () => assert.strictEqual(core.validateAnswers({ budget: '6000', texture: 'light' }).errors.fragrance, 'required'));
    test('V14 all three invalid -> all three errors at once', () =>
      assert.deepStrictEqual(core.validateAnswers({ budget: 'abc', texture: 'gel' }).errors, { budget: 'notNumber', texture: 'invalid', fragrance: 'required' }));
    test('V15 valid input -> ok and errors {}', () => {
      const r = core.validateAnswers({ budget: '6000', texture: 'light', fragrance: 'free' });
      assert.strictEqual(r.ok, true);
      assert.deepStrictEqual(r.errors, {});
      assert.deepStrictEqual(r.value, { budget: 6000, texture: 'light', fragrance: 'free', useTime: null, size: null });
    });
    test('soft questions are optional but must be valid if given', () => {
      assert.strictEqual(core.validateAnswers({ budget: '6000', texture: 'light', fragrance: 'free', useTime: null, size: null }).ok, true);
      assert.deepStrictEqual(core.validateAnswers({ budget: '6000', texture: 'light', fragrance: 'free', useTime: 'noon', size: 'huge' }).errors,
        { useTime: 'invalid', size: 'invalid' });
    });
    test('other bad budgets: "+", "--5", "1,000", ".5"', () => {
      assert.strictEqual(core.validateBudget('+').code, 'notNumber');
      assert.strictEqual(core.validateBudget('--5').code, 'notNumber');
      assert.strictEqual(core.validateBudget('1,000').code, 'notNumber');
      assert.strictEqual(core.validateBudget('.5').code, 'notInteger');
    });
  });
})(typeof module === 'object' && module.exports ? require('./harness').define : window.WMTest.define);
