# B1 report: blueprint requirements and learning track

Refs: BT = docs/plan/blueprint.txt, BH = docs/forge-blueprint.html, SW = docs/plan/swarm.json. Line numbers verified 2026-11-12.

## Summary

- 44 requirements consolidated (table under Facts), resolved to the hybrid (A shell + B Today). 30 must, 12 should, 2 could. Per phase: P0 16, P1 5, P2 9, P3 6, P4 4, P5 3, cross-phase 1.
- 55 concepts extracted from BH:995-1049 into B1-concept-phase-map.json. Graph is acyclic and no prerequisite sits in a later phase. But 4 concepts are scheduled later than the phase that needs them (flags, testpyr/e2e, ci, csp).
- Blueprint has 22 contradictions or gaps (numbered under Gaps). The ones that change build tasks: the sync v2 `rev identity` column never bumps on update, `container-type` makes fixed-position UI relative to the app root, rail is 64px in the A mock but 72px in the spec, the inspector starts at 1024 in the A mock but 1280 in the spec, and a new `Today` tab collides with the existing `Today.jsx` and the `Today` sync key.
- Repo facts in SW verified correct except: 18 (not "20+") :hover rules, the FAB is `bottom: 80px` (the `calc(64px + safe-area)` is the toast stack), and node_modules is absent (package.json:12-26 lists deps only).
- Proposed 12 docs/process tasks (B1.tasks.json). They write only new files under docs/ and scripts/plan/, except 2 README.md edits (chained). Nothing blocks. User decisions are listed under Needs from the user.

## Facts

### Verified repo facts
- Tabs are state, default Life, no router: src/App.jsx:51 `useState('Life')`, TABS at :15-21 (5 entries), conditional render :280-284, tab-bar :288-300.
- Themes: 6 (ocean default in :root, plus forest, sunset, grape, rose, sky): src/styles.css:1-50, src/App.jsx:23-30.
- CSS is 1139 lines, 1 @media (prefers-reduced-motion) at src/styles.css:1112, zero width breakpoints. max-width 640px at :108 (.app), :157 (.tab-bar-inner), :842 (sheet).
- :hover rules: 18, none guarded (src/styles.css:274,283,292,295,302,338,364,399,482,500,563,668,702,729,757,785,923,969). No :focus-visible anywhere.
- Hard-coded nav height: src/styles.css:624 toast-stack `bottom: calc(64px + env(safe-area-inset-bottom))`; :738 FAB `bottom: 80px; right: max(16px, calc((100vw - 640px) / 2 + 16px))` (viewport based, not container based).
- 17 synced keys: src/store.js:59-63. KEY_TO_TAB maps `progress`->'Today', examProgress->'Exams', puzzleProgress->'Puzzles' (src/App.jsx:35-44); these are sub-view ticks of Logic, not tabs.
- Sub-views today: Life 5 (tasks, reminders, notes, habits, growth; src/tabs/Life.jsx:35-45), Logic 3 (code, puzzles, exams; src/tabs/LogicBuilding.jsx:8-12) plus an external link to /dsa/mastery-map.html (:75), Money 5 (overview, txns, budget, goals, loans; src/tabs/Expenses.jsx:420-426), Invest 3 (src/tabs/Invest.jsx:11-15), Agents 1. Total 17.
- Notes live inside Life: `{view === 'notes' && <Notes .../>}` src/tabs/Life.jsx:230. There is no Notes tab.
- Sync: decideSync compares whole-key updatedAt (src/sync/logic.js:16-34); push debounce 700ms (src/sync/engine.js:61); `__pre_sync_backup` written at src/sync/engine.js:114; table kv_store (src/store.js:22,31).
- No service worker, no vercel.json, no .github/ (checked with ls/grep). Manifest has a single inline-SVG emoji icon, theme/background #0a0c10 (public/manifest.json:8-16). index.html:5 has viewport-fit=cover.
- /api/agent is gated by OWNER_USER_ID and returns 403 otherwise (api/agent.js:12,23). No Access-Control-Allow-Origin header in api/ (grep empty).
- Wallet and pets exist: earnings() src/life/logic.js:92, petState :125, multiplier :60, `nextMultiplierIn` :119, MILESTONES :27. Wallet is a virtual rupee total from habit check-ins (src/tabs/Life.jsx:160,185-187), not money spent.
- No Level/XP code: grep for Level|XP returns nothing in src/. `useSynced` (BH:965,1007) does not exist in src/; the real hook is src/useHydrate.js.
- Existing "Phase" vocabulary clashes: README.md:74-77 "Phase 2: quant engine / Phase 3: RSS digests", docs/superpowers/plans/2026-08-28-forge-phase1.md. The blueprint's P0-P5 are different things.
- Tests: 11 files in test/, including test/planLint.test.js. `npm test` = node --test "test/*.test.js" (package.json:10).

