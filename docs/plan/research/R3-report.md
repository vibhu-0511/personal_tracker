# R3 report: Logic tab and DSA map

## Summary
- Logic is 4 files (LogicBuilding 87, Today 256, Puzzles 297, Exams 285 lines) plus 2 tiny APIs. All of it is single-column cards; no width logic, no selection state, no inspector. Master/detail is a clean fit for Code, Puzzles and Exams; DSA is a full-width block.
- Naming trap is small and fully enumerated (Q1): only `LogicBuilding.jsx` imports `Today.jsx`, but the sync tick key `'Today'` in `App.jsx:36` collides with a new Home tab if it also uses id `Today`. Name the new home `Home` (path /today) and rename the CF view to `CodeView`.
- Code ring today = `solvedToday(progress)`, a count of manually marked CF problems since local midnight. There is no goal, no rating cache, no streak. Blueprint's "2/3" needs a goal that does not exist.
- DSA page: 433,319 bytes, 8,320 lines, syncs one `kv_store` row (`dsa_mastery_v1`) with no timestamp check, 1 media query. Recommendation: same-origin iframe route (`/logic/dsa`) with a small `?embed=1` patch now; do not port to React; keep a "open in new tab" fallback link.
- Biggest hazards: DSA sync can overwrite local progress and leaks across accounts on a shared browser; a PWA service worker with navigate-fallback would load the React app inside the iframe; CF/Lichess failures leak raw JSON parse errors.
- 11 tasks proposed (5 can start immediately, no shared files). Logic tasks add only new files plus the four tab files, so they stay out of `styles.css`, `App.jsx`, `store.js`.

## Facts
Q1 Today.jsx references (rename safety)
- `src/tabs/Today.jsx:40` default export `Today` (CF problem list); `:24` named export `solvedToday`. It is not the new home.
- Only importer: `src/tabs/LogicBuilding.jsx:2` (`import Today, { solvedToday } from './Today.jsx'`), used at `:36` (solvedToday) and `:82` (`<Today ... />`). `src/App.jsx` imports only LogicBuilding (`App.jsx:9`), not Today.jsx.
- Tick key named `Today`: `App.jsx:36` (`progress: 'Today'`), read at `LogicBuilding.jsx:42` and `:82` (`syncTicks.Today`). This is a string key, not a file reference, and would collide with a Home tab id `Today`.
- No test imports Today.jsx or solvedToday (grep over test/: only `ensureTodayEntry` in `test/growth.test.js`, unrelated, from `src/life/logic.js:217`). Other hits are docs only: `docs/superpowers/specs/2026-09-15-cloud-sync-design.md:28,187`, `docs/superpowers/plans/*`, `docs/plan/*`. `dist/` chunks are build output.
- Stale doc: cloud-sync spec `:186-187` says the DSA link was added to `Today.jsx`; it is actually at `LogicBuilding.jsx:74-80`.

Q2 Code ring data
- `solvedToday(progress)` = entries with `status === 'solved' && updatedAt >= local midnight` (`Today.jsx:24-29`). `progress` is store key `progress` (`store.js:83-91`); `markProblem` sets `{status, tags, updatedAt: Date.now()}` (`store.js:86-91`).
- Only manual marks count. Problems solved on Codeforces itself are excluded from the list (`pickProblems.js:12`) and `api/cf.js:47-53` discards submission timestamps, so real CF solves are never counted.
- There is no unmark path: once a card has a state the buttons are replaced by a badge (`Today.jsx:226-233`). A mistaken "solved" cannot be undone from the UI.
- No daily goal exists: settings are `{cfHandle:'step_bro', theme:'ocean'}` (`store.js:70`). Blueprint ring "2/3" (`docs/forge-blueprint.html:1472`) has no data source for the 3.
- CF rating is not persisted; it exists only in the `/api/cf` response (`api/cf.js:71`) and component state (`Today.jsx:118`). Blueprint stat "Rating 1342" (`forge-blueprint.html:1397`) needs a cache.
- Puzzle progress is `{id: boolean}` (`Puzzles.jsx:69`) and exam progress `{"exam::section::topic": boolean}` (`Exams.jsx:105-107`): no timestamps, so no "today" or streak for them. Only CF `progress` has dates.
- Logic header glance: solved today, puzzles solved / `puzzles.length` (145 in `public/puzzles.json`: 55 easy, 51 medium, 39 hard, 8 categories), exam % (`LogicBuilding.jsx:30-42`). Total exam topics = 66 (CAT 17, CFA 35, GMAT 14; computed from `Exams.jsx:8-89`).
- Exam % counts every truthy key in `examProgress` (`LogicBuilding.jsx:33-37`) against the 66 known topics. Inference: orphaned keys after a topic rename can push it above 100%.
- Puzzle "today" uses UTC day `Math.floor(Date.now()/86400000)` (`Puzzles.jsx:50`); `solvedToday` uses local midnight. They roll over at different times (inference: 05:30 local in IST).

