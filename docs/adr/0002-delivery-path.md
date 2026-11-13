# ADR-0002: Delivery path: PWA first, Capacitor second, API base URL and CORS

- Status: Accepted (open items listed at the end)
- Date: 2026-11-13
- Task: B1-03 (Forge plan, P0)
- Related: blueprint section 2.1 and 2.6, errata E-05, plan tasks R5-01, R5-02, R5-03, R5-04, R5-06, B1-12
- Scope: this ADR records the decision only. The code changes belong to the R5 and R7 tasks named below.

## Context

Forge is one React build that has to reach an iPhone and an iPad. The blueprint compares five delivery shells (blueprint section 2.1): PWA, Capacitor, Tauri 2, React Native / Expo and SwiftUI. It rates a PWA at about 100% reuse of today's React code and Capacitor at about 95%. It rates the others lower, down to a second codebase for SwiftUI.

Today every network call to our own backend is a relative URL such as `/api/agent`, `/api/quote` and `/api/cf`. That works in a browser and in an installed PWA, because the page and the functions share one origin. It does not work in a Capacitor build:

- A Capacitor iOS app serves the bundled app from `capacitor://localhost`, so a relative `/api/...` request resolves against that origin and never reaches the deployed functions. (Source: X1 report, from search summaries of the Capacitor docs; not verified at the primary page.)
- No handler in `api/` sends any `Access-Control-*` header, and `/api/agent` answers `OPTIONS` with 405. A cross-origin call that carries an `Authorization: Bearer` header triggers a preflight, so every call from a native bundle would fail at the preflight.
- `/api/agent` spends the owner's Groq quota. It is gated by the owner's Supabase token and `OWNER_USER_ID`. A bundle is inspectable, so any key placed in it is a leaked key (blueprint section 2.6).

## Decision

### 1. Delivery order

1. PWA first (plan phase P1). Installable from the browser, no store, reuses the current build unchanged. The per-platform code is limited to a thin platform adapter (storage, notifications, haptics, pencil input).
2. Capacitor second (plan phase P3). A WKWebView shell around the same build for iOS and iPadOS, for what a PWA cannot do: APNs push, Keychain, native haptics, share sheet.
3. Tauri, React Native and SwiftUI are not pursued. Tauri stays optional because a desktop PWA install covers most of it.

The Capacitor shell ships the bundled app. It must not load the app from a remote URL through `server.url`. That would make `/api` same-origin and skip CORS, but it would break offline use and risks store review. (Recorded as an inference in the R5 report, risk R-J, not as a verified fact.) The API is therefore always reached cross-origin from the native app, and the API base URL and CORS rules below are required before P3 starts.

### 2. API base URL: `VITE_API_BASE`

- One build-time variable, `VITE_API_BASE`, holds the absolute origin of the deployed API, for example `https://<production-domain>`. The production domain is an open item, so this ADR does not name one.
- Empty or unset means relative URLs. This is the default for the web build, the PWA and `vite dev` / `vite preview`, where the page and `/api` share an origin.
- Set it for the Capacitor build (for example through a dedicated native build mode and env file). In that build the app origin is `capacitor://localhost` and every API call goes to the absolute base. A native build with `VITE_API_BASE` empty is a defect, because every call would fail.
- Handling rules, implemented once in a single helper (`apiUrl(path)` and `apiFetch`, task R5-01):
  - `apiUrl('/api/x')` returns `/api/x` when the base is empty and `<base>/api/x` otherwise. A trailing slash on the base must not produce a double slash.
  - `apiFetch` is the only way application code calls our own API, and it attaches `Authorization: Bearer <token>` only when a session token exists.
  - Application code under `src/` must not fetch a relative `/api` path directly. A guard test enforces this (task R5-02).
  - The value is public by construction, since it is compiled into the bundle. It is an origin, not a secret.
