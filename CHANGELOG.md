# Changelog

From v1.1 on, every change must link to evidence from the user tests: a participant ID, a logged event, or an observation.

## v1.1 — evidence-linked changes (2026-11-16)

Source: five user-test runs on v1.0, 15 Nov 2026 (session logs `session_20261115T181317Z` … `182018Z`). Three of five participants asked for features that already existed, so each change makes an existing feature visible. No matching rule changed.

### C1 — language choice on the start screen
- **Evidence:** P04 commented that Kazakh would be easier and asked for a translation; the log has no `lang_switch` event.
- **Problem:** the `EN | KZ` header switch was not recognised as a language control.
- **Change:** the start screen opens with a "Choose your language · Тілді таңдаңыз" block with two full-name buttons; the header and dialog switches now read `English | Қазақша` instead of `EN | KZ`.
- **Files:** `wellmatch.js` (`screenConsent`), `i18n/en.json`, `i18n/kk.json` (`lang.en`, `lang.kk`, `lang.choose`), `styles.css`.
- **Test / check added:** `I04b` (strings in both languages); browser replay at 900 px and 320 px, no horizontal scroll.

### C2 — exclusion reasons visible; "Adjust answers" on no-match
- **Evidence:** P05 asked for a button showing why other products did not fit; P02 found a single result strange; P03 reached the no-match screen and chose "Leave" after about 7 s. None opened "Why not the others?".
- **Problem:** the exclusion list sat collapsed below the comparison and history blocks; on the no-match screen "Leave" had the same weight as "Change answers".
- **Change:** the expander is renamed "Why weren't other products shown? (n)", outlined, moved directly under the product cards, and opens by itself when 0 or 1 product is eligible (`core.whyNotAutoOpen`). On the no-match screen the primary action is "Adjust answers", placed above the list; "Leave" becomes a text link below.
- **Files:** `app.js` (`whyNotAutoOpen`), `wellmatch.js` (`details`, `whyNotExpander`, `screenResults`, `screenNoMatch`), `i18n/*.json` (`whynot.title`, `btn.adjust`), `styles.css`.
- **Test / check added:** `I04c` (auto-open rule for 0, 1, 2 eligible); browser replay of the P02 and P03 answer sets.

### C3 — compare prompt and counter
- **Evidence:** P01 commented that a way to compare products was missing; the "Compare" checkboxes were on screen but were not noticed (observer note).
- **Problem:** the "Compare" checkboxes were not noticed and the hint appeared only below the cards.
- **Change:** a "Compare two products." prompt with a live "n of 2 selected" counter sits above the cards whenever two or more products are shown.
- **Files:** `wellmatch.js` (`comparePrompt`, `compareBlock`, `screenResults`), `i18n/*.json` (`compare.prompt`, `compare.count`), `styles.css`.
- **Test / check added:** `I04b` (counter string); browser replay of the P01 answer set: counter 0 → 1 → 2 and the side-by-side table appears.

**Verification:** `node tests/run.js` → 126 passed, 0 failed. Participant retests of the same tasks are entered in the Evidence Portfolio (Table 7) as they are run.

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
