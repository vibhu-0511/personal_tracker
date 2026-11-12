# R4 report: Money and Invest

## Summary
- Money is one 1353-line component (`src/tabs/Expenses.jsx:102-1304`) holding 35 `useState` lines, four store keys, three bottom sheets and a fixed FAB. Invest is 786 lines, but already split into 12 small components, so it only needs moving.
- Money has 5 sub-views in code (Overview, Txns, Budget, Goals, Loans) against 4 in the blueprint (Spend, Budgets, Goals, Loans). Plan: merge Overview+Txns into one Spend screen.
- Expenses.jsx has no exported math. Month spend, category totals, budget total and trend are computed inline at `Expenses.jsx:362-414`. Today needs them, so the first task extracts them as pure, tested functions.
- Watchlist prices live in component state (`Invest.jsx:414-447`). There is no shared cache and no price history. The sparkline needs `/api/quote` to return daily closes, and `parseYahooChart` discards them.
- No chart library exists. Today's visuals are div bars. The donut and sparkline are new, hand-rolled and dependency-free (blueprint does the same: `docs/forge-blueprint.html:540,1417,1425`).
- Splitting the screens creates a stale-copy data-loss hazard. Each screen would hold its own array and save the whole key. Fix: one shared context (R4-03, R4-15).
- Plan: 23 tasks (R4-01..R4-23). Money 11, Invest 10, shared charts 1, quote API 1. Nothing edits `App.jsx`, `styles.css`, `store.js` or `package.json`.

## Facts
Money, structure (Expenses.jsx, 1353 lines, verified with `wc -l`)
- Imports 1-14. Constants 16-32: `CATEGORIES` 16-29 (12 entries), `CAT_MAP` :30, `GOAL_ICONS` :31, `MAX_AMOUNT` :32 (10,000,000).
- Pure helpers 34-100: `toDateInputValue` :34, `fromDateInputValue` :39, `monthRange` :46, `formatMonth` :54, `shortMonth` :58, `shortAmount` :62, `startOfDay` :69, `formatDate` :75, `groupByDate` :83, `monthTotals` :93.
- Component 102-1304. State 103-147. Hydrate :153-158. Persist wrappers :160-175. Month nav :177-192. Txn handlers :194-254. Loan handlers :256-290. Budget handlers :292-310. Goal handlers :312-347. Loading/error :349-359. Derived values :361-414.
- Render: sub-tab pills 418-436. Overview 438-613 (stats 451-491, +Income/+Expense 493-508, category bars 510-552, 3-month trend 554-604). Txns 615-723. Budget 725-862. Goals 864-1023 (sheet 874-917, DnD list 926-1021). Loans 1025-1109. Loan sheet 1111-1181. Add-txn sheet 1183-1294. FAB 1296-1301.
- `LoanPersonCard` 1306-1353.
- Style: 122 inline `style={{` occurrences (Expenses.jsx), 17 `toLocaleString('en-IN')` calls.

Invest, structure (Invest.jsx, 786 lines)
- Imports 1-8, constants/`isUnlocked` 10-24, shell `Invest` 26-88 (disclaimer :61-63, view pills :65-72, Research->Watch intent :30,:76-84).
- `Learn` 92-178, `ModuleView` 180-240, `Quiz` 242-319, `ResourcesCard` 321-333, `ChecklistTable` 337-355, `Research` 357-409.
- `Watchlist` 413-560 (quote fetch :432-454, MF NAV fetch :456-471), `WatchlistRow` 562-654, `AddStockForm` 656-706, `AddMfForm` 708-752, `AddIpoForm` 754-786.
- `src/invest/course.js` is 448 lines, pure data: PHASES 6-42 (5 phases, 19 modules), CONTENT 44-326, QUIZZES 328-382, GLOSSARY 384-426, TASKS 428-448. `src/invest/research.js` is 70 lines of static checklists. Neither needs splitting.
- `CONTENT` is rendered with `dangerouslySetInnerHTML` (`Invest.jsx:204`). It is hand-written strings only (`course.js:3-4`).