### Blueprint facts used
- Breakpoints and nav table: BT:34-38. Shell CSS: BT:42-61. Playwright matrix: BT:64-69. Delivery options: BT:73-80. Sync v2 DDL: BT:96-106. Decision table: BT:110-118. Design comparison: BT:135-143. Roadmap bars are drawn by JS (BH:978-989), not present in BT: weeks 0-2 P0, 1.5-4.5 P1, 2.5-6 P2, 5.5-8 P3, 0-10 P4, 7.5-10 P5 (total 10 weeks, "rough solo estimate").
- Concept data: 55 lines in `const RAW` (BH:995-1049): 11 level-1, 32 level-2, 12 level-3; categories ui 11, data 10, pwa 6, web 5, nat 5, ops 5, ai 5, be 4, sec 4.
- Hybrid tile widths in B mock: w1/w2/w3/wf = span 1/1/2/2 (2 col), 1/2/3/4 (4 col), 2/3/4/6 (6 col): BH:623,638,646-647. B header pills "Lv 7" and wallet: BH:1513. Mock keyboard list: N, Cmd+K, Cmd+1-6, X: BH:1505.

### Requirements (hybrid-resolved). Pri: M must, S should, C could
| ID | Requirement | Ref | Pri | Ph |
|---|---|---|---|---|
| REQ-01 | One shell switched by `@container app` on the app root (`container: app / inline-size`), never by device name; correct in Slide Over/Split View | BT:32,42-45 | M | P0 |
| REQ-02 | <600 bottom tabs; 600-1023 72px icon rail; >=1024 labelled sidebar (use 220px) | BT:35-37 | M | P0 |
| REQ-03 | Six destinations: Today (new, first, default), Life, Logic, Money, Invest, Agents | BH:1368, BT:143 | M | P0 |
| REQ-04 | One route per screen (`/life/tasks`), deep links, back/forward, selection survives rotate | BT:62,69 | M | P0 |
| REQ-05 | Command palette Cmd/Ctrl+K (tabs, tasks, notes); shortcuts Cmd/Ctrl+1..6, N new, X complete | BT:38; BH:1505 | M | P0 |
| REQ-06 | Domain screens: dense list/blocks + right focus inspector from >=1024 (hybrid); phone: detail as sheet; 600-1023: side sheet | BT:35-38; SW decision | M | P0 |
| REQ-07 | All 17 sub-views reachable by URL: life 5, logic 4 (incl. DSA map), money 4-5, invest 3, agents 1 | BH:1369-1375 | M | P0 |
| REQ-08 | Today = bento grid 2->4->6 cols: streak, wallet, pets, code ring, tasks, spend donut, mood, tutor prompt, watch tile; level + wallet pills in header; no floating dock | BH:1468-1478,1513 | M | P0 |
| REQ-09 | Level/XP derived from existing streak/earnings data; no new synced key; pure + unit-tested | BT:142 | M | P0 |
| REQ-10 | Keep 6 data-accent themes, add cream as 7th; pastel tile tokens defined for dark and light | SW decision | M | P0 |
| REQ-11 | Hover only under `(hover:hover) and (pointer:fine)`; 44px targets under `(pointer:coarse)`; 36px dense rows on desktop | BT:58-59,38 | M | P0 |
| REQ-12 | Global `:focus-visible` ring; logical Tab order; palette and inspector keyboard reachable | BT:22,60,69 | M | P0 |
| REQ-13 | FAB, toast stack, sheets offset by `--tabbar-h`, 0 when rail/sidebar active; remove all `640px` / `100vw` assumptions | BT:19,61 | M | P0 |
| REQ-14 | Preserve safe-area insets, 100dvh, reduced-motion, lazy tabs | BT:24-30 | M | P0 |
| REQ-15 | DSA mastery map stays standalone but opens from Logic and keeps session sync | BT:20 | S | P0 |
| REQ-16 | Tutor tile and watch tile deep-link into Agents and Invest>Watchlist | BH:1476-1477 | S | P0 |
| REQ-17 | Manifest with real PNG icons (192/512/maskable), apple-touch-icon, standalone, theme colour | BT:75; BH:1011 | M | P1 |
| REQ-18 | Service worker: precache shell, stale-while-revalidate assets, never cache authenticated /api | BH:1013 | M | P1 |
| REQ-19 | Offline: app opens, reads and writes in airplane mode; reads/writes never wait on network | BT:82 | M | P1 |
| REQ-20 | New-version update UX (prompt, no mid-edit reload) | BH:1012 | S | P1 |
| REQ-21 | Rate limit /api/agent per user/minute; Cache-Control on /api/puzzle, /api/quote | BH:1029-1030 | S | P1 |
| REQ-22 | Sync v2 per-record tables with tombstone, device_id, user_id; kv_store kept as backup | BT:96-106,114 | M | P2 |
| REQ-23 | Delta pull by monotonic cursor | BT:105 | M | P2 |
| REQ-24 | Hybrid logical clock (wrong device clock cannot win forever) | BT:94; BH:1020 | S | P2 |
| REQ-25 | Local outbox, client-generated ids, replay on reconnect with backoff+jitter; foreground fallback (no iOS Background Sync) | BH:1014,1023-1024 | M | P2 |
| REQ-26 | Per-item saved-locally / synced / failed indicator | BH:1018 | S | P2 |
| REQ-27 | RLS on every new table (`auth.uid() = user_id`); anon key only in bundle | BT:113; BH:1032 | M | P2 |
| REQ-28 | One-time migration kv_store -> rows, per key, flag-gated, reversible | BT:114; BH:1026,1044 | M | P2 |
| REQ-29 | Supabase free-tier keep-alive and periodic JSON export, restore drill | BT:113; BH:1034 | M | P2 |
| REQ-30 | Sync v2 covers all 17 keys, including non-list keys (settings, progress, moodLog) | BT:104 ("same shape...") | M | P2 |
| REQ-31 | Platform adapter (storage/notify/haptics/pencil), web impl and Capacitor impl | BT:118 | M | P3 |
| REQ-32 | Capacitor iOS/iPadOS shell from the same build | BT:76 | M | P3 |
| REQ-33 | Absolute API base + CORS for capacitor:// origin; Groq key never in bundle | BT:117 | M | P3 |
| REQ-34 | Push, Keychain token, haptics; Face ID before money screens | BH:1015,1036 | S | P3 |
| REQ-35 | Pencil handwritten notes (Pointer Events pressure, separate `drawings` key) | IDEAS.md:3-22; BH:1039 | S | P3 |
| REQ-36 | Deep links, share sheet, widget | BH:1037 | C | P3 |
| REQ-37 | Playwright matrix of 5 projects with listed assertions | BT:64-69 | M | P4 |
| REQ-38 | CI on push: npm test + build + preview URL; failing check blocks merge | BH:1042 | M | P4 |
| REQ-39 | Error tracking, sync-failure counter, API latency | BH:1043 | S | P4 |
| REQ-40 | Strict CSP, escaped note rendering | BH:1033 | S | P4 |
| REQ-41 | New pure logic (level, router parse, HLC, outbox) has node --test coverage | BT:109 | M | all |
| REQ-42 | SSE streaming for /api/agent | BT:117; BH:1047 | S | P5 |
| REQ-43 | Notes RAG (pgvector), injection-safe retrieval | BH:1048 | C | P5 |
| REQ-44 | Eval set for tutor prompts | BH:1049 | S | P5 |

