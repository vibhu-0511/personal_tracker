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

## Tests

```bash
npm test
```

## API smoke tests

```bash
curl http://localhost:5173/api/health
curl "http://localhost:5173/api/cf?handle=tourist"
curl http://localhost:5173/api/puzzle
```

## Layout

- `api/` — serverless functions (Vercel). Also mounted into the Vite dev server by the
  `forge-api-dev` plugin in `vite.config.js`, so `npm run dev` runs the API too.
- `src/tabs/` — the three screens.
- `src/store.js` — IndexedDB wrappers. All user data is local to the browser.
- `src/agents.json` — agent definitions. **To add an agent, add an entry here.** No code
  change is needed.

## Deploy

```bash
npx vercel --prod
```

Set `GROQ_API_KEY` in the Vercel project's environment variables. Then open the
deployed URL on your iPhone and use Share → Add to Home Screen.

## Not built yet

- Phase 2: quant question engine (LLM-generated, reuses `/api/agent`), spaced repetition
  over the existing `progress` store.
- Phase 3: RSS digest agents (newsletter + AI-news summarization).