- Third-party hosts that the client already calls directly (for example `api.mfapi.in`) are unaffected by `VITE_API_BASE`.

### 3. CORS allow-list rule

CORS is implemented on the server with an explicit origin allow-list. Native CORS-free HTTP through a Capacitor plugin is not used, because the allow-list also serves the PWA on a custom domain and keeps one code path.

- The allow-list is exact-match on the request `Origin` header. There are no wildcard or suffix matches and no regular expressions.
- The built-in entries are the app origins: `capacitor://localhost` (iOS Capacitor shell), `https://localhost` (kept for the case where the iOS scheme is switched to https, see open items) and `http://localhost:5173` (local Vite development).
- Extra origins, such as the production web origin, come from the `ALLOWED_ORIGINS` environment variable, as a comma-separated list. The production web origin is added there, not hard-coded.
- For an allowed origin the server echoes that exact origin in `Access-Control-Allow-Origin` and sets `Vary: Origin`. For any other origin it sends no `Access-Control-Allow-Origin`, and the browser blocks the response. The value `*` is never sent, and never on `/api/agent`.
- `OPTIONS` preflight returns 204 with the allowed methods and headers (at least `Content-Type` and `Authorization`) and does no other work.
- One shared helper applies this to every handler (`api/_lib/http.js`, task R5-03, applied by R5-04 and, for `/api/agent`, R5-06).
- CORS is defence in depth, not authentication. It only tells a browser which pages may read a response. Authentication stays where it is: the Bearer token check in `/api/agent`, which compares the Supabase user with `OWNER_USER_ID` and answers 403 otherwise. Moving to a CORS allow-list must not weaken or relocate that gate.

### 4. The Groq key never ships in a bundle

- `GROQ_API_KEY` exists only as a server-side environment variable read by `api/agent.js`. The client never calls Groq directly, in the web build or the native build.
- No secret may use the `VITE_` prefix or otherwise be compiled into the web bundle, the Capacitor web assets or the IPA. Only public values belong there (the Supabase URL and anon key, and `VITE_API_BASE`).
- The LLM stays behind `/api/agent`, which is owner-gated. Streaming and rate limits are added later behind the same endpoint.
- Verification, as part of the phase exit checks: search the built `dist/` output and the native web assets for the key value and for `api.groq.com`, and expect no match.

## Consequences

- Positive: one build serves the web, the PWA and the native shell. The only per-environment difference is `VITE_API_BASE` plus the allow-list entries.
- Positive: the quota-spending endpoint keeps both its owner gate and a restrictive origin policy.
- Cost: the native app needs a deployed, reachable API and a stable origin to put in `VITE_API_BASE` and `ALLOWED_ORIGINS`. It cannot work purely offline against its own functions, so API features degrade offline, as they do in the PWA.
- Cost: a Bearer-bearing cross-origin call always costs a preflight round trip. Responses can reduce this with `Access-Control-Max-Age`.
- Risk: someone "fixes" a failing native call by calling Groq from the client. This ADR forbids it, and the bundle check above is the control.
- Risk: the allow-list and `VITE_API_BASE` drift apart after a domain change. Both must be updated together, and the runbook for the iOS release (B1-12) should say so.
- Ordering: the base URL helper and CORS must land before the Capacitor phase (P3). A strict content security policy for the native build, whose `connect-src` includes the `VITE_API_BASE` origin, is a separate task (R5-16) and not decided here.

## Open items (not decided by this ADR)

- The final production domain. It is needed for `VITE_API_BASE` and `ALLOWED_ORIGINS`.
- Whether the iOS scheme stays `capacitor://localhost` or changes. X1 found forum reports that overriding it did not take effect (medium confidence, not verified at the primary source), so the allow-list keeps both `capacitor://localhost` and `https://localhost`. Re-check against the Capacitor version actually installed when P3 starts.
- Whether `/api/cf` and `/api/quote` also require the owner token. That is a separate decision, not part of this ADR.
