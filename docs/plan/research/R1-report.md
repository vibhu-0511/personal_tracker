# R1 report: Shell and CSS

## Summary
- The shell is two layout rules plus three fixed-position pieces: `.app` max-width 640 (`src/styles.css:107-114`), the fixed `.tab-bar` (140-162), and overlays hard-coded to the 640px column and tab-bar height (toast 620, FAB 736, sheet 829). Everything else in the CSS is width-agnostic.
- `src/tabs/Today.jsx` already exists: it is the Codeforces "Code" view. `KEY_TO_TAB.progress = 'Today'` (`App.jsx:36`) and `syncTicks.Today` (`LogicBuilding.jsx:42,82`) depend on that name. The new cross-domain Today tab must NOT reuse the id `Today`. Use `Home` for the id, with label "Today".
- Recommendation: a ~40-line hash router behind a stable module API, not react-router. There is no `vercel.json`, so path URLs would 404 on deep links. `/dsa/mastery-map.html` and `/api/*` also share the origin.
- Biggest technical risk: `container-type: inline-size` may apply layout containment, which would re-anchor `position: fixed` children to the container. Avoid it by making the container a fixed-height (100dvh) shell with an inner scroll pane, as the blueprint prototype does.
- Blueprint numbers that disagree with the code are listed under Gaps. Rail is 72 vs 64px, sidebar 220 vs 216px, inspector at 1024 vs 1280. "20+ hover rules" is 18. The FAB offset claim describes the toast, not the FAB.
- 13 build tasks proposed (`R1.tasks.json`). `src/styles.css` and `src/App.jsx` are the contention hot spots and are serialized by deps. New CSS goes in 8 partials created up front, so later tasks do not collide.

## Facts
Layout rules (Q1):
- `.app { max-width: 640px; margin: 0 auto; min-height: 100dvh; display:flex; column; padding: env(safe-area-inset-top) 16px 0 }` at `styles.css:107-114`. Used as root wrapper at `App.jsx:165,174,184,221`. It is both page root and column. Breaks at >=600 (phone strip). The auth, loading and error screens (App.jsx:165-218) can keep it.
- `.app-header` sticky, `top:0`, `z-index:10`, `background: var(--bg)` at `styles.css:116-125`. Inference: `top:0` pins it under the iOS status bar in standalone mode, because the safe-area padding sits on `.app` and not on the header.
- `.content { flex:1; padding-bottom:100px }` at `styles.css:137`. The 100px assumes tab bar (about 54px, see below) plus slack. It breaks when nav leaves the bottom.
- `.tab-bar` fixed, `bottom/left/right:0`, `z-index:100`, background `rgba(10,12,16,.85)` hard-coded, `padding-bottom: env(safe-area-inset-bottom)` at `styles.css:140-153`. `.tab-bar-inner { max-width:640px; overflow-x:auto }` at 155-162. `.tab-btn { flex: 1 0 64px }` at 164. Inference: tab bar height is 8+22+2+15+6 + 1px border = about 54px plus safe-area. Six tabs need 384px, which exceeds 375px (iPad Slide Over, iPhone SE), so the bar would scroll horizontally.
- `.toast-stack` fixed, `left:0; right:0`, `bottom: calc(64px + env(safe-area-inset-bottom))`, `z-index:300` at `styles.css:620-632`. Centered on the viewport. The 64px hard-codes the tab-bar height. `.toast { max-width:420px }` at 638. Rendered at `App.jsx:303`.
- `.expense-fab` fixed, `bottom: 80px`, `right: max(16px, calc((100vw - 640px) / 2 + 16px))`, `z-index:50`, with `padding-bottom: env(safe-area-inset-bottom)` on a 52px circle, at `styles.css:736-756`. Rendered only in Money, unless `view==='loans'` or a form is open, at `Expenses.jsx:1296-1302`. `100vw` includes the scrollbar and ignores any rail or sidebar.
- `.sheet-dialog` fixed bottom sheet: `bottom:0; top:auto; left:0; right:0; max-width:640px; margin:0 auto; border-radius:20px 20px 0 0; max-height:85vh; z-index:200; padding:20px` at `styles.css:829-848`. It uses `vh`, not `dvh`, and has no safe-area padding. `Sheet.jsx:13` uses `showModal()`. Used 3 times, all in `Expenses.jsx` (lines 874, 1112, 1184).
- Z-index stack today: header 10 (`styles.css:123`), FAB 50 (753), tab-bar 100 (147), sheet 200 (835), toast 300 (625). Inference: open `<dialog>` is in the top layer, so it sits above the toast whatever the z-index, and toasts are hidden while a Sheet is open.
- Safe-area insets used: `styles.css:113` (top, on `.app`), 152 (tab-bar bottom), 624 (toast), 755 (FAB). There is no left/right inset, which matters for iPad landscape with a rail.
- Only one `@media` exists: `prefers-reduced-motion` at `styles.css:1112`. There are no `@container` rules and no `:focus-visible`.
- `body { overflow-x:hidden }` at `styles.css:103`. The page scrolls on the document, not on an inner pane.
- Viewport meta has `viewport-fit=cover` (`index.html:5`). Status-bar style is `black-translucent` (`index.html:7`). `theme-color` is static `#0a0c10` (`index.html:8`, `manifest.json:7-8`). Nothing updates it when the theme changes (`App.jsx:97,117,146` only set `dataset.accent`).

