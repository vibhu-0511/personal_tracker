# Forge

A personal daily deliberate-practice app: adaptive Codeforces problems, the Lichess
daily puzzle, local notes, and LLM tutor agents.

## Setup

```bash
npm install
cp .env.example .env   # then paste your Groq API key into .env
npm run dev            # http://localhost:5173
```

Get a free Groq API key at https://console.groq.com (no credit card).

## Environment

| Variable | Required | Default |
|---|---|---|
| `GROQ_API_KEY` | yes (server) | — |
| `GROQ_MODEL` | no | `openai/gpt-oss-120b` |
| `OWNER_USER_ID` | yes (server) | — |
| `ALLOWED_ORIGINS` | no | — |
| `AGENT_RATE_PER_MIN` | no | 20 |
| `AGENT_RATE_PER_DAY` | no | 300 |
| `VITE_SUPABASE_URL` | yes | — |
| `VITE_SUPABASE_ANON_KEY` | yes | — |
| `VITE_API_BASE` | no | empty (same-origin `/api/*`) |
| `VITE_SYNC_V2_KEYS` | no | empty (every key stays on sync v1) |

- `OWNER_USER_ID` is the Supabase user id of the one account allowed to call `/api/agent`.
  If it is unset, the endpoint rejects every request (fail-closed).
- `ALLOWED_ORIGINS` is a comma-separated list of extra browser origins for CORS on `/api/*`.
  It is added to the built-in defaults `capacitor://localhost`, `https://localhost` and
  `http://localhost:5173`.
- `AGENT_RATE_PER_MIN` and `AGENT_RATE_PER_DAY` are the per-user call limits for
  `/api/agent` (positive integers), enforced in `api/agent.js` with a 429 and `Retry-After`.
  Defaults are 20 per minute and 300 per day. If the usage table cannot be read the call is
  allowed through and the error is logged (fail open).
- `VITE_API_BASE` is the absolute API origin for builds that cannot use relative `/api/*`,
  such as the planned Capacitor iOS app. It must be an origin only (no path, no secret).
  When you set it for a native build, `ALLOWED_ORIGINS` has to be changed together with it
  (see `docs/adr/0002-delivery-path.md` and `docs/runbooks/ios-release.md`). The web build
  on Vercel leaves it empty.
- `VITE_SYNC_V2_KEYS` is a comma-separated list of synced keys that should use the sync v2
  engine, for example `puzzleProgress,notes`. Unknown names are ignored. **Leave it empty:
  v2 is not switched on anywhere.** See "Sync v2" below. Like every `VITE_` value it is
  inlined at build time.

Cloud sync (v1) uses a Supabase project. See
`docs/superpowers/specs/2026-09-15-cloud-sync-design.md` for the schema and
the SQL to run once in the Supabase SQL Editor.

## Scripts, tests and CI

Every command below is a script in `package.json` (except where noted).

### `npm run lint`

`eslint .` with `eslint.config.js`: `@eslint/js` recommended plus the two classic React
hooks rules, correctness only (no style rules). `dist/`, `dist-e2e/`, `test-results/`,
`playwright-report/` and `public/` are ignored.

### `npm test`

`node --test "test/*.test.js"`: pure logic, the route table and router, the shortcut
matcher and command registry, the update flow, the bundle-budget maths, the CSP and
`vercel.json` guards and static CSS guards (`test/shellCss.test.js`). No browser and no
network.

### `npm run test:e2e`

Playwright with Chromium only (`playwright.config.js`, specs in `e2e/`). The config starts
its own server: `npm run build:e2e && npm run preview:e2e`, which builds with
`vite build --mode e2e --outDir dist-e2e` (dummy, non-secret Supabase values from
`.env.e2e`) and serves it on `http://localhost:4173`. Locally an already-running server on
that port is reused; in CI it is not.

- Fixtures in `e2e/fixtures/` are hermetic: the app boots signed in against a stubbed
  Supabase, and any request that leaves localhost fails the test. No real credentials or
  database are used.