Store keys per sub-view (store.js:60-63 SYNCED_KEYS; getters at :93-146, :180-184)
- Spend/Overview: `expenses` R/W (array), `budgets` R (map, used for the over-budget colour at Expenses.jsx:518).
- Txns: `expenses` R/W. Add/edit sheet: `expenses` W (:216-250).
- Budget: `budgets` R/W (map `{catId: number}`, not per month, :298,:308), `expenses` R.
- Goals: `goals` R/W (array `{id,name,target,saved,icon,createdAt}`, :318). Order is stored by array position (`placeItem`, `src/dnd/logic.js:2-11`, called at Expenses.jsx:926).
- Loans: `loans` R/W (array `{id,person,amount,direction,note,date}`, :264). Also writes `reminders` through `mutateReminders` (:275, `store.js:162`), a cross-key write into Life's data.
- Learn: `investProgress` R/W (one map `{done:{modId:true}, quiz:{modId:pct}, tasks:{"m1_0":bool}, current}`, store.js:135-139; `current` is a UI pointer that gets synced).
- Research: no keys (static). Watch: `watchlist` R/W (array `{id,type,symbol|schemeCode,name,priceAtAdd,note,addedAt,ipo}`, Invest.jsx:474).
- Arrays with ids (sync v2 candidates): expenses, goals, loans, watchlist. Maps/single documents: budgets, investProgress.
- Deletes use `deleteWithUndo` (`src/undo.js`) for expenses :253, loans :289, goals :343, watchlist :479.

What Today needs and what exists
- Month spend: `spent` = sum of non-income entries in the month (Expenses.jsx:365; legacy entries with no `type` count as expense). Income :364. Category totals :369-376. `totalBudget` = sum of all category budgets :403. All inline; no export.
- Budget compare today is `spent > totalBudget` (:750), which counts spend in categories that have no budget.
- Days left in month: not computed anywhere.
- Loan balances: `computeLoanBalances` in `src/money/logic.js:12-22`, tested in `test/loanBalance.test.js` (7 tests, pass).
- Watchlist movers: `quote.changePct` from `/api/quote`, held only in `Watchlist` state (Invest.jsx:414,:440). MF rows show NAV and date only, no day change (:462, endpoint `/mf/{code}/latest`).
- Quote API returns `{symbol,name,price,prevClose,changePct,high52,low52,currency}` (`api/_lib/parseYahooChart.js:13-20`). It requests `range=1d&interval=1d` (`api/quote.js:15`) and has a 60s in-memory cache (:4-5, :10).
- Symbol allowlist `^[A-Z0-9&-]{1,20}\.(NS|BO)$` (`api/quote.js:3`); max 25 symbols (:4).

Charts
- No chart library in package.json (deps: dnd-kit, supabase, canvas-confetti, localforage, motion, react). A grep for `<svg|<canvas|conic-gradient|chart` in `src` finds only a text label (`Exams.jsx:25`).
- Existing visuals are div bars: `.exam-progress-bar/.exam-progress-fill` (`styles.css:761-770`) and the 3-month trend `.money-trend-*` (`styles.css:853-880`, used at Expenses.jsx:554-604).
- `research.js:52` only names TradingView Lightweight Charts as a suggested tool.
- Blueprint donut = CSS `conic-gradient` plus an inner disc (`docs/forge-blueprint.html:540-541,1425`); palette has 6 colours per design (:1417). Blueprint sparkline = inline SVG polyline over 7 values (:1416); its watch tile shows 4 symbols (:1413, :1454-1455).

Narrow-width, FAB and sheet assumptions
- FAB: `.expense-fab` is `position: fixed; bottom: 80px; right: max(16px, calc((100vw - 640px) / 2 + 16px))` (`styles.css:736-740`). Rendered at Expenses.jsx:1297-1301 on every sub-view except Loans.
- Bottom sheets: `Sheet.jsx:17-25` over `.sheet-dialog` (`styles.css:829-847`: bottom-anchored, `max-width: 640px`, `max-height: 85vh`, `slideUp`). Three uses: Expenses.jsx:874, :1112, :1184. Invest has none; no full-screen sheets in Money or Invest.
- Fixed grids: stat cards `1fr 1fr` (Expenses.jsx:451), category picker 4 columns (`styles.css:710-713`), sub-tabs as a scrolling pill bar (`.agent-bar`, Expenses.jsx:419, Invest.jsx:65).
- Accordion detail for loans (Expenses.jsx:1306-1351) and inline editors for budgets and funds; these are what an inspector would replace.
- Unguarded hover rules in this area: `.agent-pill:hover` :482, `.expense-cat-btn:hover` :729, `.expense-fab:hover` scale :757, `.invest-mod-btn:hover` :923, `.invest-opt:hover` :969.
- Invest Learn already stacks list then content (Invest.jsx:144-171), which maps to a two-pane layout at >=1024px without logic changes.