Phone-width assumptions in tabs (Q2). Every tab renders one vertical stack inside `.content`:
- `.stat-row`/`.stat-card` (flex, 3 equal cards): `Expenses.jsx`, `LogicBuilding.jsx:~45-58`, `Today.jsx`. Defined at `styles.css:214-226`.
- `.life-stats`/`.life-stat` (`styles.css:996-1004`, `Life.jsx`).
- `.expense-cat-grid { repeat(4,1fr) }` (`styles.css:710-714`, `Expenses.jsx`). Inline `gridTemplateColumns:'1fr 1fr'` at `Expenses.jsx:451,1139`.
- `.agent-bar` horizontal scroller is the sub-view switcher in 6 files: Agents, Exams, Expenses (`:419`), Invest (`:65,:118`), Life (`:199,:211`), LogicBuilding (`:61`). It still works at any width and should stay the sub-nav below 1024.
- `.chat-bubble { max-width:85% }` (`styles.css:515`, `Agents.jsx`). `.money-trend-bar { width:28px }` (873).
- Inline widths: `Life.jsx:463 width:140`, `Exams.jsx:252 maxWidth:160`. Inline `overflowX:auto` wrappers: `Invest.jsx:339`, `Puzzles.jsx:106`. None breaks at wider widths.
- `.card`, `.note-card`, `.problem-card`, `.puzzle-card`, `.habit-card` and `.life-row` are fluid blocks. Inference: they stretch rather than break, but a 1000px-wide single column will look sparse. The fix is a max-width and 2-up flow in the page pane (R1-11).
- Sub-view state is local `useState` in each tab: `Life.jsx:80` ('tasks'; two-level via `VIEWS` groups at 33-41), `LogicBuilding.jsx:20` ('code'), `Expenses.jsx:106` ('overview'), `Invest.jsx:27` ('learn'). Agents keeps `agent` state (`Agents.jsx:26`). Tabs unmount on switch (conditional render, `App.jsx:280-284`), so sub-view state is lost on tab change today.
- Sub-view ids for the route table: Life tasks|reminders|notes|habits|growth (`Life.jsx:33-41`); Logic code|puzzles|exams (`LogicBuilding.jsx:8-12`); Money overview|txns|budget|goals|loans (`Expenses.jsx:420-426`); Invest learn|research|watch (`Invest.jsx:11-15`). The DSA map is an `<a href="/dsa/mastery-map.html">`, not a view (`LogicBuilding.jsx:73-79`).

Hover and focus (Q3):
- 18 `:hover` rules, none guarded (`grep -c ":hover" src/styles.css` = 18) at `styles.css`: 274, 283, 292, 295, 302, 338, 364, 399, 482, 500, 563, 668, 702, 729, 757, 785, 923 (`:hover:not(:disabled)`), 969 (`:hover:not(:disabled)`). Rule 757 (FAB) applies `transform: scale(1.08)`, which sticks after a tap.
- JS hover: `Toast.jsx:15-16` uses `onMouseEnter`/`onMouseLeave` to pause auto-dismiss. Inference: on touch devices, emulated mouseenter after a tap pauses the toast and no mouseleave follows, so an Undo toast can stay up indefinitely.
- `outline:none` appears only on `input, textarea, select` (`styles.css:315`), with a 1px `border-color` change at 317-319 as the only focus cue. Buttons keep the browser default ring. `.tab-btn`, `.agent-pill`, `.life-check`, `.theme-swatch`, `.note-swatch` and `.gear-btn` have no authored focus style.
- A non-focusable clickable `div`: `Invest.jsx:641`. `aria-current` and `aria-selected` appear nowhere in `src/`. The tab `<nav>` at `App.jsx:288` has no label. Total `tabIndex`/`role`/`aria-` hits across tabs and App: 23.
- No hover rule exists for `.tab-btn` (`styles.css:164-183`), so rail and sidebar items need new ones, hover-guarded from the start.

