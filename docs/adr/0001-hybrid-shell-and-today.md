# ADR-0001: Hybrid shell and Today home

- Status: Accepted (open items listed at the end)
- Date: 2026-11-13
- Task: B1-02 (Forge plan, P0)
- Related: blueprint "Three directions" design comparison, errata C-1 to C-6, C-11, C-12, E-03, E-08, E-09, E-17, E-21; open decisions D1, D4, D5, D15; plan tasks R1-04, R1-06, R1-07, R1-08, R1-09, B3-02
- Scope: this ADR records the decision only. The code changes belong to the R1 and B3 tasks named in it. Where numbers here and docs/plan/blueprint-errata.md differ, the errata wins.

## Context

Forge today is a phone-width app. Facts verified in the repo (B1 and R1 reports):

- Tabs are component state, not routes: `src/App.jsx` holds `useState('Life')` and renders the active tab by conditional. There are 5 tabs, all lazy-loaded, and no router and no deep links.
- The layout is one column. `.app` is `max-width: 640px`, the bottom `.tab-bar` is fixed, and the toast stack, FAB and sheet are hard-coded to that column and to the tab bar height. There are no width breakpoints and no `@container` rules.
- An iPad window can be anything from a 320px Slide Over to a 1366px full screen and can rotate while the app is open. A layout keyed to a device name is wrong about half the time. A layout keyed to the available width is right every time.
- The blueprint offers three UI directions: A "Command" (everything is a fast list you act on with keys), B "Bento" (everything is a glanceable tile) and C "Journal" (the day is one chronological page). It rates A as the lowest build cost and closest to the current UI, B as medium cost, and C as high cost. It suggests that A's navigation shell and B's tiles on a new home screen are compatible.
- The name `Today` is already taken. `src/tabs/Today.jsx` is the Codeforces practice view, `KEY_TO_TAB.progress` maps to `'Today'` (`src/App.jsx:36`), and `syncTicks.Today` is read in `LogicBuilding.jsx`. A new cross-domain home tab must not reuse that id (errata E-17).

## Decision

Build one adaptive shell from direction A and a new home screen from direction B (the hybrid). There is no device detection anywhere.

### 1. Container-query root

- The app root is the query container: `.app-root { container: app / inline-size; }`. The container is named `app`. Every shell layout rule uses `@container app (min-width: ...)`, never `@media (min-width: ...)` and never a device or user-agent check (errata C-6).
- The only `@media` rules left for layout-adjacent concerns are input-model rules: `(hover: hover) and (pointer: fine)` for hover styles, `(pointer: coarse)` for 44px targets, and `prefers-reduced-motion`.

### 2. Breakpoints: 600 and 1024

Measured on the container width, not the window width (errata C-5):

| Container width | Navigation | Content |
|---|---|---|
| below 600 | bottom tab bar with 6 equal slots, FAB, no horizontal scroll at 375px | one column; item detail opens as a bottom sheet |
| 600 to 1023 | 72px icon rail on the left (C-1) | one or two columns; item detail opens as a side sheet |
| 1024 and up | 220px labelled sidebar (C-2) plus the command palette | list pane plus inspector pane (see section 5) |

There is no 1280 breakpoint. The blueprint table's third pane at 1280 is dropped (errata C-4, E-03). An iPad in Split View at one third width falls into the phone layout for the same reason: the container is narrow.

### 3. Six tabs and the Today tab id

- There are six top-level destinations, in this order: Today, Life, Logic, Money, Invest, Agents. Today is first and is the default (errata C-3).
- The new home tab has the id `Home`, the label "Today" and the route `#/today` (errata C-12). The id `'Today'` is not used for it, because `'Today'` already names the Codeforces view, its sync tick and a `KEY_TO_TAB` value. The Codeforces component is renamed `CodeView.jsx` and `KEY_TO_TAB.progress` becomes `'Code'` (task R3-02, errata E-17).
- `KEY_TO_TAB` accepts arrays so that one remote key change can bump both the Life tick and the Home tick, since the Today tiles read tasks, habits, expenses, progress, moodLog and watchlist.
- The existing ids `Life`, `LogicBuilding`, `Expenses`, `Invest` and `Agents` stay as they are. The legacy scrolling tab bar is removed (errata E-01).

### 4. Routes