- Six projects. Five run the matrix specs (`e2e/smoke.spec.js`, `e2e/matrix/`) with the
  service worker blocked: iPhone 14 (390x844), iPad portrait (834x1194), iPad landscape
  (1194x834), iPad split view third (375x1024) and desktop Chrome (1440x900). The sixth,
  `pwa`, is the only one that lets the service worker register and runs only
  `e2e/pwa.spec.js` (SW takes control, offline shell reload, `/api/ics` not answered with
  the app shell).
- These are Chromium emulations of the iOS devices, not WebKit. Real iPhone and iPad
  behaviour (install, offline, update, safe areas) is a manual check and has not been
  verified by any automated job here.
- First run on a machine needs the browser: `npx playwright install chromium` (CI uses
  `--with-deps`). In CI the suite retries once and writes `playwright-report/`, which is
  uploaded as an artifact only when the job fails (kept 14 days).

### `npm run build`, `npm run size`

`npm run build` is the production build (`vite build`) into `dist/`, including the service
worker (`dist/sw.js`) and Workbox runtime.

`npm run size` (`node scripts/ci/bundle-budget.mjs`) gzips every JS and CSS file in
`dist/assets/` and fails when a budget in `scripts/ci/budgets.json` is exceeded. It reads
`dist/`, so run `npm run build` first. Current budgets (1 kB = 1000 bytes, gzip): entry JS
135, Life chunk 62, total JS 280, entry CSS 12. The budgets file notes they are to be
re-baselined at the P0 gate; change numbers there, not in the script.

### `npm run icons`

`pwa-assets-generator` with `pwa-assets.config.js`. It regenerates the PWA icon set in
`public/icons/` from `assets/icon-source.svg` (192 and 512 PNG, the 512 maskable, the 180
Apple touch icon, `favicon.ico`, and a copy of the source as `favicon.svg`). The generated
files are committed, so you only need this when the source SVG changes. Output is
deterministic, so a second run leaves no diff.

### Continuous integration

`.github/workflows/ci.yml` runs on every pull request and on pushes to `master`; a newer
run on the same ref cancels the older one. It has read-only repository permissions and
uses Node 22. Two jobs run in parallel:

| Job | Steps |
|---|---|
| `check` | `npm ci`, `npm run lint`, `npm test`, `npm run build`, `node scripts/ci/check-sw.mjs`, `npm run size`, then `npm audit --audit-level=high` |
| `e2e` | `npm ci`, restore or install the Playwright Chromium (cache keyed on the `@playwright/test` version), `npm run test:e2e`, upload `playwright-report/` on failure |

- `node scripts/ci/check-sw.mjs` is not an npm script. It inspects `dist/` after a build
  and fails unless the precache has `index.html` and the icons but not `dsa/` or
  `puzzles.json`, the navigation fallback denies `/api/` and `/dsa/`, `/api/` and
  `*.supabase.co` are `NetworkOnly`, and `manifest.json` lists the 192, 512 and maskable
  icons with an `id` and `scope`.
- The `npm audit` step is informational: it has `continue-on-error`, so a new advisory
  does not fail the build.
- `.github/dependabot.yml` asks for weekly npm and GitHub Actions update PRs (at most 5
  open each; npm minor and patch updates are grouped).
- To run the same checks locally before pushing:

```bash
npm run lint && npm test && npm run build && node scripts/ci/check-sw.mjs && npm run size
npm run test:e2e
```

> **Needs a user action, not verified:** the workflow file is in the repo, but nothing here
> proves Actions is enabled for the GitHub repository or that it has ever run. Making
> `check` and `e2e` required status checks on `master` is a branch protection setting in
> GitHub that has to be turned on by the repository owner.

## API smoke tests

```bash
curl http://localhost:5173/api/health
curl "http://localhost:5173/api/cf?handle=tourist"
curl http://localhost:5173/api/puzzle
curl "http://localhost:5173/api/quote?symbols=RELIANCE.NS"
curl "http://localhost:5173/api/ics?title=Gym&start=2026-09-15T17:00:00%2B05:30"
```

## Layout

- `api/` — serverless functions (Vercel). Also mounted into the Vite dev server by the
  `forge-api-dev` plugin (`vite-plugins/apiDev.js`, wired in `vite.config.js`), so
  `npm run dev` runs the API too.
