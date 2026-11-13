# WellMatch v1.0

A bilingual (English / Kazakh) prototype that recommends moisturisers from a **fictional** 12-product catalog. The shopper answers five questions:

- **Required (filter):** budget, texture, fragrance. These decide which products can appear.
- **Optional (re-order only):** use time and pack size. These change the order, never which products are eligible.

Each product is shown with a plain "Why:" line and a "Limitation:" line, and every excluded product is listed with the rule that removed it.

- **Static site:** vanilla JavaScript (ES2020). No framework, build step, CDN, fonts, analytics or cookies.
- **Shopper data:** answers and test logs live only in memory and disappear on reload.
- **Deterministic matching:** filter + sort. No randomness, ML or external API.

> ⚠️ **Kazakh review pending.** All Kazakh text is a draft written by a non-native author. That covers `i18n/kk.json` and `limitation.kk` in `data/catalog.v1.json`, including the numeral suffixes such as "1-і" and "2-сі". A native speaker must review it before any Kazakh user test.

---

## Pages

| Page | What it is |
|---|---|
| `index.html` | The shopper app, full page. Footer link → retailer view. |
| `store.html` | Mock retailer category page (fictional "Aqqu Pharmacy", 12 tiles). WellMatch is embedded with **one line** (F17). |
| `admin.html` | Retailer view: edit catalog, import/export, rules, live preview (F16, F21). |
| `analytics.html` | Drop exported session logs → metrics, table, chart, CSV (F19). |
| `tests.html` | The same automated tests, run in the browser (F20). |

## Files

| Path | Purpose |
|---|---|
| `app.js` | **Pure core**, no DOM: `match`, `analyse`, validation, catalog/CSV import, URL hash, state reducer, i18n, log export, session analytics. Runs in Node and in browsers (`window.WellMatchCore`). |
| `wellmatch.js` | **Widget UI.** Mounts full-page, floating (store) or inline (admin preview). Loads `app.js` and the data itself when missing. |
| `styles.css` | Widget styles, all scoped under `.wm`, with `--wm-*` tokens and a print sheet. |
| `pages.css` | Styles for `admin.html`, `analytics.html`, `store.html` and `tests.html`. |
| `admin.js`, `analytics.js` | Retailer view and analytics page logic. |
| `i18n/en.json`, `i18n/kk.json` | Every visible string of the app, admin and analytics pages. The two files have identical key sets. |
| `data/catalog.v1.json` | `catalog-v1`: 12 fictional products. |
| `data/embedded.js` | **Generated** copy of the three JSON files, used under `file://`. Do not edit. |
| `tests/` | `run.js`, `harness.js`, and the `*.test.js` files (matching, validate, i18n, catalog, state, testlog, analytics). |
| `MANUAL_TEST.md`, `CHANGELOG.md` | Manual checklist and change log. |

## Run locally

**From disk:** double-click `index.html`, `store.html` or `admin.html`. Browsers block `fetch()` on `file://`, so the pages then read `data/embedded.js`, a generated copy of the JSON files.

**With a static server** (uses the real JSON files):

```bash
python -m http.server 8000      # then open http://localhost:8000/
```

On http(s) the app fetches `data/catalog.v1.json` and `i18n/*.json` from the same origin. Nothing else is requested.

**After editing any JSON file**, regenerate the `file://` copy:

```bash
node tests/run.js --sync
```

A test fails if `data/embedded.js` and the JSON files ever differ. Another fails if the store tiles drift from the catalog.

## Deploy

The site is the folder as-is. There is no build step.

- **GitHub Pages:** push the folder to the repository root, then go to *Settings → Pages* and set *Deploy from a branch* to `main` / `/ (root)`.
- **Netlify:** drag the folder onto "Deploy manually", or connect the repository with an empty build command and publish directory `.`.

All paths are relative, so the site also works under a sub-path such as `/repo/`.

## Tests

```bash
node tests/run.js          # 119 checks, exit code 1 on failure (Node 16+)
```

Open `tests.html` to run the same files in the browser. Five checks need the file system and show as "Node only" there.

The suite covers the full spec list:

- M01–M18 (matching), V01–V15 (validation), I01–I07 (i18n), C01–C10 (catalog), S01–S16 (state), T01–T06 (test log).
- Shortlist size 1 and 5, soft fragrance mode, `in_stock:false`.
- Soft re-ordering for Q4/Q5, live count boundaries (4137/4138, 4899/4900), why-not reasons, revision diff, history, compare.
- CSV import: missing column, wrong type, duplicate id, BOM, CRLF, quoted commas and line breaks.
- URL-hash round trip and shared links before consent, admin recompute, analytics aggregation on three sample logs, and the timer metrics.

## Matching rules

```js
catalog.filter(p => p.in_stock !== false)                                       // F21
       .filter(p => p.price <= budget)
       .filter(p => p.texture === texture)
       .filter(p => fragrance !== 'free' || rules.fragranceRule === 'soft' || p.fragrance_free === true)
       .sort((a, b) => softFragranceFirst || softScore(b) - softScore(a) || a.price - b.price || a.id.localeCompare(b.id))
       .slice(0, rules.maxResults)                                              // default 3, retailer 1–5
```

- **Soft score** (0–2) = use time suits + pack size matches.
  - Use time: "Day" suits day and both products, "Night" suits night and both, "Day and night" suits only both.
  - Pack size: travel ≤ 30 ml, standard 31–100 ml, large > 100 ml.
  - With no soft answers the order is pure price (then id), exactly as in the spec.