Tabs become routes. One URL scheme serves the phone tabs, the desktop panes, iPad windows and deep links (errata C-11).

- Router: a small hash router of about 40 lines behind a stable module API (`src/router.js`, route table in `src/routes.js`), not react-router. This is the R1 recommendation, adopted on the default for open decision D1 (hash URLs). Reasons: there is no `vercel.json`, so path URLs would 404 on a hard refresh and could collide with `/dsa/*` and `/api/*`; and a hash router works under `capacitor://localhost` with no server fallback. The module API does not expose the hash, so switching to path URLs later changes one file. The bundle cost of react-router was not measured (R1 estimates 10 to 20 kB gzip, unverified).
- Route table (17 sub-views in total, errata C-7):

| Tab | Route | Sub-view slugs |
|---|---|---|
| Today (`Home`) | `#/today` | none |
| Life | `#/life/<view>` | tasks, reminders, notes, habits, growth |
| Logic | `#/logic/<view>` | code, puzzles, exams, dsa |
| Money | `#/money/<view>` | overview, budget, goals, loans |
| Invest | `#/invest/<view>` | learn, research, watch |
| Agents | `#/agents` | none |

- `#/` and any unknown path fall back to `#/today`. A sub-view slug that is not in the table is rejected. A bare tab route such as `#/life` selects that tab's first sub-view.
- Money has 4 views because Overview and Txns are merged (open decision D4, default assumed). `#/logic/dsa` is a same-origin iframe of `/dsa/mastery-map.html` with a new-tab fallback (errata E-16, D8).
- The selected item survives rotation and resizing because selection is part of the URL (`?sel=<id>` after the hash path, handled in the router module).

### 5. Inspector from 1024

- From a container width of 1024px the page is a list pane plus a right-hand inspector that acts on the selected item (errata C-4; open decision D5, default assumed: 1024px, not 1280px). At 1024px the arithmetic is 1024 minus the 220px sidebar minus an inspector of about 300px, which leaves roughly 504px for the list.
- Below 1024px there is no inline inspector. The same inspector content opens as a Sheet: a side sheet at 600 to 1023 and a bottom sheet below 600. The inspector receives its data and callbacks from the list that owns the key. It never loads its own copy of a synced key.

### 6. Fixed-position containing-block rule

`container-type: inline-size` applies layout containment, and an element with layout containment is the containing block for its `position: fixed` descendants. Inside `.app-root` a fixed element is therefore positioned against the container, not the viewport (errata E-09). The shell is built so that this does not matter:

- `.app-root` is a 100dvh shell (a fixed-height grid) with an inner scroll pane, so the container box equals the viewport box and container-relative placement lands where viewport-relative placement would.
- Nothing inside the container may rely on viewport-fixed behaviour. In particular no `100vw`, no `vw`-based offsets and no `vh` heights (use `dvh`) in the bottom tabs, FAB, toast stack and sheets.
- FAB, toast stack and sheets derive their bottom offset from one token, `--tabbar-h`, which is 0 when the rail or sidebar is active. The form is `calc(var(--tabbar-h) + env(safe-area-inset-bottom) + <gap>)`, with no literal pixel offsets (errata E-08).
- Modal `<dialog>` elements open in the top layer and are not affected by the containing block. Sheet and the command palette use `showModal()`.
- Verification is by hand and by script: R1-06 checks the FAB, toast, sheet and tab bar in the dev server at 390, 700, 1100 and 1400px, and P0-GATE repeats it. WebKit is checked by hand on a real iPhone and iPad, because the automated matrix runs Chromium only (errata E-22). This rule is stated here because it is a behaviour of CSS that we verified only in the plan, not on a built page.

### 7. Today home (from direction B)

- Today is a bento grid of tiles that reads existing data only: streak, wallet, pets, code ring, tasks, spend, mood, tutor prompt and watch tile. The grid is 2 columns, then 4, then 6 as the container widens. Level and wallet appear as pills in the header, and there is no floating dock.
- Level and XP are derived from existing data and add no new synced key (errata E-15, ADR-0004).
- Tile colours use an explicit `data-tone` attribute, not `:nth-child` position, so conditional or reordered tiles keep their colour.
- The domain screens (Life, Logic, Money, Invest, Agents) use the A style: dense rows with the inspector. Habits and Growth use dense rows by default (open decision D3). Tile-style habits are deferred.
- Cream is added as a 7th theme beside the six existing accents. It is stored in `settings`, so it syncs across devices (open decision D15, default assumed).