Watchlist behaviour
- Quote effect depends on `[items]` (Invest.jsx:451-454) and the NAV effect on `[items]` (:456-471), so editing a note (`updateNote` :485) refetches every quote and NAV.
- Client calls relative `/api/quote` (:435, :669) and `https://api.mfapi.in` directly (:460, :718).
- Yahoo source is flagged unofficial in code (`api/quote.js:24`).

Repo facts check
- Verified: React 18 + Vite 5, tabs as state (`App.jsx:15-20,56`), lazy imports (`App.jsx:9-13`), SYNCED_KEYS, `/api` dev plugin (`vite.config.js:15-50`), `node --test` script (`package.json`), no router.
- 21 tests in loanBalance/growth/parseYahooChart pass here (`node --test`, Node v22.23.4).

## Gaps and contradictions
- Repo fact is wrong: `node_modules` IS installed in this checkout (49 entries, `node_modules/.bin/vite` and `esbuild` present). Contradicts `docs/plan/swarm.json:21`. UI task acceptance below uses `esbuild` from it.
- Blueprint says the FAB offset is `calc(64px + safe-area)` (`docs/plan/blueprint.txt:23`). Actual rule is `bottom: 80px` with safe-area as padding inside the button (`styles.css:738,754`), and no `--tabbar-h` variable exists in `styles.css`. The blueprint snippet assumes one.
- Blueprint Money has 4 sub-views (`forge-blueprint.html:1372`); code has 5. Overview+Txns must merge, so `money.spend = spend + recent` (:1380) is a new combined screen, not a port.
- Blueprint shows quick add "coffee 180" (:1448 `recent` block meta). No natural-language quick-add exists in Money. Treated as out of scope; flagged.
- Blueprint `invest.research` shows an "LLM quick take" (:1453). Code Research is static checklists (`Invest.jsx:357-409`). Needs `/api/agent` (R5/P5); not planned here.
- Blueprint watch tile includes `NIFTY 50` (`forge-blueprint.html:1413`, DT.watch). The API rejects index symbols (`api/quote.js:3`).
- Blueprint 2.5 names a `useSynced(key)` data-access hook (:964). It does not exist in `src`; only `docs/plan/swarm.json:135` plans it (R6).
- Blueprint 2.5 lists `invest/research.js` as "DOMAIN (PURE) ... logic" (:963). It is static data with no logic; the real Invest logic is inline in `Invest.jsx`.
- Blueprint "Learn: module 3 of 5" (:1392 `invest.learn` intro) vs the code's 19 modules in 5 phases (`course.js:6-42`). Sample data, but the tile text must say modules done of 19.
- Category label oddity: id `education` is labelled "P2P" with a money-bag emoji (`Expenses.jsx:23`). The blueprint's separate "Loans & P2P" block (:1451) suggests confusion. Spend tile category names will show "P2P". User decision needed.
- Spec says watchlist delete has a confirm step (`docs/superpowers/specs/2026-09-14-invest-tab-design.md`, section 4); code uses an undo toast (`Invest.jsx:479-482`). Code is the better behaviour; keep.
- Name clash: `src/tabs/Today.jsx` is the Codeforces day view inside Logic (R3 area). The new Today home needs a different file name or R3 must rename.
- `test/growth.test.js` tests Life logic (`src/life/logic.js`), not Money. Its `computeStats` caps each domain at 100 points (`growth.test.js:32`); the "financial" domain only counts habits tagged `financial`, not Money data. Relevant only to the open Level/XP question (R2).

