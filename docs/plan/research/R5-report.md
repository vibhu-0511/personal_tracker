# R5 report: API, agents and security

## Summary
- Six `/api` call sites in 5 files use relative URLs (Invest.jsx x2, Today.jsx, Life.jsx anchor, Puzzles.jsx, Agents.jsx). All break under `capacitor://localhost`. No handler sends CORS headers, and `/api/agent` answers OPTIONS with 405, so every cross-origin call from a native bundle fails at preflight.
- `/api/agent` is correctly owner-gated (Supabase JWT, `OWNER_USER_ID`, fail-closed). It has no rate limit, no body or message validation, no `max_tokens`, no upstream timeout, and a null-reply path.
- Model mismatch: code default is `openai/gpt-oss-120b`. `.env.example` and README still say `llama-3.3-70b-versatile`, which the commit message says is no longer available on Groq free tier. Anyone copying `.env.example` gets a broken agent.
- SSE is feasible on the Node runtime with `res.write`, but `api/agent.js` and `Agents.jsx` are both whole-response JSON today. EventSource cannot POST or send Authorization, so the client must use fetch streaming.
- No `vercel.json`. Consequences: no SPA rewrite (breaks the planned `/life/tasks` routes on Vercel unless the router is hash-based), no security headers, no cache header on `/api/puzzle`, default region and timeout.
- CSP: a strict `script-src 'self'` is feasible for the main app (no inline scripts) but not for `public/dsa/mastery-map.html` (2 inline scripts, 39 `style=`, unpinned CDN script). The DSA page needs its own looser header rule. A Capacitor bundle needs a meta-tag CSP, because HTTP headers do not apply to the custom scheme.
- Proposed 19 tasks. New files and `api/**` only, so write-sets are disjoint. Serial chain on `api/agent.js` (R5-06, 08, 10). Hot spots: `vite.config.js`, `vercel.json`, `src/tabs/*.jsx`.