### Learning track: what to know before each phase starts
Ordering check: 0 cycles, 0 prerequisites in a later phase. "Earlier" = taught by an earlier phase (so done if the track is followed). "Up front" = no earlier phase teaches it. "Pull forward" = my inference of concepts the plan needs sooner than the blueprint assigns.
| Phase (n concepts) | Prereqs taught by earlier phase | Learn up front | Pull forward (Inference) |
|---|---|---|---|
| P0 (12) | none | http, evloop, css | state, split (router + panes), testpyr+e2e (P0 gate screenshots) |
| P1 (13) | evloop, css, touch, react, http, serverless | none | csp (SW caches notes HTML), ci (merge gate) |
| P2 (12) | react, evloop, sw, idb, state, http, auth | none | flags (sync v2 is flag-gated), testpyr (lost-edit test) |
| P3 (7) | sw, manifest, lamport, react, touch | none | none |
| P4 (6) | http, resp, serverless | testpyr | none (but whole phase runs wk 0-10 in BH:984) |
| P5 (5) | proxy, ratelimit, http, pgmodel, testpyr | prompt | none |

## Gaps and contradictions
1. Nav "5 tabs" (BT:35) vs six destinations incl. Today (BH:1368, BT:143). Bottom bar at 390px needs 6 equal slots; current `.tab-btn` is `flex: 1 0 64px` with horizontal scroll (src/styles.css:165).
2. Rail width: 72px in table and shell CSS (BT:36,48), 64px in the A mock (BH:592). Sidebar: 220px (BT:37,51; BH:296) vs 216px (BH:598). Use 72 and 220.
3. Inspector start: table says 2 panes at 1024-1279 and 3 panes only at >=1280 (BT:37-38,53); the A mock has the 300px inspector from 1024 and nothing new at 1280 (BH:598-600); hybrid says >=1024. Table and shell CSS also say "master list + detail pane", the mock says "list + focus inspector": these are different layouts.
4. Phase naming: BT:75-76,80 "Phase 1 / Phase 3" in 2.1 vs P0-P5 in 2.7. Numbers agree (PWA=1, Capacitor=3) but 2.1 has no Phase 0, and the repo already uses "Phase 2/3" for unrelated features (README.md:74-77).
5. Capacitor origin vs relative `/api/*` (BT:117 vs src/tabs/Agents.jsx:54, Invest.jsx:435, Today.jsx:37): needs absolute base URL plus CORS; no CORS headers exist in api/. Also vercel.json is absent so there is no header config to extend.
6. Hover guard: shell CSS guards only `.row:hover` (BT:58) and says nothing about the new A/B components (inspector rows, tiles, palette items, rail buttons). All 18 existing rules plus every new component rule need the guard; BT gives no rule for tiles that animate on hover.
7. Audit claims: "20+ :hover rules" (BT:21) is 18 rules; "FAB offset is calc(64px + safe-area)" (BT:19) is the toast stack (src/styles.css:624), the FAB is `80px` (:738).
8. BT:61 sets `.fab` via `--tabbar-h`, but the design mocks size their own FABs (BH:287 `bottom:78px`, BH:581 `bottom:70px`); three different numbers.
9. `container-type: inline-size` applies layout containment, which makes `.app-root` the containing block for `position: fixed` descendants (FAB, toast stack, sheet, bottom tabs). Blueprint treats them as viewport-fixed (BT:42,61). Inference: needs a verified plan (put fixed UI outside the container, or accept container-relative fixed).
10. Sync v2 DDL: `rev bigint generated always as identity` (BT:105) only increments on INSERT, so a delta pull `where rev > last_seen_rev` never sees updates or tombstones. Needs a trigger or sequence bumped on every write; and identity is per table, so one cursor per table.
11. Sync v2 DDL has no HLC column although 2.4 and 2.6 promise HLC (BT:94,115); the comment says "server clock wins ties" which is a different rule from the HLC rule.
12. DDL shows list entities only ("tasks... same shape for habits, expenses, loans, goals, notes", BT:104). Keys with different shape need their own decision: settings (object), progress/examProgress/investProgress/puzzleProgress (maps keyed by id), moodLog (date-keyed), watchlist, checklists (src/store.js:59-63).
13. "every keystroke-level save re-uploads the entire expenses blob" (BT:93): saves are debounced 700ms (src/sync/engine.js:61), so it is per-edit, not per-keystroke.
14. Free-tier pause mitigation (keep-alive, JSON export, BT:113) has no owner in 2.7 or the concept map beyond `backup` P2; keep-alive needs a scheduler (Vercel cron or external) that does not exist (no vercel.json, no .github/).
15. Level/XP (BT:142) is undefined: mock shows "Lv 7" with a 12-day streak and best 21 (BH:1470,1513); no formula in blueprint. The wallet pill (BH:1513) shows the same number as "Spent today" (BH:1396 STATS.home, 1240), so two meanings of "wallet" (virtual habit currency vs money) are conflated.
16. 17 sub-views: counts match but composition differs. Blueprint has Spend/Budgets/Goals/Loans + DSA map (BH:1369-1373); repo has Overview/Txns/Budget/Goals/Loans (5) and DSA is a link not a view (src/tabs/LogicBuilding.jsx:75). Money has 5 in code, 4 in mock.
17. Name collisions for the new tab: `src/tabs/Today.jsx` (Codeforces practice, imported by LogicBuilding.jsx:2), `syncTicks.Today`, KEY_TO_TAB value 'Today' (src/App.jsx:36). Tab id for the new home needs a different identifier (e.g. `Home`).
18. Concept map vs roadmap: P1 concepts proxy, ratelimit, cdn, auth, debounce (BH:1024,1028-1031) are backend/sync topics, but the P1 roadmap row is only "manifest, SW precache, offline shell, install" (BH:981). P0 row (BH:980) omits Today home, command palette, inspector, 7th theme, though the hybrid needs them in 2 weeks.
19. Roadmap overlap: P1 and P2 overlap 2 weeks (BH:981-982) while `bgsync`/`outbox` need `sw` (P1); P4 spans weeks 0-10 (BH:984) yet WORKFLOW treats it as a final phase (docs/plan/WORKFLOW.md phases table). Phase gates in WORKFLOW (P0 responsive matrix) need Playwright, which the blueprint places in P4.
20. blueprint.txt is lossy: omits the 2.7 roadmap bars, the RAW concept table, the design mock data and the lab text (BT:119,123,126). Anyone using only blueprint.txt misses weeks, concept phases and shortcut list.
21. Architecture figure shows feature folders `life/ logic/ money/ invest/ agents/` and a `useSynced(key)` hook (BH:965) but the repo has `src/tabs/*.jsx` plus `src/{life,money,invest}/logic.js` and no useSynced. Not a P0 blocker, but "one folder per tab" is a refactor nobody scheduled.
22. Matrix (BT:64-69) has no WebKit/Safari engine statement, no offline, install or two-device check; "FAB clears home indicator" is only testable with env() insets that Playwright does not emulate.

