# Definition of done for the deployed build

Task B1-07. Run this checklist against the deployed build (the Vercel production or preview URL), not against the dev server. Every item is a checkbox with a pass condition and a fail condition. An item is done only when someone has run it and seen the pass condition. Nothing in this file is pre-ticked.

Sources: docs/plan/research/B1-report.md (definition of done), docs/plan/blueprint.txt (matrix, lines 64-69), docs/plan/blueprint-errata.md (canonical numbers C-1 to C-12, E-22), docs/plan/OPEN-DECISIONS.md (D1 to D17, defaults assumed).

## How to use this file

- Tick a box (`- [x]`) only after you saw the pass condition on the deployed build. Write the date and build id (commit sha or Vercel deployment id) beside it.
- Items tagged **[OWNER CHECK]** cannot be verified by an agent or by CI. They need a real device, the Vercel dashboard, the Supabase dashboard or an Apple account. An agent may prepare the steps, but must leave the box unticked until the owner reports the result.
- Items tagged **[AUTO]** have a command an agent or CI can run. A green command is the pass condition. Playwright runs Chromium only (E-22), so a green matrix says nothing about WebKit or Safari.
- Playwright projects are defined in `playwright.config.js`: `iphone-14`, `ipad-portrait`, `ipad-landscape`, `ipad-split-third`, `desktop-chrome`, `pwa`. Specs live in `e2e/matrix/` and `e2e/pwa.spec.js`. Some specs may not exist yet while the plan is in progress; a missing spec means the item stays unticked, not that it passes.
- Defaults assumed for open decisions (D1 to D17): hash router (`#/life/tasks`), inspector from 1024px container width, Level never decreases, Habits as dense rows, Money merged to 4 views (overview, budget, goals, loans), cream theme synced in settings. If the owner changes a decision, update the affected item.
- Layout is chosen by container width, never by device name (C-6). Breakpoints: below 600px bottom tabs, 600 to 1023px 72px rail, 1024px and up 220px sidebar plus list plus inspector (C-1, C-2, C-4, C-5).

## Responsive matrix

Automated: `npx playwright test --project=iphone-14 --project=ipad-portrait --project=ipad-landscape --project=ipad-split-third --project=desktop-chrome` (the config builds and serves the e2e build on port 4173). Playwright reports `env()` safe-area insets as 0, so home-indicator clearance is checked by arithmetic on the CSS variable in CI and on a real device by the owner.