## Facts
Call sites and native origin
- `fetch('/api/quote?...')` at src/tabs/Invest.jsx:435 and :669. `/api/cf` URL built at src/tabs/Today.jsx:37, fetched at :59. `/api/puzzle` at src/tabs/Puzzles.jsx:36. `/api/agent` at src/tabs/Agents.jsx:54. `/api/ics` is a plain `<a href>` navigation (src/tabs/Life.jsx:654-655, :715), not a fetch. Total: 6 call sites in 5 files.
- Direct third-party browser fetches (no proxy): `https://api.mfapi.in/...` at src/tabs/Invest.jsx:460 and :718. `/puzzles.json` (static asset) at src/puzzles.js:5 is fine under a bundle.
- No `Access-Control-*` header and no OPTIONS handling anywhere in api/** (grep of api/ shows none). `api/agent.js:20` returns 405 for any non-POST, so a preflight (Authorization + JSON content type) is rejected.
- `api/ics.js:8-9` returns `Content-Disposition: attachment`. A link-triggered download of it cannot carry an Authorization header, so ics cannot be owner-gated while it stays a link.
- `toICS`/`validateICSInput` are pure (api/_lib/ics.js:9-39), so they can run client-side. `icsEscape` (api/_lib/ics.js:1-3) escapes `\`, `,`, `;` but not CR/LF, and `validateICSInput` only trims the ends (:30-31), so `%0D%0A` in `title` injects ICS properties.

/api/agent
- Auth flow: Bearer token from header (api/agent.js:9), env `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `OWNER_USER_ID` (:10-12), returns false if any is missing (:13), then `supabase.auth.getUser(token)` and `data.user.id === ownerUserId` (:15-16). Handler: 405 on non-POST (:20), 403 "Not authorized" (:22-24), 500 "Agent is not configured" when `GROQ_API_KEY` missing (:26-29), 400 on bad shape (:31-34), generic 502 with `console.error` on upstream failure (:48-51).
- A new Supabase client and a network `getUser` call are made on every request (api/agent.js:14-15).
- Validation is only `typeof systemPrompt === 'string'` and `Array.isArray(messages)` (:32). No limits on message count, content type or length, role values, or body size. The client supplies the system prompt (src/tabs/Agents.jsx:57), so the owner's token can set any system prompt.
- No `max_tokens`, no `AbortSignal` on the Groq fetch (api/agent.js:37-44). `j.choices[0].message.content` is returned unchecked (:47).
- Security commit 3ed4a76 (2026-09-17) added the owner gate, genericised errors in agent/cf/puzzle/quote and the dev middleware, fixed cf `page` NaN, and removed client sign-up. It states the Supabase dashboard sign-up toggle is still a manual owner action. Earlier: 2f66c14 (POST-only, `..` guard), 7ba1c40 (model default).
- The commit message for 3ed4a76 says "no rate limit" existed; none was added. `ratelimit` is a blueprint graph node tagged P1 (docs/forge-blueprint.html:1029).
- Error text reaches the UI raw on the client side: `setError(e.message)` at src/tabs/Agents.jsx:63, Today.jsx:62, Puzzles.jsx:39.
- Conversation history is module-level (src/tabs/Agents.jsx:22-23) and the full history is re-sent each turn (:57). The UI footer says "Powered by Groq LLM" (:126).

Other handlers
- api/cf.js: no method check, no auth, `user.status?...count=10000` per request (:43), module-level `problemsCache` per warm instance (:15, :39-41), `handle` unbounded (:29).
- api/quote.js: no auth, max 25 symbols and regex-validated (:3-4, :29-35), 60 s in-memory cache (:5-7), spoofed browser User-Agent (:15), comment "Yahoo is unofficial/ToS-grey" (:23).
- api/puzzle.js:6 and api/health.js:2 set no `Cache-Control`.
- Handler contract is Vercel's Node `(req, res)` with `res.status().json()` and `req.query`. The dev shim fakes `res.status/json/req.query` (vite.config.js:24-33).

Dev middleware (vite.config.js)
- Body is read fully with no size cap, then `JSON.parse` (vite.config.js:35-39). Malformed JSON falls to the catch and returns 500 "Internal error" (:42-45), not 400.
- Handlers are mounted for dev and preview (`configureServer`, `configurePreviewServer`, :50-51). `Object.assign(process.env, loadEnv(mode, cwd, ''))` copies all `.env` vars into the server process (:56); only `VITE_*` reach `import.meta.env`.
- The raw Node `res` is passed through (vite.config.js:41). Inference: `res.write()` streaming works in dev without changes, because Vite's middleware stack adds no compression by default.

Runtime and deploy defaults (no vercel.json)
- `vercel.json` absent (verified `ls`). No `engines` field in package.json (package.json:1-28). Local Node is v22.23.4. `.gitignore` ignores `.env`, `.vercel`, `node_modules`, `dist`.
- Inference: (unverified here, X1 should confirm) the Node version comes from the Vercel project setting; function timeout and region are plan defaults (region default iad1). Supabase is in ap-northeast-2 (docs/superpowers/specs/2026-09-15-cloud-sync-design.md:19), so each `getUser` is a cross-region round trip.
- Inference: Vite's preset auto-detects. Without `vercel.json` rewrites, a deep link such as `/life/tasks` returns 404 from Vercel static hosting. `/api/puzzle` has no `s-maxage`, so the CDN does not cache it.
- README says deploy with `npx vercel --prod` and lists three env vars (README:61-67). `OWNER_USER_ID` is missing from README:18-23, README:65 and .env.example:1-4.

Models and env
- Code default: `openai/gpt-oss-120b` (api/agent.js:4), override `GROQ_MODEL` (:41). `.env.example:2` sets `GROQ_MODEL=llama-3.3-70b-versatile`; README:21 says the same default.
- Commit 7ba1c40 changed only api/agent.js, reason "llama-3.3-70b-versatile is no longer available on Groq free tier".

Secrets and CSP inputs
- Supabase URL and anon key are hardcoded in public/dsa/mastery-map.html:1613-1614 (anon-role JWT, public by design; RLS protects data per spec lines 62-69). The page loads `@supabase/supabase-js@2` from jsDelivr with no version pin or SRI (:1608). The installed version is 2.116.0 (node_modules/@supabase/supabase-js/package.json).
- DSA page: 2 inline `<script>` blocks (public/dsa/mastery-map.html:1609, :1775), 39 `style=` attributes, Google Fonts stylesheet at :7. Commit ae02b75 filtered its `localStorage` snapshot to `mastery_`/`roadmap_` keys because it used to upload the Supabase session token (:1623-1635).
- Main app: index.html has one external module script (index.html:17), no inline script. It has data-URI icons (index.html:11-12, public/manifest.json icons). 364 JSX `style=` props (React sets them via CSSOM, which CSP does not block). `dangerouslySetInnerHTML` appears once (src/tabs/Invest.jsx:204) with hand-written strings; two contain `style="..."` markup (src/invest/course.js:70, :234). No other `innerHTML`, `eval` or `new Function` in src.
- `canvas-confetti` default fire uses `useWorker: true` (node_modules/canvas-confetti/src/confetti.js:722), called from src/tabs/Life.jsx:75-76.
- Inference: that creates a blob worker, so `worker-src blob:` is needed in the CSP.
- Supabase client is created with no options (src/supabaseClient.js:9), so the session sits in WKWebView `localStorage`, not Keychain. Auth is `signInWithPassword` only (src/App.jsx:154). Realtime opens `wss://<project>.supabase.co` (src/App.jsx:103-105).
- Notes are rendered as React text, not HTML (no `dangerouslySetInnerHTML` in src/tabs/Notes.jsx).
- Inference: the blueprint's "user notes get rendered" XSS concern (docs/forge-blueprint.html:1033) is a future risk (markdown or RAG), not current.

## Gaps and contradictions
- Repo fact "node_modules not installed in this checkout" is wrong: `node_modules/` exists with 49 top-level entries, including `@supabase/supabase-js` 2.116.0. Not modified by R5.
- The task said no git commands; the read scope asks for `git log` on api/. I ran read-only `git log` / `git show` only.
- Blueprint 2.2 (blueprint.txt:83) says the proxy exists only to hold the Groq key and bypass Codeforces CORS. Code also proxies Lichess (api/puzzle.js), Yahoo (api/quote.js) and generates ICS (api/ics.js). Yahoo does need a proxy. Lichess and ICS probably do not.
- Blueprint 2.6 says "LLM stays behind /api/agent (owner-gated)... add SSE streaming later" (blueprint.txt:117). Accurate for gating. It omits CORS and API base URL, which the Capacitor phase needs, and omits `max_tokens`/timeout/limits.
- Blueprint graph schedules `ratelimit` and `proxy` at P1, `csp` at P4, `llmgw`/`sse` at P5 (docs/forge-blueprint.html:1028-1047). Capacitor is P3, so CORS/base URL must land before P3 and CSP-as-meta cannot wait until P4 for a store submission.
- README/.env.example model default contradicts code (see Facts). README also omits `OWNER_USER_ID`.
- README:10 says "paste your Groq API key"; it never mentions that `/api/agent` needs a signed-in owner session. The sync spec (spec:79-91) predates the owner gate and says nothing about it.
- Sync spec says Vercel env vars `VITE_SUPABASE_*` "are not secret" (spec:193-195). True, but server code now relies on them being present in `process.env` on Vercel (api/agent.js:10-11). Hardcoded in the DSA file as well (see Facts), so a project key rotation touches three places.
- Hash router vs history router (R1 decision) changes whether `vercel.json` needs a catch-all rewrite. I assume history routing and propose the rewrite; drop it if R1 picks hash.
- Blueprint learning graph nodes `auth`, `rls`, `csp`, `ratelimit`, `llmgw`, `sse`, `proxy`, `serverless` are only in the HTML (docs/forge-blueprint.html:1018-1048), not in blueprint.txt, which has a `[diagram]` placeholder (blueprint.txt:125).

## Risks
- R-A: Native bundle ships and every API call fails (no base URL, no CORS, `/api/ics` link navigates the webview away). Mitigation: R5-01/02/03/04 before P3; make ics client-side (cross-area, one line in R5-02 notes).
- R-B: Owner-only agent proxy can still be drained by a stolen owner session or a runaway client loop. Mitigation: R5-07/08 per-user limit (e.g. 20/min, 300/day) plus `max_tokens` and message caps in R5-05/06.
- R-C: Groq reasoning models can return `content: null` when output is truncated. That null is stored in message history and re-sent, so every later turn 400s upstream and surfaces as 502 until the page reloads. Inference on Groq behaviour; the missing guard is at api/agent.js:47. Mitigation: R5-06 guard and `max_tokens`.
- R-D: Following README/.env.example sends a removed model to Groq; first agent call fails with a generic 502 that hides the cause. Mitigation: R5-18 fixes docs; R5-06 logs upstream status server-side.
- R-E: Public unauthenticated `/api/cf` (10,000-row upstream pull per call) and `/api/quote` (up to 25 upstream calls per call) are amplification vectors and may get the Vercel IP banned by Codeforces/Yahoo. Mitigation: owner decision below; short-term `s-maxage` caching in R5-04.
- R-F: CSP too strict breaks the app silently (confetti worker, `style=` markup in Invest course HTML, Google Fonts on DSA). Mitigation: R5-15 ships `Content-Security-Policy-Report-Only` first, with a documented switch; `/dsa/` gets a separate rule.
- R-G: Session token in WKWebView `localStorage` is readable by any injected script and is not hardware-backed. Mitigation: custom `auth.storage` adapter over a Keychain plugin (cross-area, needs `src/supabaseClient.js`; owned by native/R6 lane).
- R-H: Streaming on Vercel is unverified here. If the platform buffers or times out (default duration unknown), replies stall. Mitigation: R5-10 keeps non-stream mode as the fallback and the client falls back when `Content-Type` is not `text/event-stream`; set `maxDuration` in R5-14.
- R-I: Unpinned `@supabase/supabase-js@2` on the DSA page from a CDN with no SRI: a compromised or breaking release runs with the signed-in origin's storage. Mitigation: R5-17.
- R-J: Loading the app from a remote URL in Capacitor (`server.url`) would make `/api` same-origin and skip CORS, but kills offline and risks store review. Inference. Prefer the bundled app plus API base URL.
- R-K: The Vercel region (default iad1, inference) is far from Supabase Seoul; owner verification adds a trans-Pacific hop per agent call. Mitigation: set a region near Seoul in R5-14 (user to confirm), or verify the JWT locally (HS256 secret or JWKS) later.

## Write-set map
Files the build will touch in this area, with contention:
- New, uncontended (R5 only): `api/_lib/http.js`, `api/_lib/auth.js`, `api/_lib/agentInput.js`, `api/_lib/rateLimit.js`, `api/_lib/sse.js`, `src/api/base.js`, `src/api/client.js`, `src/agents/stream.js`, `config/csp.js`, `vite-plugins/apiDev.js`, `vite-plugins/cspMeta.js`, `docs/sql/agent_usage.sql`, `scripts/check-bundle-secrets.mjs`, new `test/*.test.js`.
- `api/agent.js`: R5-06 -> R5-08 -> R5-10, strictly serial.
- `api/cf.js`, `api/quote.js`, `api/puzzle.js`, `api/ics.js`, `api/health.js`, `api/_lib/ics.js`, `test/ics.test.js`: R5-04 only.
- HOT SPOT `vite.config.js`: R5-13 then R5-16; also the PWA task (R7 lane, `vite-plugin-pwa` or manual) and any router/alias work. Everything else must dep on R5-13 and edit only the plugin list line.
- HOT SPOT `vercel.json` (new): R5-14, then R5-15; the PWA/router lanes (`/sw.js` no-cache header, SPA rewrite) must dep on R5-14.
- HOT SPOT `src/tabs/Invest.jsx`, `Today.jsx`, `Life.jsx`, `Puzzles.jsx`: R5-02 touches one line each; the R2/R3/R4 file-split and redesign tasks own these. Run R5-02 after them and re-resolve paths if files move.
- HOT SPOT `src/tabs/Agents.jsx`: R5-12 only from R5; the design lane also redesigns the Agents screen, so order them explicitly.
- `.env.example`, `README.md`: R5-18 only from R5; other lanes add their own env vars and should dep on it.
- `public/dsa/mastery-map.html` (8,320 lines): R5-17 changes only line 1608; R3 lane owns the file.
- Not in R5 scope but implied: `package.json` (no new dependency is needed by any R5 task), `src/supabaseClient.js` (Keychain storage adapter), `index.html` (CSP meta is injected by plugin, so no hand edit).

## Needs from the user
- Decision: gate `/api/cf` and `/api/quote` behind the owner JWT too (stops public abuse, requires `apiFetch` with Bearer on those calls)? Default proposed: yes, after R5-02.
- Decision: model to use in production. Confirm what `GROQ_MODEL` is set to in the Vercel dashboard today, and whether `openai/gpt-oss-120b` should stay the default.
- Dashboard actions: Supabase sign-up toggle off (still pending per commit 3ed4a76); run `docs/sql/agent_usage.sql` in the SQL editor after R5-07; confirm `OWNER_USER_ID` is set in Vercel.
- Vercel facts: project Node version and plan (Hobby vs Pro, for `maxDuration`), and whether you want the function region moved near Seoul.
- Capacitor facts (for R5-04 allow-list): final production domain, and whether the iOS scheme stays `capacitor://localhost` or is switched to `https://`.
- Decision: use native CORS-free HTTP (Capacitor HTTP plugin) or CORS on the server? Proposed: CORS allow-list, since it also works for the PWA on a custom domain.

## Proposed tasks
Phase hints follow the blueprint graph; the API work is independent of UI and can run early. Matches `docs/plan/research/R5.tasks.json`.
- R5-01 (S, P0) Add `apiUrl`/`apiFetch` helper with `VITE_API_BASE` and Bearer injection, plus test.
- R5-02 (S, P3) Route 4 screen call sites through `apiFetch`. Dep R5-01; run after screen-split tasks.
- R5-03 (S, P1) Add `api/_lib/http.js`: origin allow-list CORS, preflight, capped JSON body reader, cache helper.
- R5-04 (M, P1) Apply CORS/method guards/cache headers to cf, puzzle, quote, ics, health; fix ICS CRLF injection. Dep R5-03.
- R5-05 (S, P1) Extract `api/_lib/auth.js` (injectable owner check) and `api/_lib/agentInput.js` (validation and limits), with tests.
- R5-06 (M, P1) Rewire `api/agent.js` onto the libs: CORS, validation, `max_tokens`, upstream timeout, null-reply guard, handler test. Deps R5-03, R5-05.
- R5-07 (S, P1) Add rate-limit core plus Supabase usage-table SQL and test. User action: run SQL.
- R5-08 (S, P1) Wire the rate limit into `api/agent.js` with 429 and `Retry-After`. Deps R5-06, R5-07.
- R5-09 (S, P5) Add Groq SSE chunk parser lib with fixture tests.
- R5-10 (M, P5) Add streaming mode to `api/agent.js` (`stream: true` -> `text/event-stream`), non-stream kept. Deps R5-08, R5-09.
- R5-11 (S, P5) Add client stream reader (`fetch` + `ReadableStream`, abort) with test. Dep R5-01.
- R5-12 (M, P5) Render streamed replies incrementally in `Agents.jsx` with Stop and fallback. Deps R5-10, R5-11.
- R5-13 (S, P0) Extract the dev API plugin to `vite-plugins/apiDev.js`; body cap, 400 on bad JSON, OPTIONS.
- R5-14 (S, P0) Add `vercel.json`: SPA rewrite, function `maxDuration`/region, `/api/puzzle` cache header, test.
- R5-15 (M, P4) Add `config/csp.js` and security headers to `vercel.json`, report-only first; separate `/dsa/` rule. Dep R5-14.
- R5-16 (S, P3) Add Vite plugin that injects the CSP meta tag for the native build. Deps R5-13, R5-15.
- R5-17 (S, P4) Pin and SRI-protect the DSA page's supabase-js CDN script (line 1608).
- R5-18 (S, P1) Fix `.env.example` and README env/deploy docs (model default, `OWNER_USER_ID`, `VITE_API_BASE`, `ALLOWED_ORIGINS`). Deps R5-06, R5-07, R5-03.
- R5-19 (S, P4) Add a post-build bundle secret scanner (`dist/` must not contain Groq or service-role keys) with test.