## Consequences

- Positive: one URL scheme and one codebase cover phone, iPad at any window size, and desktop. Rotation and Split View need no special code because the layout follows container width.
- Positive: deep links and back/forward work. The command palette and keyboard shortcuts can target routes.
- Positive: the build cost stays at the "low to medium" end. The shell is mostly layout, tokens and a router, and the tile system is limited to the one Today screen.
- Cost: moving from tab state to routes changes `App.jsx`, so unsaved form drafts are lost when the route changes, as they are on a tab change today. Data is not lost, because the store is local-first.
- Cost: the page scrolls inside an inner pane, not on the document. Native iOS toolbar collapse is lost, and scroll restoration per route has to be done by hand (reset the pane's scroll position on a route change).
- Cost: `src/styles.css` and `src/App.jsx` are shared by almost every shell task, so those tasks are serialized by dependency. New CSS goes in separate partials created up front (R1-01).
- Cost: the Codeforces rename touches `LogicBuilding.jsx` and the sync tick wiring (R3-02). Until it lands, nothing may use `'Today'` as the new home id.
- Risk: a hash router means URLs look like `/#/life/tasks`, and a future switch to path URLs needs `vercel.json` rewrites (planned for P1) plus a check that `/dsa/*` and `/api/*` still resolve.
- Risk: the containing-block behaviour of `container-type: inline-size` is relied on being harmless only while the root stays a 100dvh shell. Moving the scroll back to the document, or adding an element that must be viewport-fixed inside the container, would break FAB, toast and sheet placement. The static CSS guard (R1-13) and the viewport checks above are the controls.
- Risk: the inspector at 1024px leaves a narrow list (about 504px). If that proves too tight on a real iPad, D5 can move the start to 1280px by changing one container-query threshold and the errata row C-4.

## Alternatives

### A. Command (adopted for the shell, rejected as the only direction)

Everything is a dense list acted on with keys, with navigation going bottom tabs, then rail, then sidebar plus command palette. We adopt its shell, routes, inspector and keyboard model. We reject the rest: used alone it feels clinical, the pets and streaks look out of place, and it gives no glanceable home screen, so there would be nothing to open the app to on a phone.

### B. Bento (adopted for Today only, rest rejected)

Everything is a tile you tap, with a floating dock on phones and top pills on wider screens. We adopt tiles for the Today home only. We reject tiles for every domain screen: density is low, so Money and Logic (long lists, tables and ledgers) would need many taps and a lot of scrolling, and every screen would need hand-curated tiles. We also reject the floating dock, which would add a fourth navigation pattern next to the bottom tabs, rail and sidebar and does not fit the container-query nav switch.

### C. Journal (rejected)

The day is one chronological page, with a timeline that merges five data keys by time. We reject it for now. It is the highest build cost and needs per-item timestamps and day-level mood that only partly exist. Its domain screens (Invest, Logic) are the least scannable of the three. Its best use, Apple Pencil handwritten notes, does not need the whole navigation model to change, and stays on the plan as a feature (open decision D17, task R2-19).

### Router and routing variants (rejected)

- react-router: a larger dependency for six tabs and 17 sub-views, with a bundle cost that was not measured. The route table is small enough to own.
- Path URLs (`/life/tasks`) using the History API: 404 on a hard refresh without host rewrites, and they share an origin with `/dsa/*` and `/api/*`. The module API is kept location-agnostic so this stays a cheap change later (open decision D1).
- Keeping tab state and adding routes only for deep links: it leaves two sources of truth for the active tab and sub-view.

## Open items (not decided by this ADR)

- D1, D4, D5 and D15 are on their defaults (hash URLs, 4 Money views, inspector from 1024px, cream synced in settings). If the user changes one, update the matching errata row and this ADR together.
- The exact tile list and tile sizes for Today (task B3-12 and following), and the Level formula (ADR-0004), are decided there.
- The final inspector width and the list pane minimum width are tuned in R1-06 and R1-08 against real devices.
- Whether `useSynced` replaces `useHydrate` is a sync v2 question (P3), not part of this ADR (errata E-21). There is no repo-wide folder refactor.