- `src/App.jsx` — auth gate, settings panel (Codeforces handle, theme), sync wiring, and
  the route switch that mounts one tab at a time inside the shell. Also owns `TABS` and
  `THEMES`.
- `src/routes.js` — route table and pure path helpers (no React, no DOM).
- `src/router.js` — tiny hash router (`useRoute`, `navigate`, `useSubView`). Only its
  location adapter touches `window`.
- `src/shell/` — the app frame:
  - `Shell.jsx` — frame with nav, top bar, scrolling page, optional inspector slot and toasts.
  - `Nav.jsx` — primary navigation (hash links to the six tabs).
  - `TopBar.jsx` — title and action slot (the settings gear).
  - `Inspector.jsx`, `inspectorContext.js` — inspector pane, with a Sheet fallback when narrow.
  - `CommandPalette.jsx`, `commands.js`, `searchIndex.js` — Cmd/Ctrl+K palette, command
    registry, fuzzy filter.
  - `useShortcuts.js` — global keyboard shortcuts.
- `src/today/` — the Today home (bento grid): `TodayHome.jsx`, `useTodayData.js`,
  `useProgressSummary.js`, nine tiles in `tiles/` (streak, wallet, pets, code, watch,
  tasks, spend, mood, tutor). `src/tabs/Home.jsx` is the thin tab wrapper.
- `src/tabs/` — the other tab screens. `Life.jsx` (tasks, reminders, notes, habits,
  growth) renders the screens in `src/life/screens/`; its pure math (streaks, wallet, pet
  state, quick-add parsing, selectors, view registry) lives in `src/life/`. Money is
  `src/money/`, Invest is `src/invest/`.
- `src/ui/` — shared presentational components (Tile, Row, Pill, Chip, Ring, Bar, Spark,
  SubNav, Kbd, ...), with a gallery page (`gallery.html`).
- `src/styles.css` — legacy global styles and the accent theme blocks. `src/styles/` holds
  the shell-era CSS (`tokens.css`, `shell.css`, `nav.css`, `inspector.css`, ...).
  `tokens.css` is imported after `styles.css`, so its tokens and the cream overrides win.
- `src/store.js` — IndexedDB wrappers, synced to Supabase (`src/supabaseClient.js`,
  `src/sync/logic.js`, `src/sync/engine.js`). Local-first: reads/writes never block on network.
  `src/sync/router.js` sends each key to the v1 engine (default) or the v2 engine
  (`src/sync/engine2.js`) according to the flags in `src/sync/migrate.js`.
- `src/backup/` — JSON export and import of every synced key (`backup.js`) and the Settings
  panel for it (`BackupPanel.jsx`).
- `supabase/` — sync v2 SQL (`migrations/0001` to `0003`) and its rollback
  (`rollback/sync_v2_down.sql`). Nothing here has been applied to any database.
- `test/` — node unit tests; `e2e/` — Playwright specs.
- `docs/adr/` — architecture decision records (see `docs/adr/README.md` for the index).
- `docs/runbooks/` — owner runbooks (see "Runbooks" below).
- `public/dsa/` — the DSA mastery map tool, synced via its own small script (same
  Supabase project, same signed-in session).
- `src/agents.json` — agent definitions. **To add an agent, add an entry here.** No code
  change is needed.

## Routes

Navigation uses the URL hash: `#/<tab>` or `#/<tab>/<view>`. An empty or unknown hash is
rewritten to `#/today`; an unknown view is dropped. The table is `src/routes.js`.

| Tab | Route | Views |
|---|---|---|
| Today | `#/today` | none |
| Life | `#/life` | `tasks`, `reminders`, `notes`, `habits`, `growth` |
| Logic | `#/logic` | `code`, `puzzles`, `exams` |
| Money | `#/money` | `overview`, `budget`, `goals`, `loans` |
| Invest | `#/invest` | `learn`, `research`, `watch` |
| Agents | `#/agents` | none |

The router parses and validates sub-views, but `App.jsx` currently switches on the tab
only and does not pass `view`/`onViewChange` into the tabs, so the sub-view inside a tab is
still each tab's own state. Life accepts those props; Money, Logic and Invest keep
internal state.

## Keyboard shortcuts