Themes and tokens (Q4):
- `:root` defines the ocean/dark defaults at `styles.css:1-23`: `--bg --surface --surface-raised --border --border-light --text --text-secondary --text-tertiary --accent --accent-dim --accent-solid --success(-dim) --warn(-dim) --danger(-dim) --radius(-sm,-xs) color-scheme`. `--accent-hover` is declared at line 94, after the theme blocks. It still loses to `:root[data-accent]` on specificity.
- There is no `data-accent="ocean"` block; ocean is the `:root` default. forest, sunset, grape and rose override only the four accent tokens (`styles.css:26-49`). sky overrides surfaces, text, borders, radii (22/16/14) and `color-scheme: light` (50-67), plus a body image `/sky-clouds.svg` with `background-attachment: fixed` (68-74, file is 1440x2560). Glass rules for header, cards and tab-bar are at 75-92. The theme list is `App.jsx:23-30`. Default theme is 'ocean' (`store.js:70`).
- An unknown `data-accent` value falls back to ocean tokens. Inference: a client that does not know "cream" degrades safely when settings sync across devices.
- Hard-coded colours that ignore theme tokens: `.tab-bar` background (148), `.puzzle-card` gradient `#1a1e28,#13161d` (373, not overridden for sky), `.send-btn:hover #3b82f6` (563), `.expense-fab:hover` blue shadow (757), `.btn-success:hover` (295), `.chip-muted` (253), the note colour rules (440-444, 451-454) and the `#a78bfa` title gradient end (131).
- Contrast of the blueprint cream palette (`forge-blueprint.html:605`), computed by me: accent `#ff6b57` on `#fff6e9` is 2.62:1, and white on that accent is 2.80:1 (both fail AA). `--mu #82788f` on cream is 3.90:1 (fails 4.5). `--hot #c2321f` on `#ffd9d2` is 4.27:1. Passing alternatives: accent-solid `#c9382a` is 5.14:1 against white, and muted text `#6f6580` is 5.09:1 on cream and 4.47:1 on peach.
- Dark `--text-tertiary #5d6577` is already 3.35:1 on `--bg` and 3.10:1 on `--surface`. This is an existing a11y debt, not a blocker.

Router and bundle (Q6):
- No router. `App.jsx:51` holds `tab` in `useState('Life')`, and tabs render by conditional at 280-284.
- No `vercel.json`, no service worker. `ls` of the repo root shows none, and `public/` has `dsa/`, `manifest.json`, `puzzles.json` and `sky-clouds.svg`. `vite.config.js:51-55` has no `base`. Dev and preview have a Vite SPA fallback, but Vercel static hosting does not (Inference).
- `supabaseClient.js:10` calls `createClient(url, anonKey)` with defaults. Sign-in is password only (`App.jsx:154`), so no OAuth hash fragments arrive. Inference: the `#/path` hash is safe, and supabase-js ignores hashes that lack `access_token`.
- Measured baseline in `dist/assets`: main chunk `index-jeNPW56_.js` is 415,093 B raw / 119,148 B gzip. CSS is 25,576 B raw / 5,648 B gzip. Life chunk is 167,525 B. I did not measure react-router (no installs). Inference: it adds roughly 10-20 kB gzip, which is unmeasured.
- Capacitor: Inference. A hash router works under `capacitor://localhost`, `file://` and any WKWebView scheme with no server fallback, and history routing needs the host to return `index.html` for extensionless paths.

Repo checkout state:
- `node_modules/` exists with 49 entries (react, react-dom, vite, @supabase, localforage, motion, @dnd-kit) and `dist/` exists, built Nov 12 10:42. This contradicts the briefing claim "node_modules not installed".