- **Budget:** a whole number from 1 to 1 000 000.
  - **Decision V08:** internal spaces are accepted, so "6 000" → 6000, because that is how the app displays prices.
  - Rejected: empty, `abc`, `0`, negatives, `12.5`, `1e5`, values over 1 000 000 (shown as "too large").

## Embedding in a shop (F17)

```html
<script src="wellmatch.js" data-catalog="data/catalog.v1.json" data-lang="kk"></script>
```

- **On the page:** this adds a floating "Help me choose" button that opens the flow in a panel. The panel is a modal dialog: focus is trapped and Esc closes it.
- **On select:** the widget scrolls to the shop tile with the matching `data-wm-id`, highlights it, and fires a `wellmatch:select` DOM event. "Show it in the shop" closes the panel and focuses the tile.
- **Isolation:** the widget never changes the shop's URL. Its CSS is scoped under `.wm`, and element ids are prefixed per instance.

## Retailer view (F16 / F21)

`admin.html` can:

- edit any field inline;
- add, delete and "Reset to catalog-v1";
- import CSV or JSON and show a validation report (row, field, reason);
- export JSON;
- set the rules: shortlist size 1–5, fragrance rule hard/soft, currency label, catalog version label.

Invalid records stay in the table, marked "Hidden: …", and are **withheld from shoppers** until fixed. The live preview updates immediately, so adding "Test Cream 1 000 KZT, light, fragrance-free" with its two limitation texts puts it first.

CSV columns: `id,name,price,texture,fragrance_free,size_ml,use_time,limitation_en,limitation_kk,fictional`, plus an optional `in_stock` column.

Edits stay in memory. If you tick the clearly labelled checkbox, they are also saved to **sessionStorage for this tab only**, so `index.html` and `store.html` opened in the same tab use them and show a notice. Only catalog and rules are stored, never shopper answers.

## Test-session mode (F9 / F18)

Open `index.html?test=P01`. Only `P01`–`P99` are accepted.

- **Test bar:** shows "Test session P01", a **Task** dropdown (T1–T5), and live metrics (time, validation errors, revisions, language switches).
- **Timer:** starts at the first answer after consent and stops at Select.
- **Download session log** saves `P01_<timestamp>.json` with `participant`, `appVersion`, `catalogVersion`, `startedAt`, `task`, `metrics`, `runs` (one per finished attempt) and `events`.
- **Events:**
  - `task`
  - `consent`
  - `submit` (answers)
  - `validation_error` (field, code, raw value)
  - `results` (count)
  - `lang_switch` (from, to)
  - `select` (id, rank, elapsedMs)
  - `feedback` (value)
  - `restart` (via restart or leave)
- **Retention:** nothing is sent anywhere. The log survives "Start again" within the tab and **is lost on reload, so download it before closing the tab.**

Drop the downloaded files on `analytics.html` to get completion rate, median time to selection, no-match rate, errors per session, languages and mean clarity, plus a CSV export.

## Other features

| Feature | Where |
|---|---|
| F12 live match counter | S1, under the form, 150 ms debounce |
| F13 "Why not the others?" | S2 / S2b expander: every excluded product with every rule (stock, price, texture, fragrance, "ranked 4; only the top 3 are shown") |
| F14 revision diff + history | Banner after a changed resubmit; "Previous answers" (max 10), click to restore |
| F15 reproducible URL | `#s2?b=6000&t=light&f=free&u=day&p=travel&lang=kk`. Opening it shows S0 (consent), then the identical result. Browser Back/Forward replays earlier answer sets. A plain reload still lands on S0 (B10). |
| F22 compare two | "Compare" checkbox per card; two → side-by-side table with differing rows marked "differs"; a third is disabled |
| F23 shortcuts and print | Alt+L toggles language (uses the physical L key, so it also works on a Kazakh layout); Esc closes dialogs and the panel; Ctrl+P on S2 prints a one-page sheet with the steps and versions |

## URL options for demonstrations

| URL | Effect |
|---|---|
| `?lang=kk` | Start in Kazakh |
| `?demo=incomplete` | Adds record WM-99, which is missing `limitation.kk`. It is withheld, and the notice "1 product hidden: incomplete data" appears (F11). |
| `?demo=missingkey` | Removes `btn.back` from Kazakh. The button falls back to English and the console warns once (F7). |

## Known limitations and deviations

- **Kazakh is a draft** (see above). Product names are not translated.
- **Catalog grew to 12 products** at the user's request, so C01 is "12 products" and counts read "n of 12". New prices were chosen so that every M01–M18 expectation from the spec still holds against the shipped catalog. WM-11 costs 4 138 KZT so the F12 example (4137 → 4138) is visible. WM-12 is out of stock (F21).
- **Q4/Q5 are optional.** They have a "No preference" option selected by default, because "soft" questions never exclude products.
- **"Light scent is OK" and "Doesn't matter" behave identically**, as the spec's rule says. Only "Fragrance-free" filters, or in soft mode only re-orders.
- **`t()` falls back** to English and then to the key itself, with exactly one `console.warn`, per I05. Tests guarantee no key is missing.
- **English-only pages:** `tests.html` (developer tool) and `store.html` (stands in for a third-party shop page) are English only. All WellMatch-owned UI goes through i18n.
- **Data marks colour:** the spec's `--muted #6B7785` is only about 4.0:1 on the background, so small text uses `#56616E`. The analytics bars use `#2F78B5`, which passes the chart palette checks; the accent `#2F6F8F` fails the chroma floor for data marks.
- **Browser coverage:** verified in headless Chrome (desktop and 320 px, keyboard, contrast, reduced motion, print emulation, file:// and http). **Not yet tested** in Firefox, Safari, real phones, at 200% zoom, or with real screen readers. See `MANUAL_TEST.md`.