Q3 DSA mastery map (`public/dsa/mastery-map.html`)
- Size 433,319 bytes. Data constants `const *_DATA` span lines 1779-6264; `TABS` at `:6264`; vm-evaluating them gives 23 tabs and 610 array-backed cards (not "320 problems"). Global counter = cards done / 610 (`renderNav`, `:6521-6551`).
- localStorage keys written: `mastery_map_v2` (`:6496`, card state keyed `tab::title` with `{done, confidence, expanded}` `:6502-6511`), `mastery_tab` (`:6498,8228`), `mastery_map_problems` (`:7616`), `roadmap_phase`/`roadmap_rating` (`:6782-6791`). `expanded` (UI state) is inside the synced blob.
- Supabase: `supabase-js@2` loaded unpinned from jsdelivr (`:1608`; main app uses 2.116.0, `package.json`). URL and anon key are hardcoded literals (`:1613-1614`, README:69-71). One row: `kv_store` key `dsa_mastery_v1` (`:1621`), value = snapshot of every localStorage key matching `/^(mastery_|roadmap_)/` (`:1627-1636`), upsert after 700 ms debounce (`:1647-1663`). Pull happens on `onAuthStateChange` (fires on every load, `:1669-1699`): cloud values overwrite local, then `location.reload()` if anything changed.
- No timestamp comparison (author comment `:1615-1620`): last write wins on both sides. Realtime is not used; the shell's channel ignores non-`SYNCED_KEYS` keys (`App.jsx:110`).
- `localStorage.setItem/removeItem` are monkey-patched to call `schedulePush()` for any key (`:1701-1702`), not only `ours` keys.
- Session: shares the main app's Supabase session via same-origin localStorage (cloud-sync spec `:179-183`). If `window.supabase` is undefined (CDN blocked/offline) line `:1622` throws and the patch at `:1701` never runs.
- Responsiveness: exactly one `@media (max-width: 900px)` (`:481-485`: sidebar becomes static block above content). Grid `.ars-cards` `minmax(360px,1fr)` (`:523`) and `.cards` `minmax(320px,1fr)` (`:297`). Layout is `240px 1fr` grid with `100vh` sticky sidebar (`:78-92`). 28 `:hover` rules, 0 `hover: hover`, 0 `focus-visible`, 0 `prefers-reduced-motion`, 0 `prefers-color-scheme`. Viewport meta has no `viewport-fit=cover` (`:6`). Inference: at 390px width `.main` padding 20px leaves 350px < 360px, so arsenal cards overflow horizontally.
- Back link `<a href="/">← Forge</a>` at `:1718`; inside an iframe it would load Forge inside itself. Fixed sync pill `bottom:12px` (`:1706`) and toast `bottom:30px` (`:7025`) are not safe-area aware.
- Blueprint wants it "embedded in the shell as a route instead of a separate 8,300-line page" (`docs/forge-blueprint.html:1442`); the sync spec chose "normal full-page navigation (not an iframe)" (`cloud-sync-design.md:186-189`). Today it is an `<a>` outside `VIEWS` (`LogicBuilding.jsx:74-80`, VIEWS at `:8-12`).
- `public/manifest.json` start_url `/`, display standalone; no service worker exists in the repo (grep: no `sw.js`/`serviceWorker` outside docs).