## Risks
- Fixed-position UI breaks when `container-type` is added (gap 9). Mitigation: first P0 task spikes the shell on a branch with FAB, toast, sheet and checks them in Chromium and WebKit before other tasks build on it.
- Sync v2 delta cursor misses updates (gap 10); migration could drop data. Mitigation: ADR before code, trigger-based `rev`, keep kv_store and `__pre_sync_backup`, flag-gated per-key migration, restore drill in the DoD.
- Two-week P0 estimate (gap 18) is for a shell, router, palette, inspector, 7th theme and Today. Mitigation: plan treats P0 as multiple waves; do not pre-promise the 10-week total.
- Same files edited by many tasks (src/styles.css, src/App.jsx, package.json, vite.config.js): merge conflicts. Mitigation: single owner per wave, as WORKFLOW rule 2 says; my README edits are chained.
- Capacitor build calls relative `/api` and gets no CORS headers (gap 5); Groq key leak if someone "fixes" it by calling Groq directly. Mitigation: ADR-0002 fixes API base + allow-list CORS only for the app origin; gate stays in /api/agent.
- Supabase free project pauses (BT:113) and there is no job to prevent it; the owner could lose access mid-project. Mitigation: runbook task plus user-run scheduler.
- Service worker caching authenticated /api or stale JS can serve old data after deploy. Mitigation: never-cache rule in REQ-18 acceptance, update prompt (REQ-20).
- Learning-track ordering gaps (flags, testpyr, ci before the phases that need them) let tasks start without the knowledge; mitigation: pull-forward column above feeds each phase's gate.

