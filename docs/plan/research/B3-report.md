# B3 report: hybrid design specification

Companion files: `docs/plan/research/B3.tasks.json` (20 tasks) and `docs/plan/research/B3-spec.md` (full token tables, shell matrix, Today tile table, 18-row sub-view table, component inventory, a11y spec, route table). The spec appendix is the answer to charter questions 1-6; this report holds the evidence and the plan.

## Summary

- Hybrid is buildable with no new dependency and no data migration. Cheapest path: new CSS files per task (`src/styles/*.css`, per-component CSS) so `src/styles.css` and `src/App.jsx` each have one owner per phase.
- Token reconciliation: keep existing token names and dark values; fix `--text-tertiary` (3.10:1 dark, 2.86:1 sky) and light-theme status colours (`#4ade80` on white = 1.74:1); add `cream` as a 7th `data-accent` value. B's cream palette fails as written: `--mu #82788f` is 3.29-3.90:1, white on `#ff6b57` is 2.80:1, B donut slices are 1.75-3.69:1. Corrected values are in spec section 1.
- Shell: rail 72px and sidebar 220px (table and drop-in CSS), not the prototype's 64/216. Inspector from >=1024 (user decision, matches proto) contradicts the blueprint table, which puts the third pane at >=1280. One `<nav>` DOM node restyled per breakpoint instead of three.
- Today: 9 tiles, DOM order streak, wallet, pets, code, watch, tasks, spend, mood, tutor. Grid is its own container (2/4/6 columns at grid width <600 / 600-899 / >=900) because app-width thresholds give 115px tiles at 600px with the rail.
- Data gaps: no global streak, no Level/XP, no daily goal (`/3`), no reminder repeat, no Pencil/sketch, no index quote (`NIFTY`), no quote series for sparklines. Proposed derivations: global streak = `streaks()` over the union of all habit check-ins; level = `1 + floor(sqrt(xp/30))` with `xp = sum(earnings().total)` (gives Lv 7 at the sample 1240); `settings.dailyGoal` default 3.
- Count mismatch: real app has 18 sub-views, not 17 (Money has overview + txns). Tab name collision: `'Today'` already means the Codeforces view in `KEY_TO_TAB`; the new home must use id `home`.
- Recommendation: Habits as pet tile grid (after the P0 gate), Growth as A blocks.
- 20 tasks proposed, all P0; first wave of 7 is parallel with disjoint write-sets (B3-01, 02, 03, 04, 06, 10, then 05 after 02/03/04).

## Facts