Handled in `src/shell/useShortcuts.js` and `src/shell/commands.js`.

| Keys | Action |
|---|---|
| Cmd/Ctrl+K | Toggle the command palette |
| Cmd/Ctrl+1 to 6 | Go to Today, Life, Logic, Money, Invest, Agents (nav order) |
| N | Run the `new` command, if a screen registered one |
| X | Run the `complete` command, if a screen registered one |

Cmd/Ctrl chords work everywhere, including inside text fields. N and X are ignored while
typing in an input, textarea, select or contenteditable, while a modal `<dialog>` is open,
and with Alt or Shift held. They are disabled when the `shortcuts` field in settings is
`false`; there is no toggle for it in the settings panel yet. Screens register commands
with `useCommand(id, label, fn)`. Today only the Life Tasks screen registers one
(`complete`, when a not-yet-done task is selected); nothing registers `new` yet, so N does
nothing.

## Themes

Seven accent themes, picked with the swatches in the settings panel (gear in the top bar)
and stored in `settings.theme`, which syncs with the rest of settings. `applyTheme` in
`src/App.jsx` sets `data-accent` on `<html>` and updates `<meta name="theme-color">`.

| Theme | Family |
|---|---|
| Ocean (default) | dark |
| Forest | dark |
| Sunset | dark |
| Grape | dark |
| Rose | dark |
| Sky | light |
| Cream | light, with its own surface set, larger radii and a rounded font |

The accent blocks are in `src/styles.css`; the light-family and cream overrides are in
`src/styles/tokens.css`.

## Breakpoints

The shell lays out by the width of the app container (`@container app`), not the viewport,
so it behaves the same in an iPad Split View pane:

- under 600px: bottom tab bar
- from 600px: 72px icon rail
- from 1024px: 220px labelled sidebar, and the inspector shows as a right-hand column
  (below 1024px it opens as a Sheet instead)

Inside that, the Today grid has its own container breakpoints at 600px and 900px, and Life's
master/detail layout at 1024px and 1280px. A few overlay and palette rules use viewport
media queries (600px, 1024px, `max-width: 599px`), and the inspector column is 300px wide,
320px from a 1280px viewport.

## Deploy

```bash
npx vercel --prod
```

Set `GROQ_API_KEY`, `OWNER_USER_ID`, `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in
the Vercel project's environment variables, plus the optional `GROQ_MODEL`,
`ALLOWED_ORIGINS`, `AGENT_RATE_PER_MIN`, `AGENT_RATE_PER_DAY` and `VITE_API_BASE` from the
table above. Then:

1. Turn the Supabase sign-up toggle off (Dashboard, Authentication, sign-ups), so only the
   existing owner account can sign in. The app has no client-side sign-up.
2. Copy the owner's user id from the Supabase Auth users list into `OWNER_USER_ID`.
3. Run `docs/sql/agent_usage.sql` once in the Supabase SQL Editor (the per-user usage table
   behind the rate limit).
4. Open the deployed URL on your iPhone and use Share → Add to Home Screen.

> The DSA mastery map (`public/dsa/mastery-map.html`) can't read Vite env vars — its
> Supabase URL/anon key are hardcoded as literals near the top of its persistence
> script and must be updated there too if the project's credentials ever change.

### Preview deployments

`vercel.json` holds the routing, security headers and cache headers; there is no Vercel
setting in the repo that turns previews on. The usual Vercel Git integration builds a
preview for each branch or pull request once the GitHub repository is linked to the Vercel
project, and `npx vercel` (without `--prod`) makes a preview from your working copy.

> **Needs a user action, not verified:** linking the repo to a Vercel project and setting
> the environment variables are dashboard actions. Whether the Git integration is connected,
> which Node version the project uses, and which scopes (Production, Preview, Development)
> hold the variables have not been checked from this repo. The CI Node version is 22; the
> Vercel project's Node setting is not in the repo.

- Variables to set in Vercel (Production and, if you want working previews, Preview):
  `GROQ_API_KEY`, `OWNER_USER_ID`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`; optional
  `GROQ_MODEL`, `ALLOWED_ORIGINS`, `AGENT_RATE_PER_MIN`, `AGENT_RATE_PER_DAY`,
  `VITE_API_BASE`. Meanings and defaults are in the Environment table above.