## Risks
- Data loss from stale copies after the split. Today one component owns each array. Separate routed screens each hydrating and saving whole keys (`persist*` at Expenses.jsx:160-175) can overwrite each other, e.g. the add sheet saves while the txn list shows an older array. Mitigation: R4-03/R4-15 provide one context per domain; all writes go through it; document "never call saveX from a screen".
- Existing stale-closure write: edit path uses the render-time `expenses` (Expenses.jsx:226-235) and add prepends to it (:237-245). A remote sync arriving mid-edit can be overwritten. Mitigation: in the context, read the latest ref before writing (`useLatest`, already used at :149-151). Longer term use `engine.mutate` (`sync/engine.js:85-95`) via a store.js `mutateX`, which is R6's file.
- Goal funding is a read-modify-write counter (`saved + val`, Expenses.jsx:334). Per-record LWW in sync v2 loses a concurrent top-up from a second device. Mitigation: R6 decides between a funding-event log and accepting the loss; flag to R6.
- Goals ordering lives only in array position (`placeItem`). Per-record rows need an explicit order field or the order resets. Tell R6.
- `investProgress.current` and `budgets` are single documents; LWW per whole key loses one device's quiz result if both devices progress. Mitigation: R6 per-field merge for these two maps.
- Quote/price source: Yahoo chart endpoint is unofficial (`quote.js:24`). A Today tile that fetches on every open raises the chance of rate-limiting or breakage. Mitigation: R4-14 client cache (60s TTL, in-flight dedupe), tile degrades to "price unavailable" per symbol. Yahoo response shape for `range=1mo` was NOT verified from this sandbox; R4-13 must confirm with a live call.
- Inference: `chartPreviousClose` in Yahoo meta is the close before the requested range, so `changePct` computed from it (`parseYahooChart.js:8-10`) is wrong for `range>1d`. Mitigation in R4-13: compute change from the last two closes for multi-day ranges; keep old tests green.
- Compliance: the Invest disclaimer is the only guard (`Invest.jsx:61-63`). A Today watch tile shows investment prices outside Invest. Mitigation: R4-19 keeps the disclaimer on every Invest screen; R4-20 adds a footnote to the tile.
- Relative `/api` URLs (`Invest.jsx:435,669`) fail under a Capacitor origin. Mitigation: R4-14 routes all calls through one `apiUrl()` helper.
- Contention: R4-22/R4-23 rewrite the same screen files as earlier tasks. They depend on R4-09/R4-19, so they cannot run in the same wave as the screen tasks.
- Float money: amounts are `parseFloat` values summed without rounding (`Expenses.jsx:218,364-365`); loan view hides balances under 0.5 (:408-409). Display only; R4-01 tests pin current behaviour rather than change it.
- `dangerouslySetInnerHTML` of course content is safe only while strings stay in `course.js`. Keep that rule in R4-16.

## Write-set map
Hot spots (not edited by any R4 task; single-writer for the shell/data tasks)
- `src/App.jsx`: lines 11-12 (lazy imports), 15-20 (TABS), 36-39 (KEY_TO_TAB), 282-283 (render). Shell task swaps imports to `MoneyApp`/`InvestApp` or `MONEY_SCREENS`/`INVEST_SCREENS`, adds Today tick mapping for `expenses`, `budgets`, `watchlist`.
- `src/styles.css`: Money/Invest rules at 710-758 (expense, FAB), 822-891 (`.money-*`, `.sheet-dialog`), 894-984 (`.invest-*`). R4 tasks only add new colocated CSS; dead rules are removed by the shell/CSS owner after R4-11/R4-21.
- `src/store.js`: no R4 edits. Any `mutateExpenses/mutateGoals/...` additions belong to R6.
- `api/quote.js`, `api/_lib/parseYahooChart.js`: owned solely by R4-13 (R5 must not touch them in the same wave).
- `package.json`: no change (donut/sparkline hand-rolled).

New files (R4)
- `src/money/`: `logic.js` (extend), `categories.js`, `format.js` (R4-01); `MoneyContext.jsx` (R4-03); `AddTxnSheet.jsx` (R4-04); `screens/{SpendScreen,SpendSummary,TxnList}.jsx`, `screens/spend.css` (R4-05); `screens/BudgetsScreen.jsx` (R4-06); `screens/{GoalsScreen,GoalFormSheet}.jsx` (R4-07); `screens/{LoansScreen,LoanPersonCard,LoanFormSheet}.jsx` (R4-08); `MoneyApp.jsx`, `index.js`, `money.css` (R4-09); `tiles/{SpendTile.jsx,useMonthSpend.js}` (R4-10).
- `src/invest/`: `progress.js`, `watchlist.js` (R4-12); `market.js`, `useQuotes.js` (R4-14); `InvestContext.jsx` (R4-15); `screens/{LearnScreen,ModuleView,Quiz,ResourcesCard}.jsx`, `learn.css` (R4-16); `screens/ResearchScreen.jsx` (R4-17); `screens/{WatchScreen,WatchRow,AddForms}.jsx`, `watch.css` (R4-18); `InvestApp.jsx`, `index.js`, `invest.css` (R4-19); `tiles/WatchTile.jsx` (R4-20).
- `src/charts/`: `Donut.jsx`, `Sparkline.jsx`, `geometry.js`, `charts.css` (R4-02). Shared with Today (B3/R3 ring).
- Tests: `test/moneyLogic.test.js`, `moneyFormat.test.js`, `chartGeometry.test.js`, `investLogic.test.js`, `marketCache.test.js`; modified `test/parseYahooChart.test.js`.
- Deleted: `src/tabs/Expenses.jsx` (R4-11), `src/tabs/Invest.jsx` (R4-21).