Repo state (verified)
- React 18 + Vite 5, tabs are component state, no router: `src/App.jsx:51` (`useState('Life')`), `package.json:12-22` (no router dep). Five tabs, lazy: `src/App.jsx:9-13,15-21`.
- Six themes, one attribute: `THEMES` `src/App.jsx:23-30`; applied `src/App.jsx:97,117,146`; default `theme: 'ocean'` `src/store.js:70`. Only `sky` is a light theme: `src/styles.css:50-92` (overrides `--bg`, text, radii 22/16/14, `color-scheme: light`, blurred cards).
- `KEY_TO_TAB` is single-valued and maps `progress -> 'Today'`, where "Today" is the Codeforces view: `src/App.jsx:35-42`; used at `src/App.jsx:121-123`. `LogicBuilding` passes `syncTicks.Today` to it: `src/tabs/LogicBuilding.jsx:42,82`.
- Tokens: `src/styles.css:1-23`; hover count is 18 (`grep -o ":hover"`), blueprint says "20+" (`docs/forge-blueprint.html:182`). One `@media` only: `src/styles.css:1112`. No `:focus-visible` anywhere; inputs set `outline: none`: `src/styles.css:315`.
- Width caps at 640px in four places: `.app` `src/styles.css:108`, `.tab-bar-inner` `:157`, `.expense-fab` right offset `:739`, `.sheet-dialog` `:842`.
- Hard-coded offsets: `.content` padding-bottom 100px `:137`; `.toast-stack` bottom `calc(64px + env(safe-area-inset-bottom))` `:624`; `.expense-fab` bottom 80px `:738`. Blueprint attributes the 64px to "the FAB" (`docs/forge-blueprint.html:184`); it is the toast stack. The only FAB is Expenses-local: `src/tabs/Expenses.jsx:1298`.
- Tab bar: `.tab-btn` `flex: 1 0 64px`, 10px label in `--text-tertiary` (3.35:1 on bg): `src/styles.css:164-179`. Six tabs at 64px = 384px, overflows a 320px Slide Over (`overflow-x: auto`, `:159`).
- Existing equivalents: `.card` `src/styles.css:186` (36 usages in `src/**/*.jsx`), `.chip/.chip-muted` `:243-255`, `.agent-bar/.agent-pill` `:457-488` (9 and 22 usages; used as the sub-nav in `src/tabs/Life.jsx:199-222`, `src/tabs/Expenses.jsx:427-433`, `src/tabs/Invest.jsx:65-72`, `src/tabs/LogicBuilding.jsx:58-71`), `.empty-state` `:568` (24 usages), `.life-check` 44x44 `:1017`, `.life-icon-btn` 44x44 `:1026`, `.habit-health-bar` `:1058`, `.exam-progress-bar` `:761`, `.stat-card` `:219`, `.life-stat` `:999`.
- `src/Sheet.jsx` is a 27-line native `<dialog showModal>` wrapper, bottom-anchored (`src/styles.css:829-851`), 3 usages, all in `src/tabs/Expenses.jsx:874,1112,1184`. `src/Toast.jsx` already has `aria-live="polite"` and pause on hover/focus (`:12-21`).
- Inline styles: 364 `style={{` lines across `src/**/*.jsx` (grep). Hex literals after the token block in CSS: 27 lines; inline hex in JSX: 8 (`src/tabs/Exams.jsx:13,33,73`).
- `index.html:7-8` set `apple-mobile-web-app-status-bar-style: black-translucent` and `theme-color #0a0c10`; `public/manifest.json:6-7` has dark `background_color`/`theme_color`.
- Dependencies present: `motion` (`src/tabs/Life.jsx:2`), `canvas-confetti`, `@dnd-kit/*`. `DropList` hard-codes `verticalListSortingStrategy`: `src/dnd/Dnd.jsx:82`.

Blueprint (verified)
- Shell table: rail 72px, sidebar 220px, inspector/3rd pane at >=1280, "Bottom tab bar (5 tabs)": `docs/forge-blueprint.html:206-209`; drop-in CSS `:227-241` (`.app-root { container: app / inline-size }`, `.shell` grid, `--hover` used but never defined).
- Prototype A: rail 64px, sidebar 216px, `.a-body` `1fr 300px` at >=1024, FAB hidden >=600: `docs/forge-blueprint.html:591-603`. Prototype B grid 2/4/6 by container `dev`, spans w1-w3/wf: `:622-650`; tile colours by `nth-child(5n+k)`: `:609-610`.
- Sample data for Today B: streak 12/best 21, wallet ₹1,240, Level 7, 9 tiles: `docs/forge-blueprint.html:1463-1475,1513`. NAV has 6 entries, ids `home, life, logic, money, invest, agents`; ⌘1-6 hints: `:1368,1506`.
- Prototype checkboxes are 18px, mood emoji 26px with no padding (no 44px target): `docs/forge-blueprint.html:532,1475`.
- Blueprint mood tile shows 3 emoji; DT has 4 pets; sample reminders have `Daily/Monthly` chips: `docs/forge-blueprint.html:1402-1404,1475`.