## Write-set map
Contention hot spots for the whole build (my area touches none of them in code): src/styles.css (1139 lines, every responsive/theme/Today task), src/App.jsx (router, tab list, Today, palette mount), package.json and package-lock.json (router lib, vite-plugin-pwa, Playwright, Capacitor), vite.config.js (PWA plugin, API plugin CORS), index.html, public/manifest.json.
B1 files (all new unless noted):
- docs/plan/blueprint-errata.md; docs/adr/0001..0004-*.md and docs/adr/README.md; docs/qa/definition-of-done.md; docs/learning/concept-phase-map.json and docs/learning/learning-track.md; scripts/plan/learning-track.mjs; test/learningTrack.test.js; docs/runbooks/supabase-free-tier.md, docs/runbooks/ios-release.md.
- Edited: README.md only (B1-10 then B1-11, chained). IDEAS.md and docs/superpowers/ untouched.
- Hot spot inside my area: README.md (every phase wants a section) and docs/adr/README.md (index, single owner).
- Convention note: the repo has no docs/adr/; existing design docs are docs/superpowers/specs/YYYY-MM-DD-*-design.md. I propose docs/adr/ because decisions must outlive a spec per feature; user may veto.

## Needs from the user
- Level/XP formula: confirm or replace. Illustrative fit (Inference): `level = max(1, floor(sqrt(totalEarned/25)))` where totalEarned is the sum of earnings(habit).total; this gives Lv 7 for the mock's 1240. Alternative: level from streak milestones.
- Wallet meaning on Today: virtual habit wallet only, or also show real spend (mock mixes both at 1240).
- Whether Habits and Growth sub-views also use B tiles (open item in SW); my recommendation is yes for Habits (pets) only, others stay A lists.
- Money sub-views: keep 5 as in code (Overview/Txns/Budget/Goals/Loans) or merge to the mock's 4.
- Apple Developer Program account ($99/yr, BT:76), Mac with Xcode and iOS/iPadOS device list and OS versions, before P3.
- Supabase dashboard actions: run migrations, enable RLS, choose a scheduler for keep-alive; Vercel project access for preview deploys and env vars.
- Real icon artwork (192/512/maskable PNG) or approval to generate from the emoji.
- Confirm docs/adr/ convention and the 12 B1 tasks.