Contention inside R4
- `MoneyContext.jsx` is the base for R4-04..R4-08. Screens call `useMoney()` and never `saveX`.
- Same-file follow-ups carry deps: R4-22 after R4-09 (screens + MoneyApp + money.css); R4-23 after R4-19.
- Suggested waves: W1 = R4-01, 02, 12, 13, 17. W2 = R4-03, 14, 15. W3 = R4-04, 06, 07, 08, 16 (R4-10, R4-20 can join once R4-14 is done). W4 = R4-05, 18. W5 = R4-09, 19. W6 = R4-22, 23 (after shell inspector primitive). W7 = R4-11, 21.

## Needs from the user
- Decision: is category `education` meant to be "P2P" (`Expenses.jsx:23`)? Rename the label, or migrate entries to a new `p2p` id? Default if no answer: keep as is.
- Decision: keep or drop the blueprint-only items "quick add: coffee 180" and "LLM quick take" for this build? Default: not in the build.
- Decision: show NIFTY 50 on the Today watch tile? It needs an index allowlist in the quote API (R4-13 adds `^NSEI` only if yes). Default: no.
- Decision: should Today's spend tile compare against the sum of all category budgets, or only spend in budgeted categories? Default: sum of budgets vs total spend, as the Budget screen does today (`Expenses.jsx:750`).
- Decision (open from the brief): Habits/Growth tiles are R2's. From Money's side, Growth "Financial" could derive from savings rate or budget adherence; that needs a user choice.
- Device/OS: none. Dashboard actions and keys: none for R4.

## Proposed tasks
Full JSON in `docs/plan/research/R4.tasks.json` (23 tasks, all S/M, all `P0` phase hint).
- R4-01 (M) Money pure helpers + tests. No deps.
- R4-02 (S) SVG Donut + Sparkline primitives + geometry tests. No deps.
- R4-03 (S) MoneyContext shared data layer. After R4-01.
- R4-04 (S) AddTxnSheet. After R4-03.
- R4-05 (M) SpendScreen (Overview+Txns merged). After R4-01, 02, 03, 04.
- R4-06 (S) BudgetsScreen. After R4-01, 03.
- R4-07 (S) GoalsScreen + GoalFormSheet. After R4-01, 03.
- R4-08 (M) LoansScreen + LoanPersonCard + LoanFormSheet. After R4-01, 03.
- R4-09 (S) MoneyApp drop-in + MONEY_SCREENS registry. After R4-04..08.
- R4-10 (S) Today SpendTile + useMonthSpend. After R4-01, 02.
- R4-11 (S) Delete Expenses.jsx. After R4-09, R4-22 and the shell import swap.
- R4-12 (S) Invest pure helpers + tests. No deps.
- R4-13 (S) Quote API: closes, multi-day changePct fix, range whitelist. No deps.
- R4-14 (M) Market data client with TTL cache + `useQuotes` + `apiUrl()`. After R4-13.
- R4-15 (S) InvestContext. After R4-12.
- R4-16 (M) LearnScreen set. After R4-12, 15.
- R4-17 (S) ResearchScreen with `onTrack`. No deps.
- R4-18 (M) WatchScreen + WatchRow + AddForms. After R4-02, 12, 14, 15.
- R4-19 (S) InvestApp drop-in + INVEST_SCREENS + disclaimer. After R4-16, 17, 18.
- R4-20 (S) Today WatchTile. After R4-02, 12, 14.
- R4-21 (S) Delete Invest.jsx. After R4-19, R4-23 and the shell import swap.
- R4-22 (M) Money screens adopt shell inspector/pointer/container-query primitives. After R4-09 and the R1/B3 primitive.
- R4-23 (M) Invest screens adopt the same. After R4-19 and the R1/B3 primitive.
- Standard UI acceptance: `npx --no-install esbuild <entry> --bundle --jsx=automatic ... --outfile=/dev/null` exits 0 (works here: verified on `src/tabs/Invest.jsx`). Behaviour checks are stated per task; viewport checks run once the shell mounts the screens.
