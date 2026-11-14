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
| `AGENT_RATE_PER_MIN` | no | — |
| `AGENT_RATE_PER_DAY` | no | — |
| `VITE_SUPABASE_URL` | yes | — |
| `VITE_SUPABASE_ANON_KEY` | yes | — |
| `VITE_API_BASE` | no | empty (same-origin `/api/*`) |

- `OWNER_USER_ID` is the Supabase user id of the one account allowed to call `/api/agent`.
  If it is unset, the endpoint rejects every request (fail-closed).
- `ALLOWED_ORIGINS` is a comma-separated list of extra browser origins for CORS on `/api/*`.
  It is added to the built-in defaults `capacitor://localhost`, `https://localhost` and
  `http://localhost:5173`.
- `AGENT_RATE_PER_MIN` and `AGENT_RATE_PER_DAY` are the per-user call limits for
  `/api/agent` (positive integers). The limiter in `api/_lib/rateLimit.js` takes them as
  inputs; the handler wiring is a separate task, so no default is set here.
- `VITE_API_BASE` is the absolute API origin for builds that cannot use relative `/api/*`,
  such as the Capacitor iOS app.

Cloud sync uses a Supabase project. See
`docs/superpowers/specs/2026-09-15-cloud-sync-design.md` for the schema and
the SQL to run once in the Supabase SQL Editor.

## Tests

```bash
npm test            # node --test "test/*.test.js": pure logic, router, shortcuts, CSS guards
npm run build       # production build (vite build)
npm run test:e2e    # Playwright smoke spec (builds with --mode e2e, serves on :4173)
```

`npm test` has no browser: the logic modules, the route table and router, the shortcut
matcher and command registry, and static CSS guards (`test/shellCss.test.js`) all run
in node. `npm run test:e2e` drives Chromium only (`e2e/smoke.spec.js`, hermetic fixtures
in `e2e/fixtures/`) across five viewport projects: iPhone 14 (390x844), iPad portrait
(834x1194), iPad landscape (1194x834), iPad split view third (375x1024) and desktop
Chrome (1440x900). It needs Playwright's Chromium installed.

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
- `test/` — node unit tests; `e2e/` — Playwright specs.
- `docs/adr/` — architecture decision records (see `docs/adr/README.md` for the index).
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

## Not built yet

These are ideas, not shipped features:

- Quant question engine (LLM-generated, reusing `/api/agent`), with spaced repetition over
  the existing `progress` store.
- RSS digest agents (newsletter and AI-news summarization).
