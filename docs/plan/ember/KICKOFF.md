# Ember build: start here

You are building design direction A (Ember) for Forge. The owner approved the design; this folder is the plan.

## Read first, in this order
1. `docs/plan/ember/DESIGN.md` — what to build.
2. `docs/designs/app-directions.html` — the mockup. Open it, choose "A · Ember". Its `.A` CSS has the exact values.
3. `docs/plan/ember/PLAN.md` — phases, waves, tasks (rendered from `plan.json`).
4. `docs/plan/WORKFLOW.md`, stage 4 — how a wave is executed in this repo.

## Where to work
- Start from branch `claude/sweet-lamport-ftfktp`. It contains PR #4 (the hybrid build) plus the design and plan files.
- If PR #4 has been merged by the time you start, start from the default branch instead and check that `docs/plan/ember/` is present.
- Baseline before any change: `npm ci && npm test && npm run build`. Stop and report if either fails.

## The plan in one table

| Phase | Goal | Waves | Tasks | Needs the owner |
|---|---|---|---|---|
| E0 Foundations | Runner, theme, fonts, icons, primitives, tab icons | 4 | 13 | sign-off |
| E1 Data and logic | Dailies, timeline, parser, reminder rules, new key | 4 | 14 | sign-off |
| E2 Today | Header, dailies, next up, timeline | 4 | 8 | sign-off |
| E3 Plus and capture | Plus on every tab, capture sheet, shortcuts | 5 | 11 | sign-off |
| E4 Screens | Life, Money, Logic, Invest, Agents, Settings | 5 | 16 | device checklist, sign-off |
| E5 Widgets | Snapshot, bridge, native widgets | 7 | 11 | Mac, Apple account, device test |

Phases run in order. Inside a phase, waves run in order. Inside a wave, every task runs in parallel.
The web app is shippable after E4. E5 is optional until the owner confirms the prerequisites in task `E5-U1`.

## How to run a wave

Task `E0-01` makes the runner accept this plan. Until it is merged, run wave 1 of E0 by hand with the same rules.
After it is merged:

```bash
export FORGE_PLAN=docs/plan/ember/plan.json
node tools/live/wave.mjs next                 # which wave is next and its task ids
node tools/live/wave.mjs prep  <ids...>       # one git worktree and branch per task
node tools/live/wave.mjs brief <id>           # the brief to give that task's agent
node tools/live/wave.mjs check <ids...>       # each task committed, and only inside its write list
node tools/live/wave.mjs merge <ids...>       # merge one at a time; npm test and build after each
node tools/live/wave.mjs clean <ids...>
node scripts/plan/plan-lint.mjs docs/plan/ember/plan.json   # must stay at 0 errors
```

For each wave:
1. **Preflight:** plan lint clean, previous wave merged, `npm test && npm run build` green.
2. **Fan out:** one agent per task, each in its own worktree. Its brief is the task from `plan.json` plus DESIGN.md.
3. **Check and merge:** one branch at a time, tests and build after each merge. A red merge is reverted and the task fixed.
4. **Review:** review the wave's diff and fix findings before the next wave.
5. **Report:** a few lines per wave: done, deviations, plan edits.

At a **gate task** (last wave of each phase): run its acceptance, write the report under `docs/plan/ember/reports/`, then stop and ask the owner to sign off before the next phase.

## Rules for every task
- Touch only the files in the task's `writes`. If another file is needed, stop and report it; do not widen the task yourself.
- The acceptance check must pass, along with `npm test` and `npm run build`.
- Tokens only, no colour literals. Every new component must also render correctly under the `cream` theme.
- Do not touch `supabase/`, sync v2 flags, or any live service. Do not add secrets.
- Only `E0-04` may change `package.json`.
- Commit once per task: `<type>(<scope>): <summary> (<task id>)`. Use your own session's attribution lines.
- Tasks marked 👤 are the owner's. Prepare what they need, then wait.

## Changing the plan
Re-planning is expected. Edit `docs/plan/ember/plan.json`, then:

```bash
node scripts/plan/plan-lint.mjs docs/plan/ember/plan.json --render docs/plan/ember/PLAN.md
```

The lint enforces the two rules that make parallel work safe: no two tasks in a wave write the same file, and every dependency sits in an earlier wave. Note the change in the wave report.

## Open decisions
Ten defaults (E1 to E10) are listed at the top of `PLAN.md`. They are assumed, not confirmed. Task `E0-02` records them. If the owner changes one, update the affected tasks named in its "Affects" column before running them.

## Known risks
- `src/life/screens/Notes.jsx` is 541 lines; `E4-03` restyles it without changing its data handling.
- `E1-06` adds a synced key. It must stay compatible with backups and sync v1; sync v2 stays off.
- Six labelled tabs are tight at 390px; `E0-12` has an e2e check for it.
- Widget sizes in DESIGN.md come from the mockup; `E5-02` must verify them against Apple's current documentation.
- Nothing in this plan has been run on a real iPhone. `E4-U1` and `E5-U2` are the first real-device checks.
