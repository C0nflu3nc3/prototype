/*
 * Tiny test harness shared by Node (tests/run.js) and the browser (tests.html).
 * Test files call WMTest.define(name, fn); fn receives { test, assert, core, data, env }.
 * test.node(...) marks a case that needs the file system (skipped in the browser).
 */
(function (root) {
  'use strict';
  const files = [];

  function define(name, fn) { files.push({ name, fn }); }

  function show(v) {
    try { return JSON.stringify(v); } catch (e) { return String(v); }
  }
  function deepEqual(a, b) {
    if (Object.is(a, b)) return true;
    if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
    if (Array.isArray(a) !== Array.isArray(b)) return false;
    const ka = Object.keys(a);
    const kb = Object.keys(b);
    if (ka.length !== kb.length) return false;
    return ka.every(k => Object.prototype.hasOwnProperty.call(b, k) && deepEqual(a[k], b[k]));
  }
  const fail = (msg, detail) => { throw new Error((msg ? msg + ' — ' : '') + detail); };
  const assert = {
    ok(v, msg) { if (!v) fail(msg, 'expected a truthy value, got ' + show(v)); },
    strictEqual(a, b, msg) { if (!Object.is(a, b)) fail(msg, 'expected ' + show(b) + ', got ' + show(a)); },
    notStrictEqual(a, b, msg) { if (Object.is(a, b)) fail(msg, 'did not expect ' + show(a)); },
    deepStrictEqual(a, b, msg) { if (!deepEqual(a, b)) fail(msg, 'expected ' + show(b) + ', got ' + show(a)); },
    match(s, re, msg) { if (!re.test(s)) fail(msg, show(s) + ' does not match ' + re); },
    throws(fn, msg) { let threw = false; try { fn(); } catch (e) { threw = true; } if (!threw) fail(msg, 'expected an exception'); }
  };

  /** Run every defined file. env = { core, data, node, read?, embeddedSource? } */
  function runAll(env) {
    const results = [];
    for (const f of files) {
      const cases = [];
      const test = (name, fn) => cases.push({ name, fn, nodeOnly: false });
      test.node = (name, fn) => cases.push({ name, fn, nodeOnly: true });
      try {
        f.fn({ test, assert, core: env.core, data: env.data, env });
      } catch (e) {
        results.push({ file: f.name, name: '(file setup)', status: 'fail', message: e.message });
        continue;
      }
      for (const c of cases) {
        if (c.nodeOnly && !env.node) { results.push({ file: f.name, name: c.name, status: 'skip' }); continue; }
        try {
          c.fn();
          results.push({ file: f.name, name: c.name, status: 'pass' });
        } catch (e) {
          results.push({ file: f.name, name: c.name, status: 'fail', message: e.message });
        }
      }
    }
    return results;
  }

  /** Deterministic clock for reducer tests: +1 s per call. */
  function makeClock(startIso) {
    let ms = Date.parse(startIso || '2026-11-13T10:00:00.000Z');
    return () => new Date((ms += 1000)).toISOString();
  }

  const api = { define, runAll, assert, files, deepEqual, makeClock };
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  if (root) root.WMTest = api;
})(typeof window !== 'undefined' ? window : null);
