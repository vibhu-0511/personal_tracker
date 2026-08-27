# Forge — Phase 1 Design

**Date:** 2026-08-28
**Status:** Approved for planning
**Working name:** Forge

## Overview

Forge is a personal web app: a **daily deliberate-practice loop for a software engineer**.
Sharpen (coding + puzzles) → reflect (notes) → learn (LLM tutor agents). It runs as a
web app you open on your iPhone (Add to Home Screen), backed by a tiny serverless proxy.

This document specs **Phase 1 only** — the dashboard spine. Later phases (quant engine,
RSS digest agents) get their own spec → plan → build cycles.

## Goals

- One screen that tells me what to practice today, adapted to my real skill level.
- Codeforces problems near my rating, with already-solved ones hidden.
- The Lichess daily puzzle.
- Local, searchable daily notes that can attach to a problem/tag.
- A config-driven agent runtime with three tutor agents (math/chess coach,
  geopolitics concepts, AI architecture concepts).
- Deployable to a free URL, reachable from my iPhone.

## Non-Goals (Phase 1)

- Quant question engine — Phase 2.
- RSS digest agents ("newsletter summary", "what's new in AI") — Phase 3. Source decided: **public RSS feeds**.
- Spaced-repetition scheduling UI — the data seam exists, the UI does not.
- Accounts, multi-device sync, native app.

## Architecture

Three constraints force a thin backend; the rest is local-first.

- **CORS** blocks the browser from directly reading the Codeforces API, Lichess, and (later) RSS feeds.
- **API key safety** — the LLM key must never ship in browser code.

```
iPhone / browser
      │
   [ React SPA (Vite) ]  ── notes & progress in IndexedDB (localForage)
      │  fetch
   [ Serverless proxy ]  ── holds LLM key (env var)
      │
   ├─ Codeforces API   (problems, my rating, solved history)
   ├─ Lichess API      (daily puzzle)
   └─ LLM API (Groq)   (agent replies)
```

- **Frontend:** Vite + React SPA. Tabs: Today / Notes / Agents.
- **Backend:** serverless functions (Vercel free tier). Just a proxy — no DB, no auth.
- **Storage:** browser IndexedDB via `localForage`. Notes, practice progress, agent
  configs (seeded from a bundled default, editable), and settings (CF handle) live here.
- **Dev:** localhost; **Prod:** deploy to Vercel, open the URL on the iPhone.

## Serverless proxy routes

| Route | Proxies to | Notes |
|---|---|---|
| `GET /api/cf/problems` | `codeforces.com/api/problemset.problems` | cached in memory per cold start |
| `GET /api/cf/user?handle=` | `.../user.info`, `.../user.rating`, `.../user.status` | returns rating + solved-problem id set |
| `GET /api/puzzle/daily` | `lichess.org/api/puzzle/daily` | passthrough |
| `POST /api/agent` | Groq chat completions | body `{ agentId, messages }`; key from env |

The proxy adds no business logic beyond shaping/caching responses and injecting the key.

## Data model (IndexedDB)

- **settings**: `{ cfHandle, llmModel }`
- **notes**: `{ id, createdAt, body, tags[], linkedProblemId? }`
- **progress**: `{ problemId, status: 'solved'|'skipped'|'attempted', tags[], updatedAt }`
  — Codeforces solved history seeds this; local actions extend it. This is the seam
  spaced-repetition and weakness-detection plug into later.
- **agentConfigs**: `{ id, name, systemPrompt }` — seeded from a bundled default JSON,
  editable in the UI.

## Components

### Today tab
- Fetches my CF rating + solved set (via proxy), pulls `problemset.problems`, filters to
  `rating ± 200`, removes solved, shows a handful.
- Shows the Lichess daily puzzle (embedded board link + prompt).
- A one-line honest metric: today's solved/skipped and current weakest tag (from `progress`).
- Marking a problem solved/skipped writes to `progress`.

### Notes tab
- Create/edit/delete daily notes. Full-text filter over `notes`.
- Optional tag(s) and optional link to a problem id.

### Agents tab
- List of agent configs. Pick one → chat view.
- Chat calls `POST /api/agent` with the agent's `systemPrompt` + message history.
- Config editor: add/edit an agent's name and system prompt (writes to `agentConfigs`).

## Agent runtime

Single function, config-driven:

```
run(agentConfig, messages) -> reply
  POST /api/agent { agentId, systemPrompt, messages }
```

Agents are data, not code. Three seeded configs ship in a bundled `agents.default.json`:
math/chess/puzzle-tricks coach, geopolitics-concepts tutor, AI-architecture tutor.
Adding a fourth agent = adding a JSON entry. Phase 3 digest agents reuse `run` unchanged,
passing retrieved RSS text as an extra context message.

## Error handling

- Proxy failures (CF/Lichess/LLM down or rate-limited) surface a clear inline message per
  panel; the rest of the dashboard still renders. No silent failures.
- Missing/invalid CF handle → Today tab prompts to set it in settings rather than erroring.
- IndexedDB unavailable (private mode edge) → app warns that data won't persist.
- LLM key missing on the server → `/api/agent` returns a clear 500 the UI shows as
  "agent not configured", not a blank chat.

## Testing

- Agent runtime: one runnable check that `run` builds the correct request payload from a
  config + messages (assert-based, no framework).
- CF adaptive filter: a pure function `pickProblems(problems, rating, solvedSet)` with a
  small unit test — the money logic (rating band + solved exclusion).
- Proxy routes: manual smoke via curl documented in README; no e2e harness in Phase 1.

## Deferred seams (so later phases don't require rework)

- `progress` store already records per-problem tags + status → spaced repetition &
  weakness detection read from it.
- `run(agentConfig, messages)` already accepts arbitrary messages → RSS context injects
  with no signature change.
- `agentConfigs` is data → new agents need no code.

## Open items

- **LLM provider default:** Groq (free, fast). Gemini is a drop-in alt if Groq limits bite.
- **Project/repo name:** "Forge" placeholder; rename before first deploy if desired.