## Gaps and contradictions
- Rail width: prose says 72px (`blueprint.txt:36`), prototype CSS says 64px (`forge-blueprint.html:592`). Sidebar: 220px (prose, `blueprint.txt:37`) vs 216px (`forge-blueprint.html:598`). Pick 72/220, as the decision states 72.
- Inspector breakpoint: the prose table puts the 3-pane layout at >=1280 (`blueprint.txt:37-38`), and the prototype's `.a-detail` (300px) appears at >=1024 (`forge-blueprint.html:597-602`). The decision text says >=1024. At 1024 the arithmetic is 1024 - 220 sidebar - 300 inspector = 504px for the list. Flagged in "Needs from the user".
- Container name: prose uses `container: app / inline-size` on `.app-root` (`blueprint.txt:44`, `forge-blueprint.html:227`). The prototype queries `@container dev` on a frame (`forge-blueprint.html:129,591`). The build must use `app`.
- "20+ :hover rules" (`blueprint.txt:21`): actual count is 18.
- "FAB offset is calc(64px + safe-area)" (`blueprint.txt:23`): that expression is the toast stack (`styles.css:624`). The FAB is `bottom:80px` with no safe-area in the offset (`styles.css:738`). Inference: on a notched iPhone the tab bar top is about 88px, so the FAB overlaps it by about 8px.
- The blueprint FAB fix `bottom: calc(var(--tabbar-h, 0px) + ...)` (`blueprint.txt:61`) fixes the FAB only. Toast (`styles.css:624`), `.content` padding (137) and sheet width (842) have the same hard-coding.
- Blueprint says a "new" Today home; the repo already has `src/tabs/Today.jsx` (256 lines, Codeforces practice) wired through `KEY_TO_TAB` (`App.jsx:36`) and `syncTicks.Today` (`LogicBuilding.jsx:42,82`). Collision resolved by the `Home` id.
- `KEY_TO_TAB` maps each key to ONE tab (`App.jsx:35-42`). The bento Today reads tasks, habits, expenses, progress, moodLog and watchlist, so it needs a key-to-many map or a remount on any key. This is a change to `App.jsx:121-123`.
- Blueprint sub-view list has Spend/Budgets/Goals/Loans (4) for Money and DSA map as a view; code has 5 Money views (overview, txns, budget, goals, loans) and DSA map is an external link. The "17 sub-views" total is 16 views + Agents + the DSA link, and does not map 1:1 to routes.
- Prototype assumes the page scrolls inside `.a-body { overflow:auto }` (`forge-blueprint.html:582`), but the real app scrolls the document (`styles.css:103,137`). This is a layout-model change, not a restyle.
- Blueprint's Playwright matrix (`blueprint.txt:64-69`) has no counterpart: `package.json` has no Playwright. Owned by R7.
- `.dB .tile:nth-child(5n+x)` pastel assignment (`forge-blueprint.html:608-609`) breaks as soon as tiles are conditional or reordered. Use an explicit `data-tone` attribute.
- Briefing says "No router, no service worker" (true) and "node_modules not installed" (false, see Facts).

## Risks
- Container-query layout containment (Inference, unverified, no browser available to me). If `container-type: inline-size` makes the container the containing block for `position: fixed`, a fixed tab bar or FAB would anchor to the container's box. Mitigation: R1-06 builds `.app-root { container: app / inline-size; height: 100dvh }` with an inner scroll pane, so container height equals the viewport either way. First acceptance step is a Chromium and WebKit check of the rail, FAB and toast.
- Switching from document scroll to an inner scroller loses native iOS toolbar collapse and per-route scroll restoration. Mitigation: reset `.page` scrollTop on route change. Pin the decision in the plan. Alternative: keep document scroll with `position: sticky` nav, but sticky bottom bars are less reliable on iOS.
- Sub-view routing needs a one-line edit in each of 4 large tab files (`Life.jsx:80`, `LogicBuilding.jsx:20`, `Expenses.jsx:106`, `Invest.jsx:27`) that other lanes (R2/R3/R4) also edit. Mitigation: R1-12 is a separate tiny task, scheduled in a wave where no other task writes those files. The `useSubView` hook keeps the edit to one line.
- Tab state resets on nav change are unchanged. Data loss: none, since the store is IndexedDB-first. Unsaved form drafts (quick-add inputs, Sheet forms) are lost on route change, as they are on tab change today.
- Theme sync: settings key is synced (`store.js:69-74`), so choosing cream on one device sets it on all. Phone dark / desktop cream is not possible without a per-device override. Mitigation: ask the user (Needs).
- iOS standalone with `black-translucent` status bar (`index.html:7`) over light themes (sky today, cream next) gives a white clock on a light header. This is already true for sky. Mitigation: keep a dark top strip, or switch to `default` for light themes. The meta tag is read at launch, so it cannot be flipped live.
- Cream accent `#ff6b57` fails contrast (2.62:1). Mitigation: R1-03 defines `--accent-solid` and `--text-secondary` from the passing values in Facts.
- Toast hidden under open `<dialog>` (top layer) and sticky on touch hover. Mitigation: R1-02 (pointer-type guard) and R1-07 (render the stack in a `popover="manual"` top-layer element, or confirm the existing behaviour is acceptable).
- 6 tabs at <=375px overflow the bottom bar. Mitigation: R1-06 uses `flex: 1 1 0; min-width:0` and a 10px label.
- Path URLs would 404 on Vercel hard refresh and conflict with `/dsa/*` and `/api/*`. Mitigation: hash routing now. Revisit when P1 adds `vercel.json` rewrites. Keep the router API location-agnostic.
- `body background-attachment: fixed` (`styles.css:73`) is not honoured by iOS Safari (Inference). Pre-existing, so out of scope.

## Write-set map
Files the build touches in this lane:
- HOT: `src/styles.css` (writers: R1-02, then R1-10; all other CSS goes to partials). `src/App.jsx` (writer: R1-09, plus any Home-tab or Today-tile task from other agents, which must dep on R1-09). `src/main.jsx` (R1-01 only, imports all partials up front).
- NEW CSS partials (R1-01 creates, one owner each): `src/styles/tokens.css` (R1-03), `shell.css` and `nav.css` (R1-06), `inspector.css` (R1-08), `palette.css` (R1-05), `overlays.css` (R1-07), `screens.css` (R1-11), `tiles.css` (owned by whichever agent builds the bento tiles, not R1).
- NEW JS: `src/router.js`, `src/routes.js` (R1-04); `src/shell/{Shell,Nav,TopBar}.jsx` (R1-06); `src/shell/{CommandPalette.jsx,commands.js,useShortcuts.js}` (R1-05); `src/shell/{Inspector.jsx,inspectorContext.js}` (R1-08); `src/tabs/Home.jsx` stub (R1-09).
- Small edits: `src/Toast.jsx` (R1-02). `src/Sheet.jsx` needs no change; sheet placement is CSS only (R1-07).
- Cross-lane one-line edits: `Life.jsx:80`, `LogicBuilding.jsx:20`, `Expenses.jsx:106`, `Invest.jsx:27` (R1-12). `Expenses.jsx:1296-1302` FAB hide at >=1024 is a CSS rule in `overlays.css`, but a "New transaction" entry point must exist (palette command or header button). Owned by R4's lane.
- Tests: `test/router.test.js`, `test/commands.test.js`, `test/shellCss.test.js`.
- Untouched: `index.html`, `public/manifest.json` (P1 owns icons and theme-color), `public/sky-clouds.svg`, `public/dsa/*`.

## Needs from the user
- Decision: inspector at >=1024 (per decision text, leaves ~504px list) or at >=1280 (per blueprint prose)? Default assumption in tasks: container query at 1180px, as one token `--inspector-min`, easily changed. Say if you prefer the exact 1024.
- Decision: is the cream theme (a) one of seven synced themes, or (b) allowed to differ per device?
- Decision: path URLs (`/life/tasks`) or hash URLs (`/#/life/tasks`)? Hash is assumed for P0.
- Device facts: which iPhone/iPad models and whether the PWA is run standalone on a notched device, which fixes the `black-translucent` question.
- Decision: do Habits and Growth also use B tiles? Not needed for R1; flagged for the synthesis.
- No accounts, keys or dashboard actions are needed for this lane.

## Proposed tasks
All P0 and mirrored in `R1.tasks.json`.
- R1-01 (S) Scaffold CSS partials and import them from `main.jsx`.
- R1-02 (S) Hover and focus hygiene: wrap the 18 `:hover` rules in `@media (hover: hover)`, add a global `:focus-visible` ring, and guard the Toast pointer events.
- R1-03 (M) Tokens: nav sizes, z-index scale, hover and focus tokens, inspector tokens, pastel tile tokens (dark and light), and the cream theme with AA-passing values.
- R1-04 (M) Hash router, route table and `useSubView` hook, with tests.
- R1-05 (M) Command registry, palette (`<dialog>`), shortcuts (Cmd/Ctrl+K, Cmd+1..6, N, X), with tests.
- R1-06 (M) Shell components: container-query grid, bottom tabs, 72px rail, 220px sidebar, top bar, page slot for the inspector.
- R1-07 (S) Responsive overlays: Sheet, Toast and FAB positioning per breakpoint, using the tokens.
- R1-08 (S) Inspector pane: inline at >=1024, falls back to Sheet below.
- R1-09 (M) Wire the shell into `App.jsx`: route-driven tabs, `Home` first and default, key-to-many sync ticks, cream in THEMES, theme-color meta.
- R1-10 (M) Migrate legacy `styles.css`: drop the old tab-bar, header and 640px rules, and replace hard-coded colours with tokens.
- R1-11 (S) Wide-pane CSS for legacy blocks (stat rows, category grid, content max-width).
- R1-12 (S) Adopt `useSubView` in Life, Logic, Money and Invest.
- R1-13 (S) Static CSS guard test (no unguarded hover, no `100vw` or `64px + safe-area` hard-codes, container queries present).