Data providers (verified)
- `streaks(checkins, today)` `{current,best}` `src/life/logic.js:65`; `earnings(habit,today)` `{total,today,nextMultiplierIn}` `:92`; `petState` `{stage,accessory,health,mood,traits}` `:125`; `MILESTONES` `:27`; `computeStats` caps each domain at 100 `:169-183`.
- Habit shape `{id,name,category,species,domain,createdAt,checkins[]}` `src/tabs/Life.jsx:770`. Wallet total = `sum(earnings(h).total)` `src/tabs/Life.jsx:160-163`.
- Mood log `{date,valence,source}`; `MANUAL_MOODS` has 5 values (0/25/50/75/100); `ensureTodayEntry`, `logManualMood`: `src/life/logic.js:203-228`. `ensureTodayEntry` only runs inside Life, gated on `ready` to avoid overwriting history: `src/tabs/Life.jsx:94-107`.
- Task shape `{id,title,due,dueAt,done,doneAt,createdAt,urgent,important,subtasks}` `src/tabs/Life.jsx:252-262`; quadrant labels `:57-62` (not exported); reminder shape `{id,title,at,done,createdAt}` and no repeat field `:635-640`.
- Expenses `{id,amount,category,note,date,type,person}` `src/tabs/Expenses.jsx:232-239`; `CATEGORIES` `:16-29`, `monthRange` `:44`, `monthTotals` `:93`, month spend `:360-372`, `totalBudget` `:403` (none exported). Budgets are per-category only.
- `solvedToday(progress)` exported `src/tabs/Today.jsx:24`; no daily goal field in that file. `getSettings()` returns `{cfHandle,theme,...}` `src/store.js:69-71`.
- Quotes: `/api/quote` regex `^[A-Z0-9&-]{1,20}\.(NS|BO)$` `api/quote.js:3`; Yahoo `range=1d&interval=1d` `api/quote.js:15`; parsed fields incl. `price`, `changePct` `api/_lib/parseYahooChart.js:8-16`; client pattern `src/tabs/Invest.jsx:432-446`.
- `Agents()` takes no props; chat state in module scope `src/tabs/Agents.jsx:19-25`. Store has no change event, only sync status: `src/store.js:46-49`, `src/sync/engine.js:15`. `saveSynced` is the single write choke point `src/store.js:55-57`.
- Real sub-views: Life 5 (`src/tabs/Life.jsx:35-45`), Logic 3 + DSA link (`src/tabs/LogicBuilding.jsx:8-12,74-80`), Money 5 (`src/tabs/Expenses.jsx:427-433`), Invest 3 (`src/tabs/Invest.jsx:11-15`), Agents 1 = 17 + Money split = 18 incl. the DSA link.
- Contrast computed (script, WCAG): see spec section 1; key results: existing `--text-secondary` 6.00 dark / 5.34 sky; B `--mu` on pastels 3.29-3.69; proposed cream `--text-secondary #5f5670` 5.42-6.88 on all tiles; dark tile `--tile-sec #a3adc0` 5.72-6.31.

Inferences (not observed)
- Inference: `container-type: inline-size` on `.app-root` is safe for `position: fixed` children in current Chrome/Safari (layout containment was dropped from container-type), but this was not tested here; verify on iOS Safari 16 before relying on a fixed bottom tab bar inside the container.
- Inference: Cmd/Ctrl+1..8 are reserved by browsers in a normal tab and cannot reliably be overridden; they work in an installed PWA window. Hence the `g`-chord and Alt+n fallbacks.
- Inference: `black-translucent` status bar (white text) will be unreadable over sky/cream backgrounds in an installed iOS PWA; needs a per-theme status-bar/theme-color decision in the PWA phase.
- Inference: `docs/plan/blueprint.txt` has no design CSS; design facts above were read from `docs/forge-blueprint.html` (blueprint.txt:132-144 summarises Ask 3 only).

## Gaps and contradictions

1. Rail/sidebar widths: table and drop-in CSS 72/220 (`docs/forge-blueprint.html:206-208,232,236`) vs prototype A 64/216 (`:591-598`). Resolved: 72/220.
2. Inspector breakpoint: table puts the third pane at >=1280 and a "detail pane" at 1024-1279 (`:208-209`, drop-in `:239-240`); prototype and the user's decision put the inspector at >=1024 (`:600-601`). Resolved: inspector >=1024, 300px then 320px; separate detail pane deferred.
3. Dense rows 36px at >=1280 (`:209`) include iPad Pro 13" landscape, which is touch, contradicting the 44px rule. Resolved: density keyed by `pointer`, not width.
4. FAB: prototype hides it at >=600 with no replacement; touch-only iPad has no create affordance except the palette (keyboard). Resolved: visible `+ New` header button at >=600.
5. Audit claims: "20+ :hover" (actual 18); "FAB offset calc(64px + safe-area)" (actually `.toast-stack`; real FAB is `bottom: 80px`); "5 tabs" (6 with Today).
6. Money has 5 views, blueprint lists 4 (merges Overview + Txns into "Spend"): `docs/forge-blueprint.html:1372` vs `src/tabs/Expenses.jsx:427-433`. "17 sub-views" is 18 in code.
7. Blueprint features with no code behind them: reminder repeat chips and "repeat + calendar export" (reminders have no repeat), Sketch/Pencil block, Level, daily target 3, "Up next" focus, NIFTY index quote, sparkline series, "Lichess puzzle" tile is a link only. See spec section 3.
8. Today tile order in the prototype leaves an orphan at 2 columns (`watch` alone) and relies on `nth-child` colours; replaced with explicit tones and a DOM order that packs at 2, 4 and 6 columns.
9. Blueprint "Tabs become routes" needs host support: no `vercel.json` exists, so `/life/tasks` will 404 on a direct hit in production; `/api/*` and `/dsa/*` must be excluded from the rewrite. History vs hash routing is undecided.
10. `docs/plan/blueprint.txt` omits all design CSS and tile data; any agent reading only the text file cannot reproduce tokens or spans.
11. Name collision: new "Today" home vs `src/tabs/Today.jsx` (Codeforces) and `KEY_TO_TAB.progress = 'Today'`.
12. Light themes do not override status colours, so `.up/.down/.banner-warn` are low contrast on sky today (success 1.74:1 on white): pre-existing.

## Risks

- R1 Lost update inside one device: Today tiles and the inspector write whole keys (`tasks`, `habits`, `moodLog`) while another component holds a stale copy in state (every tab keeps its own copy, e.g. `src/tabs/Life.jsx:81-92`). Mitigation: one owner per mounted key per screen; inspector receives data and callbacks from the list owner, never loads its own copy; tiles use `engine.mutate`-style read-modify-write (`src/store.js:162-164` pattern) or the shared hook in B3-10/13.
- R2 Mood history overwritten: Today calling `ensureTodayEntry` before all keys hydrate would derive from an empty log and save over history (the exact bug Life guards at `src/tabs/Life.jsx:94-98`). Mitigation: B3-13 gates on all loaders ready; acceptance covers it.
- R3 Duplicated write paths (check-in with milestone confetti `Life.jsx:800-817`, task toggle `:273-285`): copies drift. Mitigation: B3-13 owns the tile write functions; a later task should extract them from Life.jsx into `src/life/actions.js` (not proposed here to avoid a second writer of Life.jsx).
- R4 Header pills stale after local edits: store emits no change events. Mitigation: B3-10 (event + `useStoreKey`); touches `src/store.js` which the sync v2 work also edits; keep the diff to `saveSynced`.
- R5 Single-writer hot spots: `src/App.jsx`, `src/styles.css`, `src/main.jsx` are owned by B3-14 (after B3-02 for the first 94 lines of styles.css). Any other task that edits them in the same wave breaks parallel safety. Screen tasks B3-15/17/18/20 each own exactly one tab file; if other agents split `Life.jsx` or `Expenses.jsx` first, retarget.
- R6 `KEY_TO_TAB` rewrite (multi-tab keys) can silently stop a tab refreshing after a remote pull. Mitigation: B3-14 acceptance lists each key and the tab it must refresh.
- R7 Keyboard shortcuts: character keys without a way to disable violate WCAG 2.1.4 and collide with text entry. Mitigation: guards + `settings.shortcuts` toggle (tested in B3-09).
- R8 Container-query edge cases on iOS (fixed positioning in an inline-size container, dialog in top layer): unverified. Mitigation: B3-07 acceptance includes a real-device or Safari check; fallback is `@media` on viewport for the nav only.
- R9 Light-theme regressions: 27 hard-coded colours in CSS and 8 in JSX will look wrong on cream. Mitigation: B3-02 adds tokens; B3-19 audit script; gallery page (B3-05) shows all 7 themes.
- R10 Tap targets: 18px checks, 28px swatches, 36px gear and 6px-pad `.btn-sm` fail 44px under touch. Mitigation: B3-03 (new components) and B3-19 (legacy).
- R11 Production deep links 404 without a host rewrite (Gap 9). Mitigation: user decision (Needs) and a rewrite task outside this lane.
- R12 `black-translucent` status bar over light themes (Inference above). Mitigation: PWA phase.
- R13 Sync data loss unrelated to design: unchanged whole-key LWW; the Today screen adds a third writer surface for `habits`/`tasks`, increasing the chance of the documented lost-edit case until sync v2 lands.

