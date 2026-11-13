# WellMatch v1.0 — manual test checklist (spec 5.7)

**Before starting**, run `node tests/run.js` (all must pass) and open `tests.html` (0 failed). Fill in one row per item, with the date, browser and device, tester, and the result: ✓, ✗, or a note.

Use a fresh tab for each journey, because a reload resets the app.

## Journeys

| # | Steps | Expected | Date | Browser / device | Tester | Result |
|---|---|---|---|---|---|---|
| J01 | EN, mouse, desktop Chrome: tick the consent box → Start → `6000`, Light / gel, Fragrance-free → Show options → Select Aqua Light Gel | S2 shows "2 of 12 products match" with **Aqua Light Gel 4 900 KZT** then **Daily Calm Lotion 5 800 KZT**. S3 says "You selected Aqua Light Gel". | | | | |
| J02 | KZ, touch, phone Safari or Chrome: open `index.html?lang=kk` and complete `9000` / Жеңіл / гель / Маңызды емес | You reach S3. S2 shows "12 өнімнің 5-і сәйкес келеді, ең жоғарғы 3 өнім". There are no English leaks except product names and "KZT". | | | | |
| J03 | EN keyboard only (Tab, Shift+Tab, Enter, Space; no mouse) through to S3 and "Start again" | Every control is reachable in logical order. Enter or Space toggles consent. The arrow keys work inside the option groups. Focus moves to the heading on each new screen. | | | | |
| J04 | Start in EN, type budget `7000` on S1, then click KZ | You stay on S1 and `7000` is still in the field (focus stays on KZ). The live counter is in Kazakh. | | | | |
| J05 | Reach S2 (`9000` / light / any), then switch to KZ | The same cards in the same order. Every label is Kazakh. The hash ends with `lang=kk`. | | | | |
| J06 | On S0 or S2 open "What this is not", then press EN/KZ inside the dialog | The dialog text changes language, focus stays on the pressed button, and Esc closes the dialog and returns focus to the link. | | | | |

## Boundary and failure