Q4 Failure modes
- `/api/cf` empty handle: 400 `handle required` (`api/cf.js:29-30`). Client never calls it without a handle (`Today.jsx:55`) and shows an empty state (`:194-199`). Handle can still be saved as `''` (`App.jsx:136-138`) and the settings panel auto-opens when empty (`App.jsx:98`).
- Unknown handle / CF rejections: `CFApiError` carries CF's `comment`, returned as 502 (`api/cf.js:6,11,79`); shown in `banner-warn` (`Today.jsx:200`). Any other exception (non-JSON body, network) -> generic 502 "Could not reach Codeforces" (`api/cf.js:80-81`).
- No fetch timeout, no `r.ok` check on the CF side (`api/cf.js:9-12`); `problemsCache` is module-level, never expires (`:15,39-41`). Each page/filter change re-runs `user.info` + `user.status?count=10000` (`:42-43`), 2 CF calls per page click.
- Client does not check `r.ok` (`Today.jsx:60`): a platform 504/HTML body makes `r.json()` throw and the raw parser message is shown (`:62`). `api/cf.js:3-5` says raw parse errors should not reach the client.
- Dev double-fetch: `React.StrictMode` (`src/main.jsx:6-8`) runs the mount effects twice (`Today.jsx:66`, `Puzzles.jsx:35`). Inference: hits Codeforces call limits in dev.
- Stale responses: `fetchProblems` has no abort (`Today.jsx:54-64`); `page` state is not reset when `cfHandle` changes (`:66-68`). Inference: out-of-order responses can render the wrong page.
- `changePage` calls `window.scrollTo` (`Today.jsx:88`); inference: wrong scroller once content scrolls inside a pane.
- `/api/puzzle`: non-OK Lichess -> 502 "Could not fetch today's puzzle" (`api/puzzle.js:4,12-15`); no timeout, no Cache-Control; fetched on every Puzzles mount (`Puzzles.jsx:35-40`); surfaced as "Chess puzzle: ..." banner (`:77`).
- Neither API sets CORS headers (same-origin only; `api/cf.js`, `api/puzzle.js`). Inference: a Capacitor build calling relative `/api/cf` gets an HTML 404 -> the parser-error path above (R5 owns).
- Tests: `test/pickProblems.test.js` has 5 passing tests (`node --test test/pickProblems.test.js`: 5 pass). Nothing covers `solvedToday`, `shuffleDaily`, exam totals, or the API handlers.

Q5 Master/detail material
- Code: card list of 20 per page (`Today.jsx:208-238`), filter panel (`:143-182`), stats row duplicating the header glance (`:109-128` vs `LogicBuilding.jsx:46-59`). Problem data is only `{id,name,rating,tags,url}` (`api/cf.js:62-68`): inspector can show tags, link, mark/skip, and `tagCounts` per-tag solved bars (returned at `api/cf.js:73`, only used for least-practiced at `Today.jsx:102`).
- Puzzles: Lichess card + 5 daily + browse-all; each row expands inline (`Puzzles.jsx:137-217`, duplicated markup at `:224-283`, ~145 cards unvirtualised). Detail = description/hint/solution/source (fields `id,title,description,hint,solution,source,url,difficulty,category`).
- Exams: 3 exam pills (`Exams.jsx:173-184`), progress card, accordion of sections (`:199-236`), notes with undo-delete (`:238-275`), placeholder card (`:277-282`). Natural split: sections (master) | topic checklist + notes (inspector). `EXAMS` data lives inside the component file and is imported by LogicBuilding (`LogicBuilding.jsx:4,14-17`), which would force the Home bundle to load Exams.jsx for totals.
- Phone-only: inline accordions become a sheet (`src/Sheet.jsx`, native `<dialog>`, used at `Expenses.jsx:874`). Wide-only: persistent inspector, j/k/x keys, selection kept across rotate.
- Styles for these views live in shared `src/styles.css` (`.problem-card :351`, `.puzzle-card :372`, `.cf-filter-* :651-703`, `.exam-* :761-810`, `.stat-row :214`). `.app` is `max-width:640px` (`styles.css:107-108`). No `@container` yet.