- `OWNER_USER_ID` must be set in every scope that serves `/api/agent`, or that scope
  rejects every call (fail-closed).
- A preview that is given the production Supabase variables reads and writes the
  production `kv_store` rows, so edits made in a preview are real edits. Using a separate
  Supabase project (or at least separate keys) for the Preview scope avoids that. This is
  an open decision for the owner; nothing in the repo enforces either choice.
- The `VITE_` values are baked in at build time, so changing them needs a new deployment.
- CI does not deploy and does not use any of these variables: the E2E build uses the
  dummy values in `.env.e2e`.

### In-app update prompt (PWA)

The service worker is generated by `vite-plugin-pwa` in `vite.config.js` with
`registerType: 'prompt'` and no `skipWaiting`, so a new build never replaces the running one
by itself. Registration and the prompt live in `src/pwa/`; the prompt is mounted in its own
React root from `src/main.jsx`.

1. The app checks for a new service worker hourly and each time the tab becomes visible
   again (`scheduleUpdateChecks` in `src/pwa/updateFlow.js`). `vercel.json` serves `/sw.js`
   and `/manifest.json` with `Cache-Control: no-cache`, and `/assets/*` as immutable, so a
   check sees a new worker as soon as one is deployed.
2. When a new worker is installed and waiting, a bar reads "A new version is ready" with
   two buttons.
3. **Reload** first awaits the store's `flush()` so debounced edits (up to about 700 ms of
   writes) reach storage, then calls `updateServiceWorker(true)`, which activates the new
   worker and reloads the page. It is the only code path that applies an update. If the
   flush throws, the update still goes ahead so you are not stranded on an old build. While
   it runs the button shows "Saving…".
4. **Later** only hides the bar. The app does not activate the waiting worker by itself.
5. On the first install, a bar reads "Ready to work offline" with an OK button.

The prompt is registered only in production builds, only where `serviceWorker` exists, and
not inside the Capacitor native app. `npm run dev` never registers a service worker. The
flush-then-update logic is unit-tested in `test/updateFlow.test.js`; the end-to-end update
prompt on a real device (including iOS home-screen installs) is a manual check and has not
been verified here.

## Install and offline behaviour (PWA)

Forge is a web app with a web app manifest (`public/manifest.json`: standalone display,
192, 512 and maskable 512 icons, scope `/`) and a Workbox service worker generated by
`vite-plugin-pwa` (`vite.config.js`). `index.html` also carries the Apple touch icon and the
`apple-mobile-web-app-capable` meta tags.

**Install.** There is no in-app install button. On iPhone or iPad, open the deployed URL in
Safari and use Share, then Add to Home Screen. On desktop Chromium the browser's own install
control is used. The service worker is registered only in production builds, so `npm run
dev` is never installable and never caches.

**What works offline once the app has loaded online once:**

- The app shell. The precache holds the built JS, CSS, HTML, SVG, PNG and ICO files, and
  navigations fall back to `/index.html`. The Playwright `pwa` project checks that the shell
  reloads offline in Chromium.
- Your data. Notes, tasks, habits, money and the other synced keys live in IndexedDB first
  and are read and written locally; changes are pushed to Supabase when the network is
  back. This is how `src/store.js` and the v1 sync engine are written; a long offline period
  across several devices has not been tested here.
- `/puzzles.json` is served stale-while-revalidate from its own cache after a first
  online load.

**What needs the network:**

- Every `/api/*` call (agents, Codeforces, Lichess daily, quotes, ICS) and every
  `*.supabase.co` request is `NetworkOnly`: never cached, never answered by the shell.
  Those features fail offline and sign-in and cloud sync wait until you are online.
- `public/dsa/` (the mastery map) and `puzzles.json` are excluded from the precache
  (`scripts/ci/check-sw.mjs` enforces the precache contents).

**Updates.** A new build never replaces the running one on its own; see "In-app update
prompt (PWA)" under Deploy.

**Not verified.** Install, offline reload, update and safe areas on a real iPhone or iPad
are manual checks that no automated job here has run. The e2e projects are Chromium
emulations, not WebKit.

## Sync v2 (code present, off by default, not applied)

Sync v2 replaces the whole-blob `kv_store` row per key with per-record rows (table
`records`, hybrid logical clocks, tombstones, a push function). Design: `docs/adr/0003-sync-v2.md`.

State as of this commit, stated plainly:

- **The code exists** in `src/sync/` (`engine2.js`, `cloudV2.js`, `router.js`, `migrate.js`,
  `adapters.js`, ...) and is wired into `src/store.js` behind per-key flags.
- **Every flag defaults to OFF.** With no flag on, every call goes to the v1 engine as
  before, and the v2 engine is not even constructed.
- **The SQL has not been applied to any database.** `supabase/migrations/0001_sync_v2.sql`,
  `0002_sync_v2_backfill.sql`, `0003_sync_v2_verify.sql` and `supabase/rollback/sync_v2_down.sql`
  were run only on a throwaway local PostgreSQL by their author, never on the real Supabase
  project. Nothing runs them automatically.
- **No key has been migrated and nothing has been turned on.** Turning a key on needs the
  runbook below, and each owner step needs the owner's explicit approval.

**The migration flag.** A synced key is on v2 only if it is listed in `VITE_SYNC_V2_KEYS`
(comma-separated, set in the Vercel environment and baked in at build time), or if this
device's localStorage entry `forge_sync_v2_keys` (JSON, for example `{"notes": true}`) says
so; the per-device entry wins over the env list in both directions (`false` forces a key
off). Valid names are the 17 synced keys in `src/sync/adapters.js`. A flagged key never
silently falls back to v1 (`src/sync/router.js`), and the v2 tables do not exist anywhere
yet, so do not set the flag until the runbook says to.

**Before any cutover: export.** See "Backup and export" below. The cutover runbook also
requires a table copy of `kv_store` and a restore drill.

Full procedure (backup, migrate, backfill, verify, roll out per key, roll back):
`docs/runbooks/sync-v2-cutover.md`.

## Backup and export

There is no CLI export command and no npm script for it. The export is in the app:

1. Sign in on the device with the freshest data and let sync settle.
2. Open Settings (gear in the top bar), find Backup, press **Export backup**.
3. The browser downloads `forge-backup-YYYY-MM-DD.json` (format `forge-backup`, version 1,
   one `{ data, updatedAt }` entry per synced key that holds data).

**Import backup** in the same panel validates the whole file first and, if any target key already holds
local data, asks you to confirm before replacing it. The file holds
your personal data (money, loans, notes): keep it private and never commit it. Cloud-side
and per-device exports, the monthly export habit and the restore drill are in
`docs/runbooks/supabase-free-tier.md`.

## Native iOS shell (planned, not built)

There is **no native app yet**. The repository has no `ios/` folder and no
`capacitor.config.json`. The Capacitor scaffold needs a Mac with Xcode and an Apple
Developer account, which have not been available, so that task was skipped.

What exists today is groundwork only: `VITE_API_BASE` and the CORS allow-list (the defaults
include `capacitor://localhost`), and the service worker prompt being skipped when a
Capacitor platform is detected (`src/pwa/registerSW.js`). The decision record is
`docs/adr/0002-delivery-path.md` (PWA first, Capacitor second). The steps to follow once a
Mac is available, from signing to TestFlight, are written down but unrun and unverified in
`docs/runbooks/ios-release.md`.

## Runbooks

Owner-facing procedures. Several steps need dashboard access and are marked OWNER ACTION;
none has been run against the live project.

- `docs/runbooks/supabase-free-tier.md`: keep the free project awake, JSON export (17 keys),
  restore drill.
- `docs/runbooks/sync-v2-cutover.md`: sync v2 backup, migration, backfill, verification,
  per-key rollout and rollback.
- `docs/runbooks/ios-release.md`: planned iOS signing, API base, TestFlight and device checks.

Architecture decisions are in `docs/adr/` (index: `docs/adr/README.md`).

## Not built yet

These are ideas, not shipped features:

- Quant question engine (LLM-generated, reusing `/api/agent`), with spaced repetition over
  the existing `progress` store.
- RSS digest agents (newsletter and AI-news summarization).
