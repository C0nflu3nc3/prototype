# Changelog

From v1.1 on, every change must link to evidence from the user tests: a participant ID, a logged event, or an observation.

## v1.1 — evidence-linked changes (not started)

### C1
- **Evidence:** _participant ID(s) + log event / quote, e.g. "P02, P04: `validation_error` budget `notNumber` value `6.000`"_
- **Problem:** _…_
- **Change:** _…_
- **Files:** _…_
- **Test / check added:** _…_

### C2
- **Evidence:** _…_
- **Problem:** _…_
- **Change:** _…_
- **Files:** _…_
- **Test / check added:** _…_

### C3
- **Evidence:** _…_
- **Problem:** _…_
- **Change:** _…_
- **Files:** _…_
- **Test / check added:** _…_

## v1.0 — frozen assessment build (2026-11-13)

**Shopper app**
- Screens S0 consent → S1 five questions → S2 results / S2b no-match → S3 selected. They are driven by a pure reducer with hash routing and guards.
- Questions:
  - **Required:** budget, texture, fragrance.
  - **Optional, re-order only:** use time (day / night / both) and pack size (travel ≤ 30 ml / standard / large).
- Deterministic matching:
  - in-stock, price, texture and fragrance filters;
  - sorted by soft score, then price, then id;
  - shortlist size set by the retailer (1–5, default 3);
  - fragrance rule hard or soft.
- Results:
  - a "Why:" line from met criteria and a "Limitation:" line from the catalog plus soft mismatches;
  - "Show how this was chosen" and "Why not the others?" expanders;
  - a revision banner and history of the last 10 answer sets;
  - compare two products side by side.
- Live match counter (F12), shareable result URL (F15), Alt+L language toggle, print sheet.
- EN | KZ on every screen and inside the dialog. Kazakh plural forms and numeral suffixes. English fallback with one console warning per missing key.
- Accessibility:
  - logical Tab order and a 2 px focus ring;
  - labels on every input, plus `aria-invalid` and `aria-describedby` on errors;
  - a live region for the result count;
  - text contrast at least 4.5:1 and targets at least 44 px;
  - no horizontal scroll at 320 px, and reduced motion respected.

- End-of-session feedback form (all optional):
  - three 1–5 scales: clarity, ease, confidence;
  - "would use in a real shop?";
  - a comment of up to 500 characters.
- **Download session (JSON)** for every user on the final screen. The log is in memory only; outside test mode the file is labelled `participant: "anonymous"`.

**Integration and tools**
- `wellmatch.js` widget: full-page, floating (one-line embed in `store.html`, which scrolls to and highlights the shop tile), and inline (admin preview).
- Retailer view `admin.html`:
  - inline edit, add, delete and reset;
  - CSV/JSON import with a validation report, and JSON export;
  - matching rules;
  - an in-stock toggle and live preview;
  - optional sessionStorage for this tab only.
- Test-session mode `?test=P01` (P01–P99):
  - in-memory event log;
  - task dropdown T1–T5;
  - timer from first answer to Select, plus error, revision and language-switch counters;
  - JSON download.
- `analytics.html`: aggregates session logs (completion rate, median time, no-match rate, errors, language, clarity), with a table, SVG chart and CSV export.
- `tests.html`: the same test files run in the browser.

**Data and tests**
- `catalog-v1`: 12 fictional products with `use_time` and `in_stock`. Kazakh text is a draft pending native review.
- Catalog integrity check on load. Incomplete or duplicate records are withheld and reported.
- `node tests/run.js`: 124 checks across matching, validate, i18n, catalog, state, testlog, feedback and analytics.