Cross-area one-liners
- `App.jsx:35-42` `KEY_TO_TAB` maps one key to one tab; a Home tab needs many keys (progress, puzzleProgress, tasks...). R1/R6.
- Vercel has no `vercel.json` (verified absent): `/logic/dsa` deep links 404 unless SPA rewrites exclude `/dsa/*` and `/api/*`. R1/R7.

## Gaps and contradictions
- Repo claim "node_modules not installed" is false in this checkout: `node_modules` has 49 entries, vite 5.4.21, react 18.3.1, supabase-js 2.116.0 (`node_modules/*/package.json`). Timestamps (Nov 12 10:42) suggest a sibling agent (R7) installed it during the swarm.
- Blueprint says DSA is a sub-view and a route (`forge-blueprint.html:1442`); spec says full-page link (`cloud-sync-design.md:186-189`); code is a link outside `VIEWS` (`LogicBuilding.jsx:74`).
- Blueprint DSA block shows "148 of 320 problems mastered" and per-topic %; the page tracks 610 concept cards, per-tab totals live only inside the page. A native summary needs the page to export totals.
- Blueprint Logic stat row is Rating / Today / DSA (`forge-blueprint.html:1397`); code shows Solved today / Puzzles / Exam topics (`LogicBuilding.jsx:46-59`). Rating and DSA % have no stored source; "Today 2/3" has no goal.
- Blueprint snippet puts the second pane at >=1024 and a third (inspector) only at >=1280 (`blueprint.txt:54,56`); the decision says inspector from >=1024. Logic screens are 2-pane (list | inspector) at 1024; a third column has no content here.
- Blueprint plan gives `logic.dsa` a full-width block (`wf`), `logic.code` = cf (w3) + puzzle (w1) (`forge-blueprint.html:1379`): the daily Lichess puzzle is expected as a tile on the Code screen, but the code puts it on the Puzzles view (`Puzzles.jsx:85-98`).
- `docs/superpowers/specs/2026-09-15-cloud-sync-design.md:187` points at the wrong file (see Facts).
- CF and Lichess rate limits are external facts I did not verify (no network research in charter); X1 should confirm.

## Risks
- DSA sync loses data: cloud overwrites local with no timestamp check and a forced reload (`mastery-map.html:1678-1699`); UI state (`mastery_tab`, `expanded`) is synced, so two devices fight. Mitigation: R3-04 writes a local pre-pull backup key (mirrors `__pre_sync_backup`, `engine.js`) and a test that pins the key list.
- Account bleed: `claimOwner` clears IndexedDB only on user change (`engine.js:138-142`); DSA localStorage stays and is pushed under the next user's id. Mitigation: R3-04 stores `dsa_owner` and clears `mastery_*`/`roadmap_*` on mismatch before pulling.
- Service worker (P1) with navigate-fallback to `index.html` would answer the iframe request for `/dsa/mastery-map.html` with the React app (recursion). Mitigation: R7's SW config must denylist `/dsa/` and `/api/`; acceptance: offline iframe shows DSA page, not Forge. CDN supabase script (`:1608`) and Google Fonts fail offline: R3-10 vendors supabase-js.
- Patching the page's `setItem` is only safe because an iframe has its own `window`. Porting it inline would push the snapshot on every unrelated `localStorage.setItem` (including supabase auth writes). Mitigation: do not inline; iframe.
- iOS iframe scrolling, `100vh`, double scrollbars, 22-tab sidebar below 1120px shell width (iframe < 900px triggers the stacked layout). Mitigation: R3-04 embed CSS (dvh, compact nav), check at 390/834/1194.
- Tick-key collision `Today` (`App.jsx:36`). Mitigation: Home id `Home`; R3-02 reads `Code` with `Today` fallback so order of the App.jsx edit does not matter.
- Selection staleness: a remote sync tick re-hydrates lists; a selected id may vanish. Mitigation: inspectors render an empty state when `selected` is missing (R3-05/06/07 acceptance).
- CF outage/limits make Code view empty with no retry. Mitigation: R3-09 + R3-11 + retry button in R3-05.
- Dark-only DSA page inside the cream 7th theme will look foreign. Accept for now; `?embed=1` could map a `theme` param later.
- DSA content source: the spec says it was copied from `logic_building/mastery_map_DSA_v11.html` outside this repo; edits here may diverge from the author's master copy (see Needs).

