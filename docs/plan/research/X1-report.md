# X1 - External facts and library choices

Research date 2026-11-12. WebFetch could not reach capacitorjs.com or supabase.com (host not in the session's network allowlist), so every web fact below comes from WebSearch result summaries, not from reading the primary page. Confidence reflects that. The baseline npm numbers were measured here.

## Summary

- The hybrid design is feasible on the current stack. No finding blocks it.
- Router pitfall: `react-router@latest` is 8.5.1 and needs React >=19.2.7. Forge is on React 18.3.1. Use `react-router-dom@7.18.5` (peer `react >=18`), about 15.0 KB gzip over React, or `wouter` at about 3.0 KB.
- The blueprint's sync v2 delta cursor is broken as written. `rev bigint generated always as identity` is assigned only on INSERT, so `where rev > last_seen_rev` never sees updates.
- Capacitor 8.6.0 needs Xcode 26+ and an iOS 15 deployment target, which means a Mac. P3 cannot be verified from this Linux sandbox.
- A Capacitor build runs at `capacitor://localhost`, so every relative `/api/...` fetch (5 files, 7 call sites) breaks. The `api/*.js` handlers send no CORS headers. A `VITE_API_BASE` fetch shim and a CORS helper fix this.
- The Supabase session lives in `localStorage` and is shared with `mastery-map.html`. Replacing the auth `storage` adapter would break that sharing, so mirror to native storage instead.
- The Supabase free tier pauses after 1 week of low activity. `/api/health` does not touch the database, so it cannot serve as keep-alive.
- Repo-fact corrections: `node_modules` is now present (49 top-level entries, vite 5.4.21), and `KEY_TO_TAB` references tab ids that are not top-level tabs. Details are under Gaps.
- 17 tasks are proposed in `X1.tasks.json`.

## Facts

Repo (observed):
- `package.json:12-20` React 18.3.1, `@supabase/supabase-js ^2.116.0`, `vite ^5.4.11`. There is no `engines` field. `node_modules/@supabase/supabase-js` is 2.116.0, and `npm view @supabase/supabase-js@2.116.0 engines` gives `node >=22.0.0`. Vercel's Node version is not pinned anywhere.
- `src/App.jsx:15-21` has exactly 5 TABS (Life, LogicBuilding, Expenses, Invest, Agents). Tab state is `useState('Life')` at `src/App.jsx:51`. Lines 9-13 lazy-load all five. `src/App.jsx` is 306 lines.
- `src/App.jsx:23-30` has 6 THEMES. `src/App.jsx:97` sets `document.documentElement.dataset.accent`.
- `src/store.js:6` uses `localforage.createInstance({ name: 'forge' })`. `src/store.js:59-63` lists 17 SYNCED_KEYS.
- `src/sync/engine.js:61` has the 700 ms debounce. `src/sync/logic.js:165-180` `decideSync` is whole-key last-write-wins on `updatedAt`.
- `src/supabaseClient.js:9` is `createClient(url, anonKey)` with no auth options, so supabase-js defaults to `localStorage`.
- `public/dsa/mastery-map.html:1608` loads `@supabase/supabase-js@2` unpinned from jsdelivr. Lines 1613-1622 hardcode the Supabase URL and anon key. Lines 1623-1701 monkey-patch `localStorage.setItem` and read the session from `localStorage`. The file is 8,320 lines.
- `vite.config.js:11-48` mounts `/api/*` in dev and preview. It only JSON-parses the body for POST.
- Relative API fetches: `src/tabs/Today.jsx:37,59`, `src/tabs/Puzzles.jsx:36`, `src/tabs/Agents.jsx:54`, `src/tabs/Life.jsx:655`, `src/tabs/Invest.jsx:435,669`. `src/puzzles.js:5` fetches `/puzzles.json`. `src/tabs/Invest.jsx:460,718` call `https://api.mfapi.in` directly.
- `api/*.js` has no `Access-Control-*` headers (grep found no match for "cors" or "Access-Control" in `api/`). `api/agent.js:6-17` reads `Authorization: Bearer`, which forces a CORS preflight for any cross-origin caller. `api/health.js` is 3 lines and returns `{ok:true}` with no database call.
- `public/manifest.json:10-14` has a single icon, an SVG data URI. `index.html:11-12` points `apple-touch-icon` at the same SVG data URI.
- `src/styles.css:749` already uses `color-mix(in srgb, ...)`. `src/styles.css:110` already uses `100dvh`. The file has 1,139 lines and 1 `@media` rule at line 1112.
- There is no `vercel.json`, `.github/`, service worker, or router. `README.md:62` deploys with `npx vercel --prod`.
- The server schema lives only in docs: `docs/superpowers/specs/2026-09-15-cloud-sync-design.md:52-71` (`kv_store`, primary key `(user_id, key)`, 4 RLS policies, added to the `supabase_realtime` publication). There is no `supabase/` migrations directory.
- `src/App.jsx:105` subscribes to a single `kv_store` channel with `filter: user_id=eq.${userId}`.

npm registry, measured today (`npm view`):
- `react-router` 8.5.1 has peer `react >=19.2.7` and node >=22.22. `react-router-dom` 7.18.5 has peer `react >=18` and depends on `react-router 7.18.5`.
- `vite-plugin-pwa` 2.0.0 has peer `vite ^3.1 .. ^8`, `workbox-build ^7.4.1`, `workbox-window ^7.4.1`, node >=20.19. `workbox-window` is 7.4.1.
- `@capacitor/core|cli|ios` are 8.6.0 (cli needs node >=22). Plugins: push-notifications 8.1.3, haptics 8.0.2, keyboard 8.0.6, status-bar 8.0.4, preferences 8.0.1, app 8.1.2, local-notifications 8.3.1. All have peer `@capacitor/core >=8`.
- `@aparajita/capacitor-secure-storage` 8.0.1 (Keychain, community). `capacitor-secure-storage-plugin` 0.13.0 (community). There is no first-party secure-storage plugin. `@capacitor/preferences` is not Keychain-backed.
- `vite` latest is 8.3.8. Forge is on 5.4.21 and `@vitejs/plugin-react` 4.7.0, which supports vite 4-7. Staying on Vite 5 is compatible with vite-plugin-pwa 2.0.0.

Bundle cost (esbuild minify, React external, measured in the scratchpad, not in the repo; bundlephobia was blocked by the proxy):

| Package | Minified | Gzip |
|---|---|---|
| react-router-dom 7.18.5 (BrowserRouter, Routes, Route, Link, useNavigate, useLocation) | 41.7 KB | 15.0 KB |
| the same with HashRouter | 42.0 KB | 15.1 KB |
| wouter (latest) | 6.1 KB | 3.0 KB |
| workbox-window 7.4.1 | 5.7 KB | 2.3 KB |
| @capacitor/core 8.6.0 | 8.2 KB | 3.4 KB |

For scale, React 18 plus react-dom is 142 KB min / 45.6 KB gzip. Unpacked sizes: vite-plugin-pwa 242 KB, workbox-build 483 KB. Both are build-time only.

Web (source, date accessed 2026-11-12, confidence):
- Capacitor 8 requires Xcode 26.0+ and an iOS deployment target of 15.0. Source: capacitorjs.com/docs/updating/8-0 and /docs/next/getting-started/environment-setup, via search summary. High.
- Capacitor serves the app at `capacitor://localhost` on iOS and `http://localhost` on Android. `server.hostname` should stay `localhost` to keep secure-context APIs. `iosScheme` cannot be `http` or `https`, and forum reports say overriding it did not take effect. Source: Capacitor config docs and the forum.ionicframework.com threads, via search. Medium. Not verified at the primary page.
- Supabase auth sessions in Capacitor iOS: community reports say a localStorage session was lost on full app kill or after about a day, and that Preferences and a custom adapter did not always fix it. Source: github.com/supabase/supabase-js/issues/1327 and the ionic forum, via search. Low to medium. These are anecdotes.
- iOS Keychain items have a practical size limit of about 2 KB, smaller than a Supabase session JSON. Source: Makerkit Expo guide, via search. Medium.
- iOS Web Push needs iOS 16.4+, a manifest, HTTPS, a service worker, and permission requested from a user gesture inside the installed Home Screen app. Source: webkit.org/?p=13878 and OneSignal docs. High.
- Safari has no Background Sync API. Source: developer.chrome.com/blog/background-sync and WebKit bug 201866. caniuse's "13.52 supported" entry conflicts with this and looks wrong. High on "unsupported".
- Safari's 7-day script-writable-storage cap applies to Safari tabs (days of use without interaction). Home Screen web apps keep their own counter and are exempt. Source: webkit.org/?p=10218 and webkit.org/blog/11338. High.
- Safari 17 storage policy: quota covers all origins, eviction is whole-origin LRU, and `persist()` is granted by heuristics such as being a Home Screen app. Source: webkit.org/?p=14403. Medium on `persist()` semantics (snippet was garbled).
- Browser floors, from my background knowledge. Search was inconclusive and contradicted some Safari numbers (it suggested :has in Safari 16 and color-mix in Safari 15). Treat as unverified against caniuse today.

| Feature | Chrome | Safari |
|---|---|---|
| container queries (size) | 105 | 16.0 |
| :has() | 105 | 15.4 |
| dvh | 108 | 15.4 |
| color-mix() | 111 | 16.2 |

- Supabase free tier pauses a project after 1 week of low database activity and warns by email about a week before. A project paused for up to 90 days can be restored from Studio. After that, the backup is downloadable only. Free projects have no backup retention. Limits: 500 MB database, 2 active projects, 50k MAU, 5 GB egress. Source: supabase.com/docs/guides/platform/free-project-pausing and the changelog entry 27497. High on the pause, medium on the limits. The realtime message and connection limits (200 connections, 2M messages) are not verified.
- `postgres_changes` filters: DELETE events cannot be filtered. `in` allows at most 100 values. Per the Supabase blog (August 2026 update), AND composition was added and OR was not. Source: supabase.com/docs/guides/realtime/postgres-changes and the blog. Medium.
- Apple Developer Program is $99/yr. TestFlight allows 100 internal testers (App Store Connect users, no beta review) and 10,000 external testers (first build needs review). Builds expire after 90 days. Source: Apple's TestFlight overview via search, plus secondary guides. Medium. The fee was not confirmed on Apple's own page.
- App Review 4.2: "include features, content, and UI that elevate it beyond a repackaged website". 4.2.2 names "web clippings, content aggregators". Source: developer.apple.com/app-store/review/guidelines. High. Reviewers reportedly test offline behaviour, which supports shipping a precached shell. Medium.
- Vercel Hobby crons run at most once per day, with hour precision (fires anywhere in the hour). Pro allows per-minute. Source: vercel.com/docs/cron-jobs/usage-and-pricing. High.
- `@capacitor/push-notifications` on iOS returns the raw APNs token. FCM is optional and only needed for a unified token. Testing needs a physical device and a paid account. Source: capacitorjs.com push guide via search. Medium.
- HLC (physical time plus logical counter) is the standard way to tame client clock skew in per-record last-write-wins. It still assumes roughly sane clocks. Source: ObjectBox and Ditto docs. Medium.

Inference (not sourced):
- Inference: the real browser floor is iOS 16.4, which is also the Web Push floor. It is higher than the 16.2 that `color-mix` already forces (`src/styles.css:749`) and than the 16.0 that container queries need.
- Inference: for a personal app, TestFlight internal testing needs no App Review, so guideline 4.2 risk only appears if the app is ever submitted publicly. The 90-day build expiry means a rebuild at least every 3 months.
- Inference: with BrowserRouter, Vercel needs SPA rewrites because there is no `vercel.json`. Rewrites must exclude `/api/*`, `/dsa/*` and static files. Vite dev and preview already fall back to `index.html`.
- Inference: Capacitor's iOS handler serves `index.html` for extension-less paths, so BrowserRouter should work there. Unverified. Use HashRouter inside the native shell if it does not.
- Inference: a Home Screen install is likely a separate storage container from Safari, so after installing the PWA the user must sign in again and Safari's local data is not carried over. Low confidence, from memory. Verify on a device.

## Gaps and contradictions

- The task brief says `node_modules` is not installed. It was absent at the start of this run and present minutes later (`ls node_modules | wc -l` gave 49; vite 5.4.21, react 18.3.1, supabase-js 2.116.0). Another agent probably ran an install. Do not rely on either state.
- Blueprint line 104: `rev bigint generated always as identity` is not bumped by UPDATE. Line 107 `where rev > last_seen_rev` therefore misses edits. Even with a trigger-assigned sequence, a long-running transaction can commit a lower `rev` after a higher one has been read, so a plain `rev` cursor can skip rows. Use a bump trigger plus an overlap window (re-pull `rev > last - N` and de-dupe by id), or a `(updated_at, id)` cursor.
- Blueprint line 98-103 comments "server clock wins ties", but the table has no HLC column. Blueprint 2.6 (line 115) says "Hybrid logical clock + per-record LWW". The schema needs an `hlc text` column or the client-supplied `updated_at` becomes the sole clock, which is the weakness the blueprint calls out at lines 94 and 114.
- Blueprint line 113 says free projects pause "after about a week idle -> add a keep-alive". `api/health.js` (3 lines) makes no database call, and Vercel Hobby cron cannot go below daily. Daily is enough for a 1-week pause window, but a DB-touching endpoint is still needed. Whether a query that RLS filters to zero rows counts as "sufficient user database activity" is unverified.
- Blueprint 2.1 (line 76) says Capacitor gives "Keychain ... via plugins". No first-party plugin exists. It means a community plugin (`@aparajita/capacitor-secure-storage`), subject to the 2 KB limit above.
- Blueprint line 75 says Pointer Events plus Apple Pencil pressure work in a PWA. Not researched here (outside the charter).
- `src/App.jsx:36-41` `KEY_TO_TAB` maps keys to `'Today'`, `'Exams'`, `'Puzzles'`. These are LogicBuilding sub-views, not entries in TABS (`src/tabs/LogicBuilding.jsx:2-4` imports `Today`, `Puzzles`, `Exams`). The new "Today" home tab collides with the existing Logic "Today" sub-view name and with `syncTicks.Today`. Flag for the routing and naming owner.
- The brief says the PWA is "installable". With only an SVG data-URI icon (`public/manifest.json:10-14`), iOS will not use it for `apple-touch-icon` and Chrome install criteria want 192/512 PNGs. iOS takes a PNG apple-touch-icon (180x180). I did not verify the rendering on a device.
- `public/dsa/mastery-map.html:1608` loads supabase-js from a CDN. It will not work offline, in the precached shell, or in a restrictive WKWebView. Pinning and self-hosting it is not covered by any task here.
- The server SQL (`kv_store` table, RLS policies, realtime publication) exists only in `docs/superpowers/specs/2026-09-15-cloud-sync-design.md`. The live project may have drifted. I could not check it.
- I could not read the primary Capacitor and Supabase pages (network allowlist), so the `iosScheme` and realtime-limits claims rest on search summaries.

## Risks

- Sync v2 migration and mastery-map. `public/dsa/mastery-map.html:1652,1678` writes `kv_store` directly. If `kv_store` is dropped or renamed, that page silently stops syncing. Mitigation: keep `kv_store`. Dual-write is not needed for that page.
- Service worker caching `/api/*` or auth responses could serve stale or another user's data. `claimOwner` (`src/sync/engine.js:138`) wipes IndexedDB on user change, but the service worker cache is separate. Mitigation: network-only for `/api/` and `*.supabase.co`, navigation fallback with a denylist for `/api` and `/dsa`, and clear caches on sign-out.
- A stale service worker pins users to an old build and old sync code. Mitigation: `registerType: 'prompt'` with a visible "update available" toast, and no `skipWaiting` mid-edit.
- Data eviction. Safari tabs can lose IndexedDB after 7 days without interaction, and the only cloud copy is `kv_store`, which can be paused or lost. Mitigation: call `navigator.storage.persist()`, and add a JSON export/import (tasks X1-06 and X1-07).
- Free-tier pause means lost sync, and after 90 days only a manual backup remains. Mitigation: daily DB-touching cron (X1-08) plus periodic export.
- Capacitor origin change. Moving users from the Home Screen PWA to the Capacitor app is a different origin and a different storage container, so local data does not carry over. Mitigation: first launch signs in and pulls from Supabase, and `claimOwner` handles ownership. Warn that unsynced edits on the PWA must flush first.
- Native auth session loss on iOS kill (reported by the community). Mitigation: mirror the refresh token to Preferences or Keychain and restore it on boot (X1-13), then test on a device.
- Keychain 2 KB item limit. Mitigation: store only the refresh token plus user id in secure storage, not the whole session.
- CORS: `capacitor://localhost` needs an explicit allowlist on the Vercel handlers, or the Groq proxy stays unreachable. Do not use `*` on `/api/agent`, which spends the owner's quota. It is gated by the Bearer token (`api/agent.js:6-17`), and the CORS allowlist adds defence in depth.
- Apple toolchain: Xcode 26 on a Mac is mandatory. Without a Mac, P3 is not buildable. A third-party source claims App Store Connect rejects uploads from older Xcode (unverified).
- 90-day TestFlight expiry. The app stops launching until a new build is uploaded. Mitigation: a calendar reminder, and the JSON export.
- Dependency drift: `npm i react-router` or `vite@latest` pulls React 19 or Vite 8. Mitigation: pin exact majors in X1-02 and X1-03.
- Vercel cron on Hobby cannot send minute-level reminder pushes. Mitigation: use Supabase `pg_cron`, an external pinger, or Vercel Pro. This is a user decision.
- `supabase-js >=2.116` needs Node >=22 (`engines`). If the Vercel project runs Node 20, the API functions fail. Mitigation: set `engines.node` and the Vercel Node version (X1-02).

## Write-set map

Files my proposed tasks touch, with contention (also touched by other agents' areas):
- `package.json` and `package-lock.json`: HOT. Every dependency task edits them. My chain is serialised: X1-02, then X1-03, then X1-11, then X1-15. Other agents' dependency additions (Playwright, router wrappers) must also join the chain.
- `vite.config.js` (48 lines): HOT. The PWA plugin (X1-05) edits it. Any dev-server, test or Capacitor mode change also edits it. Take one owner per wave.
- `index.html` (X1-04) and `src/main.jsx` (X1-10): WARM. The shell, theme and design-system tasks probably touch both. `src/main.jsx` is a one-line change for me.
- `src/supabaseClient.js` (X1-13): COLD. 9 lines, nobody else is expected to edit it.
- `src/App.jsx`: not touched by X1 tasks. Wiring `persist()`, the update toast and the push opt-in is left to the shell owner, since this file is the biggest contention point.
- `vercel.json` (new, X1-01 then X1-08): COLD but sequential.
- `api/*.js` (X1-09): the six handlers `agent`, `cf`, `health`, `ics`, `puzzle`, `quote` get a one-line `applyCors` call. COLD unless the agents lane edits `api/agent.js` (streaming, AI phase). Order any P5 change to `api/agent.js` after X1-09.
- New files, no contention: `src/platform/*`, `src/pwa/register.js`, `src/sw.js`, `src/push/subscribe.js`, `src/backup/backup.js`, `src/sync/hlc.js`, `supabase/migrations/*`, `public/icons/*`, `capacitor.config.json`, `ios/**`, plus matching `test/*.test.js`.
- `public/manifest.json` (X1-04): WARM. R1's theme-colour tokens may want the same file.

## Needs from the user

- Mac with Xcode 26+ (or confirmation that no iOS build will happen). Capacitor 8 cannot be built or verified on Linux.
- The iOS and iPadOS versions on the user's devices (needed to confirm the iOS 16.4 floor, Web Push and container query support). Unknown.
- Apple Developer Program enrolment ($99/yr) and a team id, before any TestFlight or push work. Decision on TestFlight internal only versus App Store submission (guideline 4.2).
- Vercel plan (Hobby or Pro). It decides whether reminder push can use Vercel cron. Also confirm the Vercel project's Node version is 22.
- Supabase dashboard actions: confirm the project is on the free tier and its current usage (db size, whether it has ever paused). Confirm the live `kv_store` DDL matches the spec doc, and approve the sync v2 migrations (X1-17) before they are applied.
- Secrets to create: `CRON_SECRET` (X1-08), VAPID keypair (X1-15), and later the APNs auth key for native push. Values must not be pasted into chat.
- A custom domain or a stable production URL. It is needed for `VITE_API_BASE` in the Capacitor build and for the CORS allowlist.
- A source image for the app icon (the current one is the fire emoji as an SVG data URI). Otherwise X1-04 uses the emoji.
- Decision: BrowserRouter with Vercel rewrites versus HashRouter. HashRouter avoids the rewrites and works in the Capacitor shell. BrowserRouter gives clean `/life/tasks` URLs as the blueprint describes. I recommend BrowserRouter with X1-01.
- Decision: `react-router-dom` 7.18.5 (15 KB gzip) versus `wouter` (3 KB gzip). The R1 report owns this call. I recommend `react-router-dom`, since data-router APIs are unneeded and the saving is 12 KB.

## Proposed tasks

17 tasks, matching `X1.tasks.json`. Sizes S unless noted.

- X1-01 (P0) Add `vercel.json` with SPA rewrites that exclude `/api`, `/dsa` and static files.
- X1-02 (P0) Add `react-router-dom@7.18.5` and `engines.node >=22` to `package.json`.
- X1-03 (P1) Add `vite-plugin-pwa@2.0.0` and `workbox-window@7.4.1`. Depends on X1-02.
- X1-04 (P1) Generate PNG icons (180, 192, 512, maskable) and wire `manifest.json` and `apple-touch-icon`.
- X1-05 (P1, M) Configure vite-plugin-pwa with injectManifest, a prompt-on-update registration module, and a minimal `src/sw.js`.
- X1-06 (P1) `src/platform/persist.js`: `navigator.storage.persist()` plus an estimate helper, with a test.
- X1-07 (P4, M) `src/backup/backup.js`: JSON export and import of all SYNCED_KEYS, with a test.
- X1-08 (P4) `api/keepalive.js` plus a daily cron entry. Depends on X1-01.
- X1-09 (P3, M) `api/_lib/cors.js` allowlist for `capacitor://localhost`, applied to the six handlers, with a test.
- X1-10 (P3) `src/platform/api.js` fetch shim honouring `VITE_API_BASE`, installed from `src/main.jsx`, with a test.
- X1-11 (P3, M) Capacitor scaffold: dependencies, `capacitor.config.json`, `ios/**` on a Mac. Depends on X1-03 and X1-10.
- X1-12 (P3, M) `src/platform/` adapter (haptics, keyboard, status bar, secure storage) with web fallbacks. Depends on X1-11.
- X1-13 (P3) Mirror the Supabase auth token to native storage and restore it on boot. Depends on X1-12.
- X1-14 (P5) Push handler in `src/sw.js` plus a client subscribe helper. Depends on X1-05.
- X1-15 (P5, M) `api/push.js` plus `supabase/push_subscriptions.sql` and the `web-push` dependency. Depends on X1-11 and X1-14.
- X1-16 (P2) `src/sync/hlc.js`: a pure hybrid logical clock with tests.
- X1-17 (P2, M) `supabase/migrations/0001_sync_v2.sql`: per-record tables, a trigger-assigned `rev`, tombstones, RLS, and a realtime publication. Depends on X1-16. Needs user approval before it is applied.