- [ ] **[AUTO]** iPhone 390x844 (project `iphone-14`, touch): 6 bottom tabs visible (Today, Life, Logic, Money, Invest, Agents), no horizontal scroll (`document.documentElement.scrollWidth <= innerWidth`), tab bar does not scroll sideways. Fail: fewer or more than 6 tabs, a scrollbar, or a clipped tab label.
- [ ] **[AUTO]** iPhone 390x844: the FAB and the toast stack sit above the tab bar (their bottom edge is at or above the tab bar top edge), and their offset comes from the `--tabbar-h` token, not a literal pixel value. Fail: any overlap with the tab bar.
- [ ] **[OWNER CHECK]** Real iPhone, installed or in Safari: FAB and toast clear both the tab bar and the home indicator, with no content hidden behind the indicator in portrait or landscape. Fail: any control is covered or unreachable.
- [ ] **[AUTO]** iPad portrait 834x1194 (project `ipad-portrait`, touch): 72px rail visible, bottom tabs hidden, every tap target at least 44px in height and width. Fail: tabs and rail both visible, or any target below 44px.
- [ ] **[OWNER CHECK]** Real iPad portrait: tapping a row or button leaves no sticky hover highlight afterwards. Fail: a highlight stays after the finger lifts. (Hover rules must be inside `(hover: hover) and (pointer: fine)`, see E-06.)
- [ ] **[AUTO]** iPad landscape 1194x834 (project `ipad-landscape`, touch): 220px labelled sidebar plus list plus inspector visible; selecting a row shows it in the inspector. Fail: no inspector, or sidebar not labelled.
- [ ] **[OWNER CHECK]** Real iPad: rotate portrait to landscape and back with an item selected; the route and the selected item are unchanged after each rotation. Fail: the route resets or the selection is lost.
- [ ] **[AUTO]** Narrow window about 375x1024 (project `ipad-split-third`): the phone shell appears (bottom tabs, no rail). Fail: rail or sidebar shown.
- [ ] **[OWNER CHECK]** Real iPad Split View one third and Slide Over: the phone shell appears and nothing overflows horizontally. Fail: the layout follows the device instead of the window width.
- [ ] **[AUTO]** Desktop 1440x900 (project `desktop-chrome`, mouse): Cmd/Ctrl+K opens the command palette, Cmd/Ctrl+1 to 6 switch tabs, N creates, X completes the selected item, the focus ring is visible on every focusable control, and Tab order follows visual order. Fail: any shortcut does nothing, or focus is invisible.
- [ ] **[AUTO]** Today shows 9 tiles at 2, 4 and 6 columns, with no overlap and no clipped text, at 390px, 834px and 1440px viewports. Fail: any other tile count or any overlap.
- [ ] **[OWNER CHECK]** All 7 themes (including cream) are legible in dark and in light on a real phone and on a desktop browser: text contrast, borders, FAB, tab bar, inspector. Fail: any unreadable text or invisible control in any combination.
- [ ] **[AUTO]** All 17 sub-views (Life 5, Logic 4, Money 4, Invest 3, Agents 1) open when their hash URL is loaded in a fresh page and after a reload, and also open from the palette. Fail: any 404, blank page, or redirect to Today.

## Offline and install

Automated part: `npx playwright test --project=pwa` (the only project where the service worker registers). Lighthouse and all install and offline steps on real devices are owner checks.

- [ ] **[AUTO]** Web manifest is served from the deployed origin with name, 192px, 512px and maskable icons, `display: standalone`, and a service worker registered; Lighthouse installability check reports no failures. Fail: any installability failure listed by Lighthouse. Record the Lighthouse version used.
- [ ] **[OWNER CHECK]** Add to Home Screen on a real iPhone and a real iPad: the real app icon appears (not a screenshot or blank tile), the app opens standalone with no Safari chrome. Fail: wrong icon, or browser chrome visible.
- [ ] **[OWNER CHECK]** Airplane mode, cold start of the installed app (force quit first): the shell loads. Fail: blank screen or browser offline page.
- [ ] **[OWNER CHECK]** Still offline: add a task, log an expense, and check in a habit. Fully close and reopen the app (still offline): all three are still there. Fail: any of the three lost.
- [ ] **[OWNER CHECK]** Deploy a new build while the installed app is open: an update prompt appears, accepting it loads the new build, and no task, expense, habit or note is lost. Fail: no prompt, a stuck old version after accepting, or any data loss.
- [ ] **[AUTO]** After using the app online, Cache Storage contains no authenticated `/api/*` response (inspect `caches` in the pwa project, or DevTools Application tab). Fail: any `/api/` entry in any cache.

## Sync two devices

All items need two real signed-in clients (for example an iPhone and a desktop browser) against the real Supabase project, so they are owner checks. Do not run the migration rehearsal or any SQL against the live project without the owner's approval (D16). The cutover steps live in `docs/runbooks/sync-v2-cutover.md` and `docs/runbooks/supabase-free-tier.md`.

