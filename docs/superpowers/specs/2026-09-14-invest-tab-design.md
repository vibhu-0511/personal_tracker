# Forge: Invest tab (Learn · Research · Watchlist)

## Context
The user wants to start investing in Indian markets and learn trading, with a new tab in their personal tracker **Forge** (`C:\Users\vibha\Downloads\data\forge`, Vite + React 18, localforage, Vercel functions in `api/`). The tab does three things: a learning path, guidance on which stocks, mutual funds and IPOs are worth researching, and a watchlist.

Decisions already made with the user:
- **Market:** India only.
- **Style:** invest first, trade later.
- **Data:** no signups. Mutual fund NAVs come from mfapi.in (browser fetch). Stock prices come from Yahoo `.NS`/`.BO` through one small Forge function. IPOs are entered by hand.
- **Placement:** a new 6th tab.

**Compliance:** the app gives no buy or sell picks and no signals. The Research view teaches *how* to evaluate (checklists, thresholds, tools), and the tab shows a "educational, not SEBI-registered advice" line. Price views show facts only (price, % change, 52-week range).

## Design

### 1. Tab shell
- **`src/App.jsx`:** import `Invest`, add `{ id: 'Invest', icon: '📈', label: 'Invest' }` to `TABS` after Money, and add the render line `{tab === 'Invest' && <Invest />}`.
- **New `src/tabs/Invest.jsx`:** local `view` state (`'learn' | 'research' | 'watch'`) with a segmented button row, the same approach as `Expenses.jsx:81`. It reuses the existing `card`, `btn`, `h3`, `meta` classes and shows the disclaimer line at the top.

### 2. Learn (move the existing course into Forge)
- **New `src/invest/course.js`:** `PHASES`, `CONTENT`, `QUIZZES`, `TASKS`, `GLOSSARY` moved from `personal/trading_tutor.html:171-652`.
  - `CONTENT` stays as static HTML strings, rendered with `dangerouslySetInnerHTML`. It's content I write myself, never user input.
- **Rendering:** the module list with sequential unlock, then module body, practice-task checkboxes, and the quiz (80% to pass) at the bottom. Same rules as the original (`isUnlocked`, `grade`, `markDone`), rewritten as React state.
- **Content updates from research:**
  - Replace the F&O loss figure "89%" with SEBI's latest study: 87.7% of individual traders lost money in FY26 (published Aug 2026).
  - Tax: STCG 20% and LTCG 12.5% above ₹1.25L are already current. Add one line: the new Income Tax Act 2025 renumbered the sections, but rates are unchanged.
- **3 new modules in PH2 · Investing**, each with a quiz and tasks:
  - **Choosing Mutual Funds:** direct vs regular plans, the new expense ratio breakdown (Apr 2026), rolling returns, tracking difference, overlap above 50%, category and riskometer.
  - **Evaluating IPOs:** reading the RHP, fresh issue vs OFS, anchor lock-ins at 30 and 90 days, the retail lottery and allotment odds, why GMP is unreliable, 2025 SME IPO rules, 2025 listing stats (median listing gain 3.8%).
  - **Portfolio Review & Staying Safe:** a yearly review and rebalancing when allocation drifts more than 5 percentage points; SEBI finfluencer bans; checking SEBI registration; "@valid" UPI handles.
- **Glossary:** a searchable list, as in the original.
- **Resources card:** Zerodha Varsity (suggested order 1→3→11→7→15→9→2→10), the SEBI investor site and Saa₹thi app, NISM V-A and VIII, plus a short books list.

### 3. Research (how to screen, not what to buy)
- **New `src/invest/research.js`:** three checklists, each item with a threshold, why it matters, and where to check it.
  - **Stocks:**
    - Ratios: ROE/ROCE above 15% for 5 years, D/E below 0.5 (not for banks), interest coverage above 3x.
    - Cash and growth: CFO/PAT above 0.8, P/E compared with the sector and the company's own 5-year median.
    - Promoters: holding stable, pledging near 0%.
    - Red flags: auditor resignation, related-party transactions, ASM/GSM lists.
  - **Mutual funds:** direct plan, expense ratio (index below 0.3%, active below 1%), rolling-return consistency, tracking error, manager tenure over 3 years, overlap, exit load.
  - **IPOs:** OFS share, use of proceeds, peer P/E, promoter record, anchor list, subscription by category, SME cautions.
- **Links out:** Screener.in, Tickertape, Trendlyne, Value Research, AMFI, NSE/BSE filings, SEBI offer documents.
- **"Open-source tools" card:** lightweight-charts, casparser, trading-signals, PKScreener (screening ideas), backtesting.py, OpenBB, OpenAlgo sandbox (paper trading). One line each; skip-list noted.
- Each checklist has an "Add to watchlist" shortcut. Nothing else is interactive.

### 4. Watchlist
- **Item shape:** `{ id, type: 'stock'|'mf'|'ipo', name, symbol?, schemeCode?, ipo?: { open, close, priceBand, link }, note, addedAt }`.
- **Stock:** the user types an NSE symbol, which becomes `SYMBOL.NS` (or `.BO`). The list calls `/api/quote?symbols=A.NS,B.NS` and shows price, day % and the 52-week low–high range. A link opens Screener.in.
- **Mutual fund:** search box → `https://api.mfapi.in/mf/search?q=` → pick a scheme → `/mf/{code}/latest` for NAV and date. Called directly from the browser, since mfapi allows CORS.
- **IPO:** manual form (name, open and close dates, price band, NSE/BSE link, note). Upcoming IPOs sort first.
- **Per-item note:** "why I'm watching", edited inline. Delete with a confirm step.
- **Errors:** a failed quote shows "price unavailable" on that row only, and the list still renders.

### 5. Price function
- **New `api/_lib/parseYahooChart.js`**, a pure function:
  - Input: a Yahoo `v8/finance/chart` JSON response.
  - Output: `{ symbol, name, price, prevClose, changePct, high52, low52, currency }`.
  - Throws on a missing `chart.result[0]`.
- **New `api/quote.js`**, following `api/cf.js`:
  - Validates `symbols`: at most 25, each matching `/^[A-Z0-9&-]{1,20}\.(NS|BO)$/` (checked on input because it comes from the browser).
  - Calls `query1.finance.yahoo.com/v8/finance/chart/{sym}?range=1d&interval=1d` with a browser `User-Agent`, all symbols in parallel with `Promise.allSettled`.
  - A module-level 60-second cache per symbol, like `problemsCache`.
  - Returns `{ quotes, errors }`: status 400 for bad input, 200 with partial results otherwise.
  - Comment: `ponytail: Yahoo is unofficial/ToS-grey; swap for Upstox Analytics Token if it breaks`.
- The dev server picks up the new function automatically (`vite.config.js` `apiDevPlugin`). No new npm dependencies.

### 6. Storage (`src/store.js`, existing get/save pattern)
- `getInvestProgress` / `saveInvestProgress`: `{ done, quiz, tasks, current }`.
- `getWatchlist` / `saveWatchlist`: array.

### 7. Styles (`src/styles.css`)
- Add classes for the course HTML only (`warn`, `tip`, `eg`, `kbd`, tables, quiz options), scoped under `.invest` and using the existing tokens (`--danger`, `--success`, `--accent`).
- Add a segmented view switcher. Tab bar CSS is unchanged; six tabs still fit using `flex: 1`.

### Not building now
Upstox integration (live IPO calendar, P/E), charts, CAS import and holdings/XIRR, price alerts, backtesting. Each can be added later on top of this tab.

## Files
- **Modified:** `src/App.jsx`, `src/store.js`, `src/styles.css`, `README.md` (add a smoke-test line: `curl "http://localhost:5173/api/quote?symbols=RELIANCE.NS"`).
- **New:** `src/tabs/Invest.jsx`, `src/invest/course.js`, `src/invest/research.js`, `api/quote.js`, `api/_lib/parseYahooChart.js`, `test/parseYahooChart.test.js`.
- **Left as is:** `personal/trading_tutor.html`.

## Process
Per superpowers:
1. After approval, save this design to `forge/docs/superpowers/specs/2026-09-14-invest-tab-design.md`.
2. Implement the parser TDD-first.
3. Commit only if the user asks.

## Verification
1. **Tests:** `npm test` passes. The parser tests cover a fixture response (change % math, 52-week fields), a missing result (throws), and a null previous close.
2. **Start the app:** `preview_start forge-dev`.
3. **Function:** `/api/quote?symbols=RELIANCE.NS,TCS.NS` returns 2 quotes. `?symbols=bad` returns 400. An unknown symbol shows up in `errors`, not as a crash.
4. **In the browser, Invest tab:**
   - Pass the module 1 quiz, reload, and module 2 is still unlocked.
   - Check a task and it stays checked after reload.
   - Searching the glossary filters the list.
5. **Watchlist:**
   - Search "parag", add a fund: the NAV and date appear.
   - Add RELIANCE: price and 52-week range appear.
   - Add an IPO by hand: it sorts by date.
   - Edit a note, then delete an item.
6. **Mobile and build:**
   - At 375px width: no horizontal scroll, all 6 tabs tappable, course tables scroll inside their card.
   - `npm run build` succeeds.
