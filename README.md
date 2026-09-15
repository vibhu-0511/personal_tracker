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
| `GROQ_API_KEY` | yes | — |
| `GROQ_MODEL` | no | `llama-3.3-70b-versatile` |
| `VITE_SUPABASE_URL` | yes | — |
| `VITE_SUPABASE_ANON_KEY` | yes | — |

Cloud sync uses a Supabase project. See
`docs/superpowers/specs/2026-09-15-cloud-sync-design.md` for the schema and
the SQL to run once in the Supabase SQL Editor.

## Tests

```bash
npm test
```

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
  `forge-api-dev` plugin in `vite.config.js`, so `npm run dev` runs the API too.
- `src/tabs/` — the tab screens. `Life.jsx` (tasks, reminders, habits, notes) is the
  default tab; its pure math (streaks, wallet, pet state, quick-add parsing) lives in
  `src/life/logic.js`.
- `src/store.js` — IndexedDB wrappers, synced to Supabase (`src/supabaseClient.js`,
  `src/sync/logic.js`). Local-first: reads/writes never block on network.
- `public/dsa/` — the DSA mastery map tool, synced via its own small script (same
  Supabase project, same signed-in session).
- `src/agents.json` — agent definitions. **To add an agent, add an entry here.** No code
  change is needed.

## Deploy

```bash
npx vercel --prod
```

Set `GROQ_API_KEY`, `VITE_SUPABASE_URL`, and `VITE_SUPABASE_ANON_KEY` in the
Vercel project's environment variables. Then open the deployed URL on your
iPhone and use Share → Add to Home Screen.

## Not built yet

- Phase 2: quant question engine (LLM-generated, reuses `/api/agent`), spaced repetition
  over the existing `progress` store.
- Phase 3: RSS digest agents (newsletter + AI-news summarization).
