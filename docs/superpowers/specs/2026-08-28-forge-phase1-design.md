# Forge — Phase 1 Design

**Date:** 2026-08-28 (revised)
**Status:** Approved for planning
**Working name:** Forge

## Overview

Forge is a personal web app: a **daily deliberate-practice loop for a software engineer**.
Sharpen (coding + puzzles) → reflect (notes) → learn (LLM tutor agents). It runs as a
web app opened on an iPhone via Add to Home Screen, backed by a tiny serverless proxy.

This document specs **Phase 1 only** — the dashboard spine. Later phases (quant engine,
RSS digest agents) get their own spec → plan → build cycles.

## Goals

- One screen that says what to practice today, adapted to my real Codeforces rating.
- Codeforces problems near my rating, with already-solved ones excluded.
- The Lichess daily puzzle.
- Local, searchable daily notes, optionally tagged to a problem.
- A config-driven agent runtime with three seeded tutor agents.
- Deployable to a free URL, reachable from my iPhone.

## Non-Goals (Phase 1)

- Quant question engine — Phase 2 (LLM-generated, reuses `/api/agent` unchanged).
- RSS digest agents — Phase 3. Content source decided: **public RSS feeds**.
- Spaced-repetition scheduling UI — the `progress` data seam exists, the UI does not.
- In-app agent authoring UI — agents are a bundled JSON file in Phase 1.
- Accounts, multi-device sync, native app, chess board rendering.

## Revisions from first draft

Six corrections, each with its reason:

1. **Server-side filtering, not client-side.** `problemset.problems` is ~10k problems
   (multi-MB) and `user.status` is a user's entire submission history. Shipping those to
   a phone is unacceptable. The proxy now does the fetch + join + filter and returns
   ~20 problems.
2. **One `/api/cf` route, not two.** The server needs both payloads to compute a result,
   so splitting them just doubles round trips and failure modes.
3. **No chess board component.** `api/puzzle/daily` gives a puzzle id; we link out to
   `lichess.org/training/{id}`. Lichess's own board is better than anything we'd build,
   and this deletes a whole dependency.
4. **"Least-practiced tag", not "weakest tag".** On day one there is no failure data, so
   "weakest" is meaningless. Tag *coverage* is computable immediately from solved history.
5. **No agent editor UI.** Bundled `agents.json` is the single source of truth. Adding an
   agent is a JSON edit + redeploy — a fine authoring surface for one engineer, and it
   removes a store, a migration problem, and a screen.
6. **One dev command.** The same handler files are mounted into the Vite dev server by a
   small plugin, so `npm run dev` runs frontend and API together with no second server
   and no Vercel CLI login.

## Architecture

Two constraints force a thin backend; everything else stays local.

- **CORS** blocks the browser from reading the Codeforces API directly.
- **Key safety** — the LLM key must never reach browser code.

```
iPhone / browser
      │
   [ React SPA (Vite) ]  ── notes + progress in IndexedDB (localForage)
      │  fetch
   [ Serverless proxy ]  ── holds GROQ_API_KEY (env var)
      │
   ├─ Codeforces API   (problems + rating + solved history, joined server-side)
   ├─ Lichess API      (daily puzzle metadata)
   └─ Groq API         (agent replies, non-streaming)
```

- **Frontend:** Vite + React SPA. Tabs are component state — no router.
- **Backend:** Vercel serverless functions in `/api`. Pure proxy — no DB, no auth.
- **Storage:** IndexedDB via `localForage`. Settings, notes, progress.
- **Runtime deps:** `react`, `react-dom`, `localforage`. Nothing else.

## Proxy routes

| Route | Behavior |
|---|---|
| `GET /api/health` | `{ ok: true }` — proves the dev middleware and deploy wiring work |
| `GET /api/cf?handle=` | Fetches problemset + user.info + user.status; returns `{ rating, problems[], tagCounts }` (~20 problems) |
| `GET /api/puzzle` | Lichess daily → `{ id, rating, themes[], url }` |
| `POST /api/agent` | `{ systemPrompt, messages }` → Groq → `{ reply }`. Key from env, non-streaming |

Non-streaming is deliberate: Groq runs ~280 tok/s, so a reply lands fast enough that
streaming's added complexity is not worth it.

## Core logic

`pickProblems(problems, rating, solvedIds, limit)` — pure, unit-tested:
- keep problems with a `rating` within ±200 of the user's rating
- drop any whose id (`${contestId}${index}`) is in `solvedIds`
- sort by rating ascending, return `limit`
- unrated user (no `rating` field) → default band centered on 1200

## Data model (IndexedDB)

- **settings**: `{ cfHandle }`
- **notes**: `{ id, createdAt, body, tags[] }`
- **progress**: `{ problemId, status: 'solved'|'skipped', tags[], updatedAt }` — the seam
  spaced repetition and weakness detection read from in Phase 2.

## Screens

**Today** — problem list (adaptive, from `/api/cf`), daily puzzle card (links to Lichess),
one honest metric line: today's solved count + least-practiced tag. Marking a problem
solved/skipped writes `progress`.

**Notes** — create / edit / delete, substring filter, optional tags.

**Agents** — pick from bundled `agents.json`, chat. Three seeded tutors: math &
puzzle-tricks coach, geopolitics concepts, AI architecture concepts.

## Agent runtime

```
POST /api/agent { systemPrompt, messages } -> { reply }
```

Agents are data, not code. Phase 3 digest agents reuse this route unchanged, passing
retrieved RSS text as an extra context message.

## Error handling

- Any proxy failure renders an inline error in that panel only; other panels still work.
- Missing/unknown CF handle → Today prompts to set it rather than erroring.
- Missing `GROQ_API_KEY` → `/api/agent` returns 500 with a clear message the chat shows
  as "agent not configured", not a blank reply.
- IndexedDB unavailable (private mode) → banner warning that data will not persist.

## Testing

- `pickProblems` — unit tests via `node --test` (zero deps): rating band, solved
  exclusion, unrated fallback, limit.
- `/api/health` — proves dev middleware + deploy wiring.
- Other routes — manual curl smoke, documented in README.

## Open items

- **LLM model:** default `llama-3.3-70b-versatile` (Groq, free tier, verified current
  2026-08-28), overridable via `GROQ_MODEL` env var.