## Proposed tasks
Matches docs/plan/research/B1.tasks.json (12 tasks: 9 S, 3 M).

### Definition of done (run on the deployed build; each item pass/fail)
Responsive matrix (Playwright projects BT:64-69, plus manual check on real devices)
- [ ] iPhone 390x844: 6 bottom tabs, no horizontal scroll, FAB and toast clear tab bar and home indicator.
- [ ] iPad 834x1194: 72px rail, tabs hidden, no sticky hover after tap, targets >=44px.
- [ ] iPad 1194x834: labelled sidebar + list + inspector; rotate to portrait and back keeps route and selected item.
- [ ] iPad Split 1/3 (~375px) and Slide Over: phone shell appears (container, not device).
- [ ] Desktop 1440x900: Cmd/Ctrl+K opens palette, Cmd+1..6 switch, N creates, X completes, focus ring visible, Tab order sane.
- [ ] Today shows 9 tiles at 2, 4 and 6 columns; all 7 themes pass visual check in dark and light.
- [ ] All 17 sub-views open by URL (paste into a new tab, refresh) and via palette.
Offline and install
- [ ] Lighthouse PWA/installable passes; Add to Home Screen on iPhone and iPad shows real icon, standalone, no browser chrome.
- [ ] Airplane mode: cold start of installed app loads shell; add task, log expense, check in habit all persist.
- [ ] Deploy a new build: update prompt appears, accepts, no data loss; authenticated /api responses are not in Cache Storage.
Sync (two devices)
- [ ] Offline on both, edit different tasks on A and B, reconnect: both edits survive on both devices.
- [ ] Delete on A, edit another item on B: deleted item stays deleted, no resurrection.
- [ ] Device with clock set 1 day ahead does not overwrite newer edits.
- [ ] Migration rehearsal on a copy of production data: row counts per key equal, kv_store and `__pre_sync_backup` still restorable; JSON export restores into a fresh project.
- [ ] RLS: a second user with the anon key reads zero rows.
Native
- [ ] TestFlight build installs on iPhone and iPad, sign-in works, data syncs with the PWA.
- [ ] /api calls succeed from capacitor origin; Groq key absent from the bundle (grep dist and IPA).
- [ ] Push reaches an installed device; token is in Keychain; Face ID gates Money (if shipped).
Quality and ops
- [ ] `npm ci && npm test && npm run build` green in CI on the merge commit; preview URL posted on PR.
- [ ] Playwright matrix green in CI; error tracking shows a forced test error; sync-failure counter increments on a forced failure.
- [ ] CSP header present; a note containing `<script>` renders inert.
- [ ] README and ADRs updated; docs/plan/blueprint-errata.md has no open item.

### Tasks
- B1-01 (S) Write blueprint errata with canonical numbers (72/220, 6 tabs, inspector >=1024, 18 hover rules, FAB 80px, Today naming).
- B1-02 (S) ADR-0001 hybrid shell and Today (container strategy, routes, inspector, level source).
- B1-03 (S) ADR-0002 delivery path: PWA then Capacitor, API base URL and CORS.
- B1-04 (S) ADR-0003 sync v2 design decisions (rev bumping, HLC, key coverage, migration, flag).
- B1-05 (S) ADR-0004 Level/XP derivation (needs user answer first).
- B1-06 (S) ADR index docs/adr/README.md.
- B1-07 (S) Definition-of-done checklist doc (list above).
- B1-08 (M) Learning-track script, validation test and rendered doc from the concept map.
- B1-09 (S) Supabase free-tier runbook (keep-alive, export, restore drill).
- B1-10 (M) README update after P0 (layout, routes, shortcuts, themes, tests).
- B1-11 (M) README update for PWA, sync v2 and native (after P1-P3).
- B1-12 (S) iOS release runbook (signing, TestFlight, API base).