| # | Steps | Expected | Date | Browser | Tester | Result |
|---|---|---|---|---|---|---|
| B01 | Submit the empty form | Three errors appear (budget, texture, fragrance). Focus is in the budget field and you stay on S1. | | | | |
| B02 | Budget `abc` with texture and fragrance chosen | Only the budget error shows. The other choices keep their values. | | | | |
| B03 | `2000` / Rich / balm / Fragrance-free | The amber no-match panel shows "2 000 KZT", "Rich / balm" and "Fragrance-free" in the current language. | | | | |
| B04 | From the no-match screen, choose **Change answers** | S1 still shows `2000`, Rich and Fragrance-free. | | | | |
| B05 | From the no-match screen, choose **Leave** | S0 with the box unticked. After you start again, the budget is empty. | | | | |
| B06 | **On a local server:** in `data/catalog.v1.json`, change WM-03 to `"price": "8900"`, then reload. (For file:// also run `node tests/run.js --sync`.) Revert afterwards. | The notice reads "1 product hidden: incomplete data". WM-03 never appears, even for `9000` / rich / free. C03 passes. Alternatively use `index.html?demo=incomplete`. | | | | |
| B07 | Remove one key from `kk.json` (or open `?lang=kk&demo=missingkey`) | The English text shows (for example "Back"), and the console warns **once**. | | | | |
| B08 | On S2 press browser Back, then Forward | Back shows S1 with the answers kept. Forward shows S2 with the same results. | | | | |
| B09 | Type `#s3` in the URL with no selection | You land on S0. | | | | |
| B10 | Reload while on S2 | You land on S0 because state is not persisted, which is intended. After ticking consent and pressing Start, the **same** results appear (F15 link). | | | | |

## Accessibility

| # | Check | Expected | Date | Browser | Tester | Result |
|---|---|---|---|---|---|---|
| A01 | Tab through every screen, the dialog, the store panel and the admin page | A visible 2 px blue focus ring on every control. | | | | |
| A02 | Screen reader (NVDA + Firefox/Chrome, or VoiceOver + Safari): submit valid answers | It announces the heading and "2 of 12 products match", plus the revision text after a change. | | | | |
| A03 | Screen reader: submit with an invalid budget | When focus lands on the field, the label, hint **and error** are read. | | | | |
| A04 | Contrast of ink, muted, reason, warn and error text on their backgrounds | Each is at least 4.5:1. Headless check: all pass. Text uses `#56616E`, not `#6B7785`. | | | | |
| A05 | 320 px viewport (DevTools), every screen in both languages, including the compare table | No horizontal page scroll (the table scrolls inside its box), and buttons are at least 44 px tall. | | | | |
| A06 | 200% browser zoom, desktop | All text is visible and nothing is clipped. Not yet tested. | | | | |
| A07 | OS "reduce motion" on | No transitions, and the store scroll jumps instead of animating. | | | | |

## Test-session mode

| # | Steps | Expected | Date | Browser | Tester | Result |
|---|---|---|---|---|---|---|
| X01 | Open `index.html?test=P01` | The "Test session P01" badge, Task dropdown, metrics and **Download session log** button appear. `?test=<script>` shows no badge. | | | | |
| X02 | Choose task T1 and run B01, B02 and B03, then download | `P01_<timestamp>.json` contains `task`, `validation_error` (with field), `submit`, `results` with `count: 0`, and the metrics. Dropping it on `analytics.html` shows a "Saw no-match" value of Yes. | | | | |
| X03 | Open `index.html` without `?test` | No badge, no button and no logging. | | | | |
| X04 | In test mode, answer, wait, then Select | The timer runs from the first answer and **stops** at Select. | | | | |

## Integration and retailer (F16, F17, F21)

| # | Steps | Expected | Date | Browser | Tester | Result |
|---|---|---|---|---|---|---|
| R-S1 | Open `store.html` and click "Таңдауға көмектесіңіз". Choose `9000` / Жеңіл / гель / Маңызды емес / Түнде, then Select Overnight Gel Mask. | The panel opens in Kazakh and the shop URL does not change. The store scrolls to the Overnight Gel Mask tile and highlights it. "Show it in the shop" focuses the tile, and Esc returns focus to the launcher. | | | | |
| R-A1 | Open `admin.html`, click **Add product**, and fill name "Test Cream", both limitations | The status goes from "Hidden: limitation.en, limitation.kk" to "Shown to shoppers". In the preview, `6000` / light / free shows Test Cream **first**. | | | | |
| R-A2 | Untick **In stock** for WM-02 | WM-02 leaves the preview, and why-not shows "currently unavailable". | | | | |
| R-A3 | Set the shortlist size to 1, then 5. Set the fragrance rule to Soft. | The preview shows 1 or 5 cards. In Soft mode scented products appear after fragrance-free ones, with "contains fragrance (you asked for fragrance-free)". | | | | |
| R-A4 | Import a CSV with one good row, one wrong-type row and one duplicate id (with BOM and CRLF) | "loaded 1, rejected 2", and the report lists row / field / reason. | | | | |
| R-A5 | **Export catalog**, then re-import the file | Same records. | | | | |

## Release

| # | Check | Expected | Date | Browser | Tester | Result |
|---|---|---|---|---|---|---|
| R01 | Footer on every screen | It shows "App v1.0 · catalog-v1" and the fictional-data notice. | | | | |
| R02 | Double-click `index.html` (file://) **and** open the hosted URL | Both work identically. | | | | |
| R03 | Open on a second device and in a second browser | Both work. | | | | |
| R04 | Backup screen recording (EN + KZ + one boundary case, at most 3 min) | It is saved and plays. | | | | |
| R05 | Open `tests.html` live | It shows "… passed, 0 failed". | | | | |

Overall: ☐ pass ☐ pass with notes ☐ fail  Notes: ____________________________________