## Write-set map
Files my tasks touch (existing): `src/tabs/LogicBuilding.jsx`, `src/tabs/Today.jsx` (moved to `src/tabs/CodeView.jsx`), `src/tabs/Puzzles.jsx`, `src/tabs/Exams.jsx`, `public/dsa/mastery-map.html`, `api/cf.js`, `api/puzzle.js`.
New files: `src/logic/{stats.js,examData.js,useSplit.js,logic.css,apiClient.js,tileData.js,code.css,puzzles.css,exams.css,dsa.css}`, `src/tabs/DsaView.jsx`, `public/dsa/vendor/supabase-2.116.0.js`, `test/{logicStats,logicApiClient,logicTileData,dsaPage,cfApi}.test.js`.
Deliberately not touched (owned by others): `src/styles.css`, `src/App.jsx`, `src/store.js`, `vite.config.js`, `package.json`. New CSS goes in per-view files imported from the components, so no Logic task edits `styles.css`.
Hot spots
- `src/tabs/LogicBuilding.jsx`: R3-02 only. Anyone adding routes/sub-views here must dep on R3-02.
- `public/dsa/mastery-map.html`: R3-04 then R3-10 (serial).
- `src/App.jsx` (R1): must rename `KEY_TO_TAB.progress` to `'Code'`, add route `/logic/:view`, pass `view`/`onViewChange`/`syncTicks` to LogicBuilding. Outside my write-sets.
- `api/cf.js`, `api/puzzle.js`: R3-09; R5 (native/CORS) may also edit; order them.
- `src/styles.css`: existing rules for logic views (`:351-410`, `:651-703`, `:761-810`) stay; unguarded `:hover` there belongs to R1's sweep.

## Needs from the user
- Daily code goal for the ring (default 3 proposed) and whether Level/XP may use CF solves only (only dated data) or count puzzles/exam topics/DSA cards as lifetime totals.
- Confirm iframe embed for DSA (recommended) versus a React port (multi-day, not proposed).
- Whether `logic_building/mastery_map_DSA_v11.html` is still edited outside this repo; if yes, treat `public/dsa/mastery-map.html` as vendored and keep the embed patch tiny.
- Whether "solved today" should also count real Codeforces submissions (needs `api/cf.js` to return today's accepted count).
- Deploy target confirmation (Vercel) and whether SPA rewrites will be added, for `/logic/dsa` deep links.

## Proposed tasks
Wave A (parallel, disjoint): R3-01, R3-03, R3-04, R3-09, R3-11. Wave B: R3-02, R3-08, R3-06. Wave C: R3-05, R3-07. Later: R3-10 (P1).
- R3-01 (S, P0) Pure Logic helpers: stats, exam data, split hook, shared CSS, with tests.
- R3-02 (M, P0) Rename CF view to CodeView; make LogicBuilding a controlled 4-view host (adds DSA); Exams imports shared data. Deps R3-01, R3-03.
- R3-03 (S, P0) DsaView iframe wrapper with load/error fallback. No deps.
- R3-04 (M, P0) Mastery-map `?embed=1` mode, summary export, pre-pull backup, owner guard, key-pinning test.
- R3-05 (M, P0) Code view master/detail with inspector, retry and error surfaces. Deps R3-01, R3-02, R3-08, R3-11.
- R3-06 (M, P0) Puzzles master/detail, shared row component, local-day seed. Deps R3-01, R3-11.
- R3-07 (M, P0) Exams master/detail (sections | checklist + notes). Deps R3-01, R3-02.
- R3-08 (S, P0) Logic tile-data selector for the Today home (code ring, streak, puzzles, exam %, DSA, cached rating). Deps R3-01, R3-04.
- R3-09 (S, P4) Harden `api/cf.js` and `api/puzzle.js` (timeouts, ok checks, TTL cache, 429 message) with handler tests.
- R3-10 (S, P1) Vendor supabase-js UMD for the DSA page and guard the missing-client path. Dep R3-04.
- R3-11 (S, P0) Client `fetchJson` with friendly typed errors, with tests.