## Write-set map

Files the hybrid build touches, with contention:

| File / dir | Tasks | Contention |
|---|---|---|
| `src/App.jsx` | B3-14 | HOT SPOT: only B3-14 in P0 (also edited by any PWA/auth task: serialize) |
| `src/styles.css` | B3-02 (lines 1-94), B3-14 (106-183, 620-625, 736-757, 829-847), B3-19 (257-345, 467-505, 988-993) | HOT SPOT: strictly chained B3-02 -> B3-14 -> B3-19 |
| `src/main.jsx` | B3-02, B3-14 | chained |
| `src/store.js` | B3-10 (2 lines) | shared with sync v2 (R6 lane) |
| `src/Sheet.jsx` | B3-08 | single |
| `src/tabs/Life.jsx` | B3-15, B3-20 | chained; also R2 split target |
| `src/tabs/Expenses.jsx` | B3-17 | single; R4 split target |
| `src/tabs/{LogicBuilding,Invest,Agents}.jsx` | B3-18 | single task |
| `src/dnd/Dnd.jsx` | B3-20 | single |
| `src/styles/{tokens,shell}.css` | B3-02, B3-07 | new, single each |
| `src/ui/*` | B3-03 (8 jsx + ui.css), B3-04 (4 jsx + viz.css + vizMath.js), B3-16 (SubNav + css), B3-05 (Gallery) | disjoint file names; do NOT write `src/ui/*` globs |
| `src/shell/*` | B3-06 (routes.js), B3-07, B3-08, B3-09 | disjoint file names |
| `src/today/*` | B3-01 (logic.js), B3-11, B3-12 (tiles), B3-13 (grid, hooks) | disjoint |
| `src/router.js`, `src/storeEvents.js`, `src/useStoreKey.js`, `src/money/categories.js` | B3-06, B3-10, B3-10, B3-01 | new |
| `gallery.html`, `src/ui/gallery-main.jsx` | B3-05 | new |
| `test/*.test.js` (todayLogic, vizMath, router, shortcuts, paletteSearch, storeEvents, cssAudit) | one task each | new |
| `scripts/audit/css-audit.mjs` | B3-19 | new |
| `package.json`, `vite.config.js`, `vercel.json` | none | not needed by B3 (no new deps); `vercel.json` rewrite is outside this lane |

Waves implied: W1 {01, 02, 03, 04, 06, 10}; W2 {05, 07, 16}; W3 {08, 09, 11, 12}; W4 {13}; W5 {14}; W6 {15, 17, 18, 19}; W7 {20}.

## Needs from the user