- [ ] **[OWNER CHECK]** Both devices offline. Edit task X on device A and a different task Y on device B. Reconnect both. Pass: both edits are present on both devices. Fail: either edit is lost.
- [ ] **[OWNER CHECK]** Delete task X on device A while device B edits task Y; sync both. Pass: X stays deleted on both and Y keeps the edit. Fail: X reappears.
- [ ] **[OWNER CHECK]** Set one device's clock one day ahead, make an old edit, then sync. Pass: that device does not overwrite a newer edit made on the other device. Fail: the newer edit is replaced.
- [ ] **[OWNER CHECK]** Migration rehearsal on a copy of production data (a separate Supabase project, per D11): row counts per key are equal before and after, `kv_store` and `__pre_sync_backup` are still present and restorable. Fail: any count differs or either backup is missing or unreadable.
- [ ] **[OWNER CHECK]** JSON export from the app restores into a fresh Supabase project and the restored data matches the original (spot check each synced key). Fail: any key missing or different.
- [ ] **[OWNER CHECK]** Row level security: sign in as a second user (or use only the anon key without a session) and query the synced tables. Pass: zero rows from the owner's data. Fail: any row returned.

## Native

Needs an Apple Developer account, a Mac with Xcode and real devices (D13). Until those exist, every item here stays unticked and nothing here can be verified by an agent.

- [ ] **[OWNER CHECK]** A TestFlight build installs on a real iPhone and a real iPad, sign-in works, and data created on the PWA appears in the native app and the other way round. Fail: install, sign-in or sync fails on either device.
- [ ] **[OWNER CHECK]** From the Capacitor origin, `/api/*` calls succeed through the absolute API base (`VITE_API_BASE`) with the CORS allow-list, and an origin not on the list is rejected. Fail: any CORS error from the app origin, or a response to a foreign origin.
- [ ] **[AUTO]** The Groq key is absent from the web bundle: after `npm run build`, `grep -rIl "GROQ" dist/` returns nothing, and a search for the real key value (taken from the owner's environment, never pasted into this file) also returns nothing. Fail: any match. (The same search on the extracted IPA is an **[OWNER CHECK]** and must also return nothing.)
- [ ] **[OWNER CHECK]** If shipped: a push notification reaches an installed device, the push or auth token is stored in the Keychain (not localStorage), and Face ID gates the Money tab. If a feature is not shipped, write "not shipped" beside the item instead of ticking it.

## Quality and ops

- [ ] **[AUTO]** `npm ci && npm test && npm run build` is green in CI on the merge commit, and the preview URL is posted on the PR. Fail: any red step or no preview link. (The CI run and the preview deployment are visible only in GitHub and Vercel, so confirming them is an **[OWNER CHECK]** unless the agent can read the CI result directly.)
- [ ] **[AUTO]** The Playwright matrix (`npx playwright test`) is green in CI with Chromium. Fail: any failed or skipped-by-accident project. Note in the sign-off that WebKit is covered only by the owner device items above.
- [ ] **[OWNER CHECK]** Error tracking shows a deliberately forced test error from the deployed build, and the sync-failure counter increments when a sync failure is forced. Fail: no event received, or the counter stays at 0.
- [ ] **[AUTO]** The deployed response carries a `Content-Security-Policy` or `Content-Security-Policy-Report-Only` header (`curl -sI <url>`), and a note containing `<script>alert(1)</script>` is shown as inert text with no script executed. Record which of the two header names is live. Fail: no CSP header of either kind, or any script runs. (Whether the policy is enforced or report-only is a decision to record, not an automatic pass.)
- [ ] **[AUTO]** README and the ADRs in `docs/adr/` describe the shipped behaviour, and `docs/plan/blueprint-errata.md` has no row left with status OPEN that the owner has not accepted by default. Fail: a documented behaviour that differs from the build, or an unaccepted OPEN row.
- [ ] **[OWNER CHECK]** Vercel dashboard shows the production deployment as Ready with the expected environment variables set, and the Supabase dashboard shows the project is not paused. Fail: failed deployment, missing variable, or paused project.

## Sign-off

Fill this in at the end. Leave blank until it is true.

- Build id (commit sha or deployment id):
- Deployed URL:
- Date:
- Items run by an agent or CI:
- Items run by the owner on real devices:
- Items not run, with reason:
