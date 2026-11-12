# R7 report: build, test, PWA and CI infrastructure

## Summary
- Baseline is green and stable: `npm ci` OK, `npm test` 97/97 pass on 3 runs (about 8.3 s each), `npm run build` OK in 2.6 s. JS gzip total is 237,168 B; the entry chunk is 119.3 kB gzip.
- PWA: `vite-plugin-pwa@2.0.0` (peer Vite 3 to 8, Node >= 20.19) works with Vite 5.4.21. `workbox-window` comes with it as a dependency. I recommend `generateSW` for P1, with `registerType: 'prompt'`, `NetworkOnly` for `/api` and Supabase, and a navigate-fallback denylist for `/api/` and `/dsa/`. The denylist is mandatory: `src/tabs/Life.jsx:715` links to `/api/ics` as a navigation.
- E2E: the hermetic recipe was verified in this environment with the preinstalled Chromium. It uses a dummy-env build, a seeded `sb-<host>-auth-token`, `route()` stubs, `routeWebSocket` for Realtime, and `vite preview`. Two Playwright route-order and descriptor gotchas are listed under Facts.
- Lint cost is tiny: a rough core-rule run found 0 real errors and 3 unused-var warnings. The code already carries 6 `eslint-disable react-hooks/exhaustive-deps` comments for a plugin that is not installed.
- CI and E2E should land early, not in P4. The blueprint roadmap draws P4 across weeks 1 to 10.
- Overlap with other lanes: X1 proposes the PWA deps, icons and an `injectManifest` SW (X1-03/04/05). R5 owns `vercel.json` (R5-14). The synthesis must dedupe; my picks and the disagreement are in Proposed tasks.
- 15 proposed tasks (12 agent tasks, 3 `USER:` actions, one of them the real-device check).

## Facts
Baseline (commands run in /home/user/personal_tracker, Node v22.23.4, npm 10.9.9; `node_modules` and `dist` are gitignored, no tracked file changed):
- `npm ci` succeeded. It reported "3 vulnerabilities (1 moderate, 2 high)": `esbuild <=0.24.2` (dev-server request leak, fix needs vite 8), `vite <=6.4.3` (dependent), `source-map-js` (high, `npm audit fix` is non-breaking). Lockfile: `package-lock.json` v3, 132 package entries.
- `npm test` ran `node --test "test/*.test.js"` (`package.json:10`): 11 files, 97 tests, 97 pass, 0 fail, 0 skipped. Three consecutive runs gave 8.32 s, 8.30 s and 8.28 s. No flakiness seen. `test/planLint.test.js` imports `scripts/plan/plan-lint.mjs`, so the plan tooling is part of the suite.
- `npm run build` (vite 5.4.21, 516 modules, 2.62 s). Per chunk, raw / gzip:
  - `index-*.js` 415.06 / 119.28 kB; `Life-*.js` 167.32 / 54.12; `Invest-*.js` 70.78 / 25.48; `time-*.js` 49.15 / 16.46; `Expenses-*.js` 29.70 / 7.61
  - `LogicBuilding-*.js` 22.04 / 6.48; `confetti.module-*.js` 10.66 / 4.28; `Agents-*.js` 7.78 / 3.07; `id-*.js` 0.61 / 0.39
  - `index-*.css` 25.57 / 5.64; `dist/index.html` 1.09 / 0.53. `dist` total is 1,344,087 B.
- `zlib.gzipSync` default level reproduces Vite's gzip numbers exactly (JS 237,168 B, CSS 5,638 B), so a bundle-budget script needs no dependency.
- `dist/` copies `public/` verbatim: `public/dsa/mastery-map.html` is 433,319 B and `public/puzzles.json` 107,430 B. A naive precache glob would add about 540 kB. Without them, precache is about 803 kB raw.
- Repo facts confirmed: no router and lazy tabs (`src/App.jsx:9-13`, `src/App.jsx:15`); no `.github/`, `vercel.json`, linter or SW (`grep serviceWorker|navigator.storage` over src and public/dsa found nothing); `vite.config.js:55-57` is the only plugin wiring (`plugins: [react(), apiDevPlugin()]`); `.gitignore:1-5` is `node_modules dist .env .vercel .superpowers`.
- `vite.config.js:50-51` mounts the `/api` middleware on both dev and preview servers. Verified: `vite preview` returns 200 for `/api/health` and serves `index.html` for `/life/tasks` (SPA fallback works).
- `src/supabaseClient.js:6-8` throws at import when `VITE_SUPABASE_URL` or `VITE_SUPABASE_ANON_KEY` is unset. These are baked in at build time. A CI build with no env builds fine but renders nothing at runtime.
- `.env.example:1-4` lists GROQ_API_KEY, GROQ_MODEL, VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY. `api/agent.js:12` also requires `OWNER_USER_ID` (every call is 403 without it). The README env table (`README.md:18-23`) omits it too. `api/agent.js:4` defaults to `openai/gpt-oss-120b`, while `.env.example:2` says `llama-3.3-70b-versatile`.
- No `Cache-Control` header is set by any `api/*.js` except the ICS Content-Type and Content-Disposition (`api/ics.js:8-9`).
- `src/tabs/Life.jsx:715` renders `<a href="/api/ics?...">` (`Life.jsx:654-656`). That is a browser navigation, which a SW `navigateFallback` would answer with `index.html`.
- `public/manifest.json:10-14` has one icon, an inline emoji SVG data URI. `index.html:11-12` uses the same data URI for `rel=icon` and `apple-touch-icon`. `index.html:8` has a static `theme-color #0a0c10` although the `sky` theme is light (`src/styles.css:50-51`) and `src/App.jsx:146` sets `dataset.accent` at runtime.
- `public/manifest.json` has no `id`, `scope` or `orientation`. `start_url` is `/` (`:4`).
- Sync internals relevant to SW and update UX: `flush()` exported from `src/store.js` (`:48`) pushes pending writes immediately; `schedulePush` debounce is 700 ms (`src/sync/engine.js:61-64`); `claimOwner` clears IndexedDB on user change (`engine.js:138-144`) but cannot clear a SW cache.
- `src/toast.js:20-26` and `src/Toast.jsx:21-30` support only an `undo` action labelled "Undo" with an 8 s default auto-dismiss. A "Reload" prompt needs a new component, not a toast option.
- `public/dsa/mastery-map.html:1608` loads supabase-js from `cdn.jsdelivr.net` and `:7` loads Google Fonts. Both are cross-origin. Its Supabase URL and anon key are literals (`:1613-1614`).
- vite-plugin-pwa (npm view, https://www.npmjs.com/package/vite-plugin-pwa): latest 2.0.0 published 2026-10-03, peer `vite ^3.1 || ... || ^8`, dependencies `workbox-build ^7.4.1` and `workbox-window ^7.4.1`, `@vite-pwa/assets-generator` optional peer, engines node >=20.19.0. 1.3.0 (2026-05-05): same peers, node >=16. The README says "From v2.0.0 ... requires Node 20.19.0 or above".
- `workbox-build` and `workbox-window` are both 7.4.1 (npm view). `workbox-build` needs Node >=20. `@vite-pwa/assets-generator` is 2.0.0 (node >=20.19, depends on `sharp ^0.35.4`); 1.0.2 also exists.
- `@playwright/test` latest is 1.65.0 (npm view, engines node >=20). The environment has global Playwright 1.63.0 at `/opt/node22/lib/node_modules/playwright` and only `/opt/pw-browsers/chromium-1243`, `chromium_headless_shell-1243` and `ffmpeg-1011` (no WebKit or Firefox). No repo-local `@playwright/test`.
- Playwright 1.63 device descriptors (read from the global install): `iPhone 14` is 390x664, dsf 3, touch; `iPad (gen 11)` is 656x944; `iPad Pro 11` is 834x1194; `iPad Pro 11 landscape` is 1194x834; `Desktop Chrome` is 1280x720. All iOS descriptors default to the `webkit` browser.
- Hermetic run (scratch files only: `/tmp/claude-0/-home-user-personal-tracker/32f9accb-2fb5-56d6-b2df-eacaeded291f/scratchpad/smoke.cjs`, build in `.../scratchpad/e2e-dist`): built with `VITE_SUPABASE_URL=https://stub.supabase.co`, served by `vite preview --outDir`, drove Chromium with the `iPad Pro 11` descriptor. Seeding localStorage key `sb-stub-auth-token` (`sb-<first hostname label>-auth-token`) with a far-future `expires_at` made `getSession()` resolve with no network. The app then issued 18 `GET /rest/v1/kv_store?...key=eq.<key>` calls (one per synced key), all fulfilled with `[]`. `routeWebSocket` swallowed the Realtime socket. Result: app rendered Life tab with tab bar, zero page errors, zero console errors, zero unstubbed external requests.
- Playwright route precedence is last-registered-first. My first run registered the "block everything external" route last and it swallowed the Supabase stubs. The catch-all must be registered first.
- `eslint` 10.1.0 is installed globally only. A scratch config (core rules plus `no-undef`, `no-unused-vars`) over src, api and test reported 3 warnings (`src/tabs/Agents.jsx:22-23` unused `savedAgentId`/`savedMessages`, `test/lifeLogic.test.js:12` unused `TRAITS`) and one `no-undef` that was a gap in my globals list. Six `eslint-disable-next-line react-hooks/exhaustive-deps` comments already exist (`src/tabs/Life.jsx:106,126`, `src/tabs/Invest.jsx:426,453,470`, `src/useHydrate.js:20`).
- `eslint-plugin-react-hooks` 7.1.1 peer range includes eslint ^10; `eslint` 10.14.0, `@eslint/js` 10.0.1, `globals` 17.14.0 (npm view).
- `.claude/launch.json:4-8` defines only a dev config on port 5173.
- Blueprint: matrix at `docs/plan/blueprint.txt:64-69`; PWA row `:75`; roadmap rows P1 and P4 at `docs/forge-blueprint.html:981,984` (P4 bar starts at 0 and spans 100%); learning nodes manifest/sw/cachestrat/perf `:1011-1016`, testpyr/e2e/ci/obs/flags `:1040-1044`.
- Inference: Node 20.x `node --test` does not expand quoted globs (added in 21), so `package.json:10` needs Node >= 21. Not tested here (only Node 22 and 24 are installed).
- Inference: precache of about 803 kB raw (about 243 kB gzip) on first install is acceptable for a one-user app.
- Inference: Capacitor's WKWebView does not run the SW on its custom scheme; register the SW only when not native (X1 covers Capacitor; see `docs/plan/research/X1-report.md:86,97,105-106`).
- Inference: Vercel serves static files and functions before applying rewrites, so a catch-all SPA rewrite does not shadow `/api/*` or `/dsa/*`; R5-14 owns the exact rule and I could not test Vercel locally.

## Gaps and contradictions
- Blueprint matrix says "iPhone 14, 390x844" (`blueprint.txt:65`); Playwright's `iPhone 14` is 390x664. Override the viewport. "iPad 11" is 834x1194 (`:66`), which is the `iPad Pro 11` descriptor, not `iPad (gen 11)` (656x944). The split-view row has no descriptor.
- The matrix asserts "FAB clears tab bar + home indicator" (`blueprint.txt:65`). Chromium and WebKit emulation report `env(safe-area-inset-*)` as 0, so this can only be asserted as arithmetic on the CSS variable, not as a real inset. Real devices need a manual check (R7-15).
- Blueprint puts the third pane at >=1280 (`blueprint.txt:38,56`) and the hybrid decision says the inspector appears from >=1024px. E2E layout assertions must follow the decision. Flag to B1/R1.
- Blueprint says "5 tabs" bottom bar (`blueprint.txt:36`); the decision adds Today as a 6th. The matrix assertion "bottom tabs visible" must count 6.
- Roadmap draws P4 over the full timeline (`forge-blueprint.html:984`) but the plan treats it as the last phase. CI, lint and the E2E harness have no dependency on the shell and should land in the first waves. Layout specs (R7-08) wait for P0.
- R1-04 proposes a hash router while the blueprint (`blueprint.txt:62`) and decision talk about path routes like `/life/tasks`. With hash routes no `vercel.json` rewrite is needed and SW navigation is unaffected; with path routes the R5-14 rewrite and the SW `navigateFallback` are both required. The PWA and E2E tasks work with either, but `start_url` and E2E URLs differ.
- `swarm.json` repo fact "node_modules not installed" was true; it now is (after my `npm ci`). Untracked and ignored.
- Blueprint calls PWA "Phase 1 - ship first" (`blueprint.txt:75`) while the roadmap has P0 shell first (`forge-blueprint.html:980`). The PWA tasks here do not need the shell, except the `main.jsx` mount (R7-05).
- X1-05 proposes `injectManifest` plus `src/sw.js`; I recommend `generateSW`. X1-03/04/05 and R7-01/02/04 overlap (deps, icons, PWA config). X1-01 and R5-14 both propose `vercel.json`. Synthesis must keep one of each.
- `obs` (error tracking) and `flags` appear in the roadmap and graph but no R7 question covers them. Not researched; no task proposed. The `syncFailed` banner (`src/App.jsx:239-240`) is the only signal today.
- The mastery map cannot work offline even with a SW: its Supabase client and fonts come from CDNs (`mastery-map.html:7,1608`). Fixing it means vendoring the UMD file, which is R3's file.
- `theme-color` is static (`index.html:8`) against a light theme and a planned cream theme. A runtime meta update belongs to R1 (theme switch at `src/App.jsx:146`).

## Risks
- Stale build pinned by the SW (X1-report.md:106). Mitigation: `registerType: 'prompt'`, no `skipWaiting`, hourly `registration.update()` plus on `visibilitychange`, a visible "Update available" prompt.
- Reload during an unsaved edit loses up to 700 ms of writes (`engine.js:61-64`). Mitigation: the update flow awaits `flush()` before `updateServiceWorker(true)`; unit-tested in R7-05.
- `navigateFallback` hijacking `/api/ics` (`Life.jsx:715`) and `/dsa/*`. Mitigation: denylist `^/api/` and `^/dsa/`; offline spec in R7-09 asserts both.
- Cross-user data from a SW cache: `claimOwner` wipes IndexedDB only (`engine.js:138-144`). Mitigation: `NetworkOnly` for `/api/*` and `*.supabase.co`, no runtime cache for authenticated calls, and a `check-sw` script in CI that fails if either route is missing.
- Preview deployments use the production Supabase project if the same env vars are set, so a preview edit mutates real `kv_store` rows. Mitigation: separate Supabase project (or at least separate keys) for the Preview scope, or accept the risk; user decision.
- E2E builds without dummy env white-screen (`supabaseClient.js:6-8`). Mitigation: `--mode e2e` with a committed `.env.e2e` (not covered by `.gitignore:3`, which ignores only `.env`).
- `@playwright/test` version must match the browser revision: 1.63.0 pairs with `/opt/pw-browsers/chromium-1243`; 1.65 would look for a different revision and fail with "Executable doesn't exist" here. Mitigation: pin 1.63.0; CI runs `playwright install --with-deps chromium` and caches by version.
- Chromium emulation does not equal iOS Safari (dvh, safe-area, hover heuristics, SW quirks). Mitigation: R7-15 real-device checklist; optional WebKit CI job later.
- Pixel baselines differ across OSes. Mitigation: geometry and DOM assertions only; screenshots attached as artifacts.
- vite-plugin-pwa 2.0.0 needs Node >= 20.19; the Vercel project Node setting is unknown. Mitigation: `engines.node` plus Vercel setting 22.x (X1-02 proposes it); fallback to 1.3.0.
- `sharp` (via the assets generator) is a native install in every `npm ci`, including Vercel. Mitigation: commit generated PNGs; if install ever breaks, drop the devDependency and run the generator via pinned `npx`.
- A home-screen install is probably a separate storage container from Safari (X1-report.md:86), so unsynced local-only data in a Safari tab is not carried over. Mitigation: flush and show sync status before the user installs; X1-06 adds `navigator.storage.persist()`.
- Hot spots (`package.json`, lockfile, `vite.config.js`, `index.html`, `src/main.jsx`, `vercel.json`, `.gitignore`, `README.md`) are edited by several lanes. Mitigation: one owner per wave, listed below.

## Write-set map
New files owned by this lane, no contention:
- `playwright.config.js`, `.env.e2e`, `e2e/**`, `eslint.config.js`, `.github/**`, `scripts/ci/**`
- `src/pwa/**`, `assets/icon-source.svg`, `pwa-assets.config.js`, `public/icons/**`
- `test/updateFlow.test.js`, `test/bundleBudget.test.js`, `test/vercelHeaders.test.js` (new file names, no overlap with the 11 existing test files)

Hot spots (single writer per wave, chain the rest):
- `package.json` + `package-lock.json`: R7-01 is the only R7 writer. X1-02 (router, engines) and any router/Capacitor dependency task must be chained before or after it by the synthesizer.
- `vite.config.js` (58 lines): R5-13 first, then R7-04 (one line in `plugins`), then R5-16.
- `vercel.json`: R5-14, then R7-06, then R5-15.
- `index.html`, `public/manifest.json`: R7-04. R1 also reads/edits `index.html` (theme-color script). Serialise.
- `src/main.jsx` (10 lines): R7-05 adds one side-effect import. R1-01 (CSS imports) and X1-10 (fetch shim) also edit it. R7-05 depends on R1-01; chain X1-10 explicitly.
- `.gitignore`: R7-07 appends `dist-e2e`, `test-results`, `playwright-report`.
- `README.md`, `.env.example`: R5-18, then R7-13.

## Needs from the user
- Icon artwork: approve or supply a flame vector SVG (the emoji cannot be rendered reproducibly across OS fonts) and confirm the background colour `#0a0c10`.
- Decision: `generateSW` (my pick) versus `injectManifest` (X1-05).
- GitHub: confirm the repo is hosted on GitHub with Actions enabled (I did not run git); then set required status checks `check` and `e2e` on the default branch.
- Vercel: link the repo to a Vercel project (dashboard action) and set `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `GROQ_API_KEY`, `OWNER_USER_ID` and optionally `GROQ_MODEL` for Production and Preview. Set Node 22.x.
- Decision: should the Preview scope point at a separate Supabase project?
- Devices: iPhone and iPad models and iOS versions for the manual install, offline and update check (R7-15), and whether Split View is used in practice.
- Decision: do you want offline access to the DSA mastery map (needs vendoring supabase-js and fonts into `public/dsa`, R3's lane)?
- Optional: whether to adopt an error-tracking service (account needed) for the `obs` node.

## Proposed tasks
Matches `R7.tasks.json`. 15 tasks, 12 agent tasks plus 3 user tasks marked `USER:`.
- R7-01 (S, P1) Add all infra devDependencies and npm scripts. Single writer of `package.json` and the lockfile.
- R7-02 (S, P1) Create the icon source SVG and generate the PNG icon set reproducibly.
- R7-03 (S, P1, USER) Approve or supply the icon artwork and colours.
- R7-04 (M, P1) Configure vite-plugin-pwa (generateSW), manifest and index.html links, plus `check-sw` script.
- R7-05 (M, P1) Update-prompt UX: registration module, prompt component, flush-then-update flow, unit test.
- R7-06 (S, P1) Add SW, manifest and asset cache headers to `vercel.json`.
- R7-07 (M, P4) Playwright config with 5 device projects plus a PWA project, hermetic fixtures and a smoke spec.
- R7-08 (M, P4) Device-matrix layout specs from the blueprint table. Blocked on the P0 shell.
- R7-09 (S, P1) PWA offline spec: SW registers, offline reload, `/api` and `/dsa` not hijacked.
- R7-10 (S, P4) Bundle-budget script, budgets and unit test.
- R7-11 (S, P4) ESLint flat config with rules-of-hooks and exhaustive-deps only.
- R7-12 (S, P4) GitHub Actions CI workflow and Dependabot config.
- R7-13 (S, P4) Document CI, E2E, PWA and preview workflow in the README.
- R7-14 (S, P4, USER) Connect GitHub and Vercel, set env vars, enable required checks.
- R7-15 (S, P1, USER) Real-device install, offline and update check on iPhone and iPad.

Recommendations backing the tasks (not exhaustive config):
- Versions: `vite-plugin-pwa@2.0.0` and `workbox-window@7.4.1` (explicit, though also a dependency of the plugin; needed by `virtual:pwa-register`), `@vite-pwa/assets-generator@1.0.2`, `@playwright/test@1.63.0`, `eslint@10.14.0`, `@eslint/js@10.0.1`, `globals@17.14.0`, `eslint-plugin-react-hooks@7.1.1`.
- generateSW (P1): `registerType: 'prompt'`, `injectRegister: false`, `manifest: false` (keep hand-edited `public/manifest.json`, add `id`, `scope`, PNG icons, `orientation: 'any'`), `workbox.globPatterns ['**/*.{js,css,html,svg,png,ico}']`, `globIgnores ['dsa/**','puzzles.json']`, `navigateFallback '/index.html'`, `navigateFallbackDenylist [/^\/api\//, /^\/dsa\//]`, `cleanupOutdatedCaches: true`, `runtimeCaching`: `/api/` NetworkOnly, `*.supabase.co` NetworkOnly, `/puzzles.json` StaleWhileRevalidate (maxEntries 4). No dev SW (`devOptions.enabled` stays false). Push in P5 can be added with `workbox.importScripts` and a static `public/push-sw.js`, so no strategy switch is required; switch to `injectManifest` only if SW needs real routing code.
- Update UX: `useRegisterSW` from `virtual:pwa-register/react` in `src/pwa/UpdatePrompt.jsx`, mounted as a separate React root from `src/pwa/registerSW.js` so `App.jsx` is not touched. Banner "A new version is ready" with Reload and Later; Reload runs `await flush(); updateServiceWorker(true)`. Show "Ready to work offline" once. Check for updates hourly and on `visibilitychange`.
- Icons (exact set, generated from `assets/icon-source.svg` by `npm run icons`, preset `minimal-2023`, background `#0a0c10`): `public/icons/pwa-192x192.png`, `pwa-512x512.png`, `maskable-icon-512x512.png` (content in the central 80% safe zone), `apple-touch-icon-180x180.png` (opaque, no transparency), `favicon.ico` (48x48), `favicon.svg`. Replace `index.html:11-12` and `manifest.json:10-14`.
- Playwright projects (all `browserName: 'chromium'` because only Chromium is installed; keep `hasTouch`/`isMobile` from the descriptor), `serviceWorkers: 'block'` for the matrix and `'allow'` only in the `pwa` project:
  - `iphone-14`: `devices['iPhone 14']`, viewport 390x844
  - `ipad-portrait`: `devices['iPad Pro 11']` (834x1194)
  - `ipad-landscape`: `devices['iPad Pro 11 landscape']` (1194x834)
  - `ipad-split-third`: viewport 375x1024, `hasTouch`, `isMobile`, dsf 2
  - `desktop-chrome`: `devices['Desktop Chrome']`, viewport 1440x900
  - `pwa`: desktop viewport, `testMatch: /pwa\.spec/`
  - `webServer: { command: 'npm run build:e2e && npm run preview:e2e', url: 'http://localhost:4173', reuseExistingServer: !process.env.CI }`, with scripts `build:e2e = vite build --mode e2e --outDir dist-e2e` and `preview:e2e = vite preview --mode e2e --outDir dist-e2e --port 4173 --strictPort`.
- Hermetic fixture (auto fixture in `e2e/fixtures/hermetic.js`), in this order: (1) `context.route(/^https?:\/\/(?!localhost)/, abort)` first, (2) Supabase route: kv_store GET returns seeded rows (or `[]`), upsert records the body into a map the test can assert on, auth endpoints return `{}`, (3) `page.routeWebSocket(/supabase\.co\/realtime/, noop)`, (4) `page.route('**/api/{cf,puzzle,quote}*', fixture JSON)` and `/api/agent`, (5) `addInitScript` writes `sb-e2e-auth-token` for the dummy URL in `.env.e2e`. Fail the test on any request to a non-localhost host that was not fulfilled, and on `pageerror`.
- CI (`.github/workflows/ci.yml`): triggers `pull_request` and `push` to the default branch; `concurrency` cancel-in-progress; `permissions: contents: read`. Job `check`: `actions/checkout`, `actions/setup-node` (node 22, `cache: npm`), `npm ci`, `npm run lint`, `npm test`, `npm run build`, `node scripts/ci/check-sw.mjs`, `npm run size`, `npm audit --audit-level=high` with `continue-on-error: true`. Job `e2e` (parallel): same setup, cache `~/.cache/ms-playwright` keyed on the `@playwright/test` version, `npx playwright install --with-deps chromium`, `npm run test:e2e`, upload `playwright-report/` on failure. Pin actions by current major and let Dependabot raise PRs.
- Budgets seeded from the baseline (re-baseline at the P0 gate): entry JS 135 kB gzip, Life chunk 62 kB, total JS 270 kB, CSS 12 kB. Files are matched by hash-stripped prefix; fail on exceed.
- Lint minimum: ESLint flat config with `@eslint/js` recommended, `globals`, and only `react-hooks/rules-of-hooks` (error) and `react-hooks/exhaustive-deps` (warn). Inference: the plugin's v7 recommended preset adds many React-Compiler rules, so enable the two classic rules explicitly. Do not add: Prettier (reformats every file and collides with parallel tasks), TypeScript or `tsc` (JS codebase), Husky or lint-staged (the CI gate is enough), Stylelint, Vitest and jsdom (pure logic is already covered by `node --test`; revisit only if component tests are wanted), Lighthouse CI (flaky as a gate).
