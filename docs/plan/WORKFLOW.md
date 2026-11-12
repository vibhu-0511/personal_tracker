# Forge build workflow

Decision (2026-11-12): **hybrid A + B** — A's responsive shell and domain screens, B's bento Today home. Definition lives in `swarm.json` → `decision`.

The workflow has five stages. Stages 1–3 produce the plan; stage 4 builds it. **Nothing in `src/` changes until the plan is approved.**

```
0 Decide ──► 1 Swarm (10 agents, parallel, read-only) ──► 2 Synthesize ──► 3 Validate ──► 4 Execute wave by wave
 swarm.json     docs/plan/research/*                        plan.json        plan-lint        worktree per task, merge gate
```

## Stage 1 — Intel swarm (one wave, 10 agents in parallel)

Source of truth: `docs/plan/swarm.json`. Every agent gets its prompt from `node scripts/plan/swarm-prompt.mjs <ID>`, so charters, questions and the output contract cannot drift.

| ID | Covers | Reads |
|---|---|---|
| R1 | Shell, CSS, router, tokens | `styles.css`, `App.jsx`, `Sheet/Toast`, `index.html` |
| R2 | Life: tasks, reminders, notes, habits, growth | `Life.jsx`, `Notes.jsx`, `life/logic.js`, `dnd/` |
| R3 | Logic: code, puzzles, exams, DSA map embed | `LogicBuilding`, `Today.jsx`, `Puzzles`, `Exams`, `api/cf`, `public/dsa/` |
| R4 | Money + Invest, file splits | `Expenses.jsx`, `Invest.jsx`, `money/`, `invest/`, `api/quote` |
| R5 | API, agents, security, native/CORS, streaming | `api/`, `Agents.jsx`, `vite.config.js` |
| R6 | Data + sync v2 (schema, client, migration) | `store.js`, `sync/`, sync specs |
| R7 | Baseline run, PWA, E2E, CI | `package.json`, `vite.config.js`, `test/` — runs `npm ci/test/build` |
| B1 | Blueprint requirements, contradictions, learning track | `blueprint.txt` |
| B3 | Hybrid design spec + component inventory | blueprint design CSS/JS, `styles.css` |
| X1 | External facts with sources (Capacitor, iOS PWA, Supabase, libs) | web + `npm view` |

Each agent writes `docs/plan/research/<ID>-report.md` (fixed headings) and `<ID>.tasks.json` (proposed tasks with exact write-sets).

Gate: `node scripts/plan/swarm-prompt.mjs --check` and `node scripts/plan/plan-lint.mjs --proposals docs/plan/research` must both pass. A failed agent is re-run alone with the same prompt.

## Stage 2 — Synthesis (phases → waves → tasks)

Input: all reports + proposals. Output: `docs/plan/plan.json`, rendered to `PLAN.md`.

Phases (from blueprint 2.7, adjusted by research):

| Phase | Goal |
|---|---|
| P0 | Hybrid design system + responsive shell + routes + Today home |
| P1 | Installable PWA: icons, offline shell, update UX |
| P2 | Sync v2: per-record rows, tombstones, HLC, outbox, migration |
| P3 | Native shell: Capacitor iOS/iPadOS, push, Keychain, Pencil notes |
| P4 | Quality + ops: E2E device matrix, CI, error tracking, backups |
| P5 | AI upgrades: SSE streaming, notes RAG, evals |

Rules the synthesis must follow:

1. **Wave = a set of tasks that can run at the same time.** A task may depend only on tasks in earlier waves (same phase or earlier phase).
2. **Disjoint write-sets inside a wave.** Single-writer hot spots (`package.json`, `package-lock.json`, `src/App.jsx`, `src/styles.css`, `vite.config.js`) get their own task or are owned by exactly one task per wave.
3. **Primitives before screens, tests with the code they test.** Pure logic + its unit test is one task; UI that consumes it is a later wave.
4. **Size discipline.** S/M tasks only; split any L. Widest wave is 6 tasks unless the write-sets are trivially separate.
5. **Every task has a runnable acceptance check** (a command, or an observable behaviour at a named viewport).
6. **Each phase ends in a gate task** (verification wave) and lists exit criteria.
7. **Learning track:** each phase lists the blueprint-graph concepts to learn before it starts (from `B1`).
8. **User-only actions** (Supabase dashboard, Apple account, icons, device list) are explicit tasks marked `user`, scheduled before the wave that needs them.

## Stage 3 — Validate

```bash
node scripts/plan/plan-lint.mjs docs/plan/plan.json --render docs/plan/PLAN.md
node --test test/planLint.test.js
```

Fails on: write-set overlap inside a wave, dependency not in an earlier wave, unknown task/phase, non-contiguous waves, missing acceptance, size outside S/M/L. Warns on: wave wider than 6, same-wave read-after-write.

## Stage 4 — Execute (after approval)

For each wave, in order:

1. **Preflight** — `plan-lint` clean; previous wave merged; `npm test && npm run build` green on the base branch.
2. **Fan out** — one agent per task, in parallel, each in its own git worktree/branch (`wave/P0-W2/<task-id>`), brief = task JSON + the research report sections it cites. An agent may touch only its `writes`; it must add or update tests named in `acceptance`.
3. **Merge gate** — merge branches one at a time (disjoint write-sets → no conflicts by construction); after each merge run `npm test && npm run build`. A failing task is fixed or reverted; the wave does not advance with a red base.
4. **Review** — run `/code-review` on the wave diff; fix findings before the next wave.
5. **Wave report** — tasks done, deviations from plan, new risks, plan edits (re-lint after any edit).
6. **Phase gate** — at the end of a phase run its exit criteria (responsive matrix screenshots for P0, offline/install check for P1, two-device sync simulation for P2, and so on) and stop for sign-off.

Re-planning is normal: when a wave reveals new facts, edit `plan.json`, re-lint, re-render, note it in the wave report.

## Files

| Path | Role |
|---|---|
| `docs/plan/swarm.json` | swarm roster, decision, output contract |
| `docs/plan/blueprint.txt` | clean text of the blueprint (regenerate with `scripts/plan/blueprint-text.mjs`) |
| `docs/plan/research/` | agent reports and task proposals |
| `docs/plan/plan.json` | the plan (source of truth) |
| `docs/plan/PLAN.md` | generated view of the plan |
| `scripts/plan/swarm-prompt.mjs` | prompt generator + completeness gate |
| `scripts/plan/plan-lint.mjs` | plan validator + renderer |
| `test/planLint.test.js` | tests for the validator |