1. Production host and routing: confirm Vercel (no `vercel.json` today) and choose history routes (`/life/tasks`, needs a rewrite excluding `/api/` and `/dsa/`) or hash routes (`/#/life/tasks`, no host change).
2. Approve the Level/XP rule (`level = 1 + floor(sqrt(xp/30))`, `xp` = lifetime wallet) or supply another; confirm that level may drop if a check-in is undone.
3. Confirm global streak = "at least one habit check-in per day".
4. Confirm daily code goal default 3 (stored as `settings.dailyGoal`).
5. Money sub-views: keep 5 real views (recommended) or merge Overview + Txns into one "Spend" as the blueprint shows.
6. Habits as tile grid (recommended, after the P0 gate) and Growth as A blocks.
7. Watch tile: first watchlist stock instead of NIFTY (index symbols are rejected by `api/quote.js:3`), or approve an API change in the R5 lane.
8. Devices to test on (iPhone model, iPad model/iPadOS, browser used on desktop) so the container-query and shortcut inferences can be checked on hardware.
9. Whether keyboard shortcuts should be on by default (the WCAG toggle defaults on in the spec).

## Proposed tasks

All P0 (shell + design system). Size, deps in brackets. Full JSON in `B3.tasks.json`.

- B3-01 Pure Today logic + tests: global streak, level/XP, month spend, task buckets [S, none]
- B3-02 Hybrid tokens, cream theme, pastel tile tokens, light status colours [M, none]
- B3-03 UI primitives Tile, Row, Check, Chip, Pill, Stat, EmptyState, Kbd [M, none]
- B3-04 Viz primitives Bar, Ring, Donut, Spark + tested geometry helpers [M, none]
- B3-05 Standalone UI gallery page (`gallery.html`) [S, 02 03 04]
- B3-06 Route table + History API router + tests [S, none]
- B3-07 Responsive shell: Shell, single Nav, Header, Fab, useLayout, actions context [M, 02 03 06]
- B3-08 Inspector pane/side sheet + `Sheet` side variant [S, 07]
- B3-09 Command palette + shortcuts + tested search/key guards [M, 06 07]
- B3-10 Store change events + `useStoreKey` [S, none]
- B3-11 Today tiles: Streak, Wallet, Pets, Code ring, Tasks [M, 01 02 03 04]
- B3-12 Today tiles: Spend donut, Mood, Watch, Tutor [M, 01 02 03 04]
- B3-13 Today home grid, data hook, header-pill summary hook [M, 10 11 12]
- B3-14 Wire shell/router/Today/cream into App.jsx, retire legacy tab-bar CSS [M, 02 07 08 09 13]
- B3-15 Life screen retrofit: routes, SubNav, inspector for Tasks/Reminders [M, 14 16]
- B3-16 SubNav component [S, 03 06]
- B3-17 Money screen retrofit: 5 routes, shell FAB, inspector [M, 14 16]
- B3-18 Logic/Invest/Agents retrofit incl. Agents `?q=` prefill [S, 14 16]
- B3-19 Hover guard, focus-visible, 44px coarse targets + CSS audit script [S, 14]
- B3-20 Habits pet tile grid with rect-sorting DnD [M, 15] (optional, after P0 gate)

Cross-lane overlap seen in the other agents' proposals (for synthesis to dedupe; B3 deps cannot cite them because ids were unknown while writing):
- Tokens/shell/router/palette/inspector/App wiring/legacy CSS: B3-02, 06, 07, 08, 09, 14, 19 duplicate R1-01..R1-10 (R1-04 chose a HASH router; R1-09 puts Home in `src/tabs/Home.jsx`).
- Today logic and tiles: B3-01, 11, 12 duplicate R2-02 (Level/XP), R2-15, R2-16, R4-10 (SpendTile), R4-20 (WatchTile); R4-02 proposes `src/charts/Donut.jsx` which duplicates B3-04.
- Screen retrofits: B3-15/17/18/20 are superseded if R2-05..R2-17 (Life split) and R4-05..R4-11/R4-16..R4-21 (MoneyApp/InvestApp) land; R4-05 merges Overview + Txns into one SpendScreen, contradicting this report's recommendation to keep 5 Money views (needs a user decision, item 5 above).
- R4-13 already plans the quote series needed for Spark; R2-04 and B3-10 both edit `src/store.js` (serialize).
- Host SPA rewrite and per-theme status bar belong to the PWA phase.
