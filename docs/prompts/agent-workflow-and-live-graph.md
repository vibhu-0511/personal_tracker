# Prompt: build the agent-swarm workflow and the live graph

Paste everything below the line into Claude Code (in the target repo). It rebuilds, from scratch and generically, the two systems used to build this project: (1) a wave-based swarm workflow that runs many agents in parallel safely, and (2) a live graph that shows what Claude Code is doing and how the build is progressing. The live graph defaults to **port 4777** (not 4317, which the existing copy in `tools/live` uses), so both can run side by side.

---

## ROLE AND GOAL

You are building developer tooling in this repo. Build two things and prove they work:

1. **Swarm workflow ("waveflow")**: turns a task plan into waves of parallel agents. Each agent works in its own git worktree, may touch only the files its task declares, and is merged one at a time behind a test-and-build gate.
2. **Live graph ("agentflow")**: a zero-dependency Node server plus a browser page that streams every Claude Code tool call, subagent, hook event and assistant message as an animated graph, next to a build graph (phases, waves, tasks) whose status is derived from git. Include an "Agentic layers" tab that explains the harness. Also build a standalone variant that works as a hosted artifact page without a server.

Work in the directory `tools/agentflow/` and `docs/plan/`. Do not change product code. Default port **4777**, overridable with `AGENTFLOW_PORT`. Bind to `127.0.0.1`.

## HARD RULES (follow all of them)

- No dependencies beyond Node 20+ (built-in `http`, `fs`, `child_process`, `node:test`). The browser page is plain HTML, CSS and ES modules, no framework, no CDN.
- Never print, store or transmit secrets. Hook payloads can contain commands and file paths: keep them local, gitignore the event store (`.agentflow/`), truncate large fields.
- Hooks must print nothing and always exit 0, so they can never change or block Claude Code.
- Reject cross-origin writes: POST endpoints require `content-type: application/json` and a localhost `Host` header (allow a proxy via `AGENTFLOW_ANY_HOST=1`).
- Do not create or merge a pull request and do not push anywhere unless I explicitly ask. Commit work on the current branch only.
- Write tests first-class (`node --test`): the pure modules below must have unit tests. Do not skip, loosen or delete a test to get green; if a test exposes a real bug, report or fix the bug.
- Report faithfully: say what you ran, what passed, and what you could not verify.

## PART 1: THE SWARM WORKFLOW

### 1.1 Plan file (`docs/plan/plan.json`)
```json
{ "meta": {"decision": "..."},
  "phases": [{ "id": "P0", "name": "...", "goal": "...", "exit": ["..."] }],
  "tasks": [{
    "id": "R1-04", "phase": "P0", "wave": 1, "title": "...", "size": "S|M|L",
    "owner": "user",                  // optional: tasks only a human can do
    "urgent": true,                   // optional: scheduled first
    "writes": ["src/router.js", "test/router.test.js", "e2e/matrix/**"],  // globs allowed
    "reads":  ["src/App.jsx"],
    "deps":   ["B1-01"],
    "acceptance": "a runnable command or an observable behaviour",
    "notes": "context, risks"
  }] }
```
Write a linter `scripts/plan/plan-lint.mjs` (with tests) that fails on: write-set overlap between tasks in the same wave, a dependency not in an earlier wave, unknown task or phase, non-contiguous waves, missing acceptance, size outside S/M/L, a dependency on a later phase, and a cycle. Warn on a wave wider than 6.

### 1.2 Runner (`tools/agentflow/wave.mjs`) commands
- `next`: derive each task's status from git (see 2.3), then print JSON for the next batch: take the earliest wave that has runnable tasks (all deps merged, not owner `user`, not marked blocked), add up to 6 tasks total, and **pull forward** later runnable tasks whose `writes` and `reads` do not overlap anything already picked. Also print `blockedInWave` (with what each waits on) and `userInWave`.
- `prep ID...`: for each task `git worktree add -b wave/<phase>-W<wave>/<id> <WT>/<id> HEAD` (**from the current HEAD of the integration branch, not from the default branch**), symlink `node_modules`, and write `<WT>/<id>.base` with the base sha. `WT` defaults to a directory outside the repo (for example `../wt`) so worktrees never show up as untracked files.
- `brief ID`: print a complete agent brief (see 1.3).
- `check ID...`: verify the branch has at least one commit, the worktree is clean, and every changed file matches the task's `writes` (support `*` and `**` globs).
- `merge ID...`: per task, `git merge --no-ff` with a message naming the branch; run `npm test` then `npm run build`; **if red, `git reset --hard` to the pre-merge sha and report the failure**; after all, run the plan linter. Never leave the integration branch red.
- `clean ID...`: remove worktrees and base files (branches stay as history).
- `status`: counts per phase and status.
- Optional manual overrides through the live server (`POST /task {id, s, note}`, stored in `.agentflow/overrides.json`) for states git cannot see (failed, blocked).

### 1.3 Agent brief (what each agent receives)
Task JSON and title; the exact **write list**; the read list and which docs to read; acceptance; plan notes; and these rules: work only inside your worktree; touch nothing outside the write list (if another file is needed, stop and report which and why); do not invent facts; no network, no secrets, no live databases; run tests and build before committing; stage only the write list by explicit path (never `git add -A`); **commit once on your branch** with a message ending in your trailer lines; do not push; final report of at most 10 lines (branch, sha, files, tests, acceptance output, deviations).
The orchestrator launches each agent with a one-line prompt: `Run "node tools/agentflow/wave.mjs brief <ID>" and do exactly what the brief says.` Launch all agents of a batch in **one turn** so they run in parallel.

### 1.4 Orchestration loop (you, the main session)
For each batch: `next` → `prep` → launch agents in parallel → wait for their reports → `check` → `merge` (gate) → `clean` → push the integration branch if I asked → next batch. Do not wait for my approval between waves. Never start tasks with `owner: user`; list them for me at the end and mark the phase gates they block. Add a short review step after risky merges (an independent read-only reviewer agent that must verify each finding before reporting).

### 1.5 Failure handling you must implement or follow
- An agent can stop on a usage limit with nothing committed: resume it with `SendMessage` to the same agent id; its worktree and transcript are saved.
- An agent can finish without committing, or report "blocked": verify the commit exists on its branch (do not trust the report alone).
- If a guard or test outside an agent's write list fails because the task's own change made it stale, widen that agent's write list by that one file and tell it exactly what to change; never weaken the test.
- Risky changes (data layer, sync, auth) ship **behind a flag that defaults OFF**, with a test proving behaviour is identical with the flag off. Anything needing a Mac, device, account or live service is a user task, not an agent task.

## PART 2: THE LIVE GRAPH (port 4777)

### 2.1 Data flow
```
Claude Code --hooks--> hook.mjs --POST /event--> server.mjs --SSE /events--> browser
                                                  ^        ^
                              transcript tail ----+        +---- git poll every 2s (task status)
```

### 2.2 Files
```
tools/agentflow/
  hook.mjs            reads hook JSON on stdin, POSTs to the server (700ms timeout), prints nothing, exit 0
  server.mjs          http + SSE, persistence to .agentflow/events.jsonl (ring of last 2000), static UI
  wave.mjs            (Part 1)
  lib/graph.mjs       PURE: normalize(payload), newModel(), reduce(model, event), messageEvents(...)
  lib/build.mjs       PURE deriveStatuses(plan, repo, overrides) + readRepo(cwd) (git via execFile)
  lib/transcript.mjs  reads a session transcript and its subagent transcripts into normalized events
  feed.mjs            writes a compact JSON snapshot (recent events + task states) for the hosted-artifact variant
  ui/index.html       the page (Live tab and Agentic layers tab)
  demo.mjs            synthetic session events, also served by POST /demo
  artifact/build.mjs  builds a standalone single-file page from ui/index.html + lib/graph.mjs
  README.md
.claude/settings.json  registers hook.mjs for the events below
```
`.claude/settings.json` registers `node "$CLAUDE_PROJECT_DIR/tools/agentflow/hook.mjs"` (timeout 3) for: SessionStart, UserPromptSubmit, PreToolUse (matcher `*`), PostToolUse (matcher `*`), Notification, Stop, SubagentStop, PreCompact, SessionEnd. Note that a session already running may need `/hooks` opened once, or a restart, to load new hooks.

### 2.3 Server behaviour
- Endpoints: `POST /event` (hook payload, 204), `GET /events` (SSE, named events `hello`, `ev`, `build`; replay events newer than `Last-Event-ID` or the last 30 minutes; keepalive comment every 15s), `GET /api/plan`, `GET /api/state`, `POST /task` (override), `POST /demo`, `GET /health`, `GET /` (UI). Serve only a whitelist of static files.
- Transcript tail: on the first event that carries `transcript_path`, start at the end of that file and poll every 600ms for appended lines; emit assistant text blocks.
- **Task status from git** (poll every 2s, broadcast `build` only when it changed): task `T` is `merged` if a merge commit subject names its branch `wave/<phase>-W<n>/<T>` (so deleting branches is fine) or its branch tip is in HEAD with own commits; `committed` if its branch has commits not in HEAD; `running` if its branch exists with no own commits (a fresh worktree); `yours` if `owner: user`; `blocked`/`failed` from overrides; otherwise `queued`. "Own commits" means commits since the branch's merge-base with HEAD, **not** commits not in the default branch.

### 2.4 Event model (`lib/graph.mjs`, pure and tested)
Normalize a hook payload to `{ts, event, session, agent, agentLabel, parentUse, cwd, tool, toolUseId, input, output, error, prompt, message, text}`, truncating strings (input 2000, output 4000). Classify tools into families (shell, file, search, agent, skill, mcp, web, artifact, task, other). Build a model with: nodes (one per tool call plus marks for lifecycle events), lanes (`main` plus one per subagent id), pairing of Pre and Post by `tool_use_id` with a fallback of the last running node of the same tool, states `running | ok | fail`, a subagent lane linked to the exact Agent call via `parent_tool_use_id` (fallback: the latest running Agent call), counters (tools, running, errors, subagents), a `cd` tag when a Bash command changes directory, and chips for test and build results parsed from Bash output (`# pass N`, `# fail N`, `built in`). Unit-test: pairing, parallel calls, failure, subagent lanes and parent linking, lifecycle marks, truncation, status derivation (merged by merge-commit subject, committed, running, yours, override, and a branch with zero own commits is running, not merged).

### 2.5 The page (`ui/index.html`)
Dark and light themes through CSS variables, responsive down to a phone, keyboard accessible, `prefers-reduced-motion` respected.
- **Header chips:** connection state, cwd, git branch and sha with dirty count, tests, build, events per second.
- **Harness strip:** Prompt, Context, Model, Gate, Tool, Result, Final; the current stage lights up with a travelling dash between stages.
- **Agent graph (SVG):** a node per tool call (family colour and name, two-line label, dashed ring while running, tick or cross when done), lanes per subagent with a purple spawn edge from the exact parent call, columns computed per lane, lane labels pinned on the left while scrolling, a Follow toggle, and a legend. Keep at most the last 160 nodes. Click a node to see its input and output in an inspector.
- **Event feed:** terminal-style, one line per event (time, event, tool, summary, duration, first line of output), pause-scroll toggle.
- **Build graph:** a cell per phase with a segmented progress bar, wave chips, task cards with a pipeline (queued, running, committed, merged) that flash when status changes; it auto-follows the active wave until the user clicks. Click a task for writes, deps, acceptance and branch.
- **Agentic layers tab:** (a) a stack of the harness layers (interface and session, context assembly, model, guardrails, hooks, tools, orchestration, state and outputs) whose boxes flash when the live session uses them and show real counts; (b) an animated 14-step swimlane trace of one turn (You, Harness, Hooks, Guardrails, Model, Tools, Subagent) with Play, Back, Next; (c) a guardrail flow with example tool calls animated through deny rules, mode, classifier and hooks; (d) the wave loop (scheduler, worktrees, parallel agents, write-set check, merge gate, push, and the usage-limit-and-resume branch); (e) the context window in prompt order; (f) a responsibility matrix. Every description must be true of the harness; mark anything uncertain as such.
- A **Run demo** button that plays synthetic events so the page can be tried with no session.

### 2.6 Hosted-artifact variant (works on an iPad, no local server)
A hosted page cannot reach a local server or arbitrary hosts, and a session-events connector may not be available in every app. Build it so that: `artifact/build.mjs` inlines `lib/graph.mjs` and a data adapter into one HTML file; the adapter reads a **snapshot document from the page's own database capability** (recent events and task states) and renders it with the same reducer; `feed.mjs` produces that snapshot from the session transcript files (main plus one file per subagent, including each subagent's description and the tool call that started it) and from git; the orchestrator pushes a fresh snapshot after each launch and merge. Say plainly in the page and README that this variant updates when a snapshot is pushed, not continuously.

## DELIVERABLES AND ACCEPTANCE

1. All files above, committed on the current branch in small commits (no PR, no push).
2. `node --test` passes for the plan linter, `graph.mjs`, `build.mjs`, `transcript.mjs`, and wave helper logic (glob matching, pull-forward selection).
3. Start the server on **4777**, then show: `curl localhost:4777/health`; post a synthetic Pre and Post event with `hook.mjs` and see it on `/events`; press Run demo in a headless browser and verify nodes, a subagent lane, the harness strip and no console errors at 1280px and 400px (no horizontal page scroll); verify the Agentic layers tab renders and animates.
4. A dry run of the workflow on a tiny sample plan with three tasks (two parallel with disjoint writes, one dependent): `next`, `prep`, simulate agents by committing a file in each worktree, `check`, `merge` (with a deliberately failing test on one branch to prove the revert), `clean`, and show the build graph turning running, committed, merged from git alone.
5. A final report: what was built, what was verified and how, what you could not verify, and the exact commands to start everything (`node tools/agentflow/server.mjs`, hooks setup, and the orchestration loop). Remind me that the hooks capture command text and paths, and that nothing was pushed.

## LESSONS FROM THE ORIGINAL BUILD (apply them)

- Create worktrees from the integration branch HEAD; branching from the default branch hides earlier merges from agents.
- Verify an agent really committed (some end their turn with the work uncommitted). Resume stopped agents instead of starting new ones.
- Treat a write list as globs, and widen it by exactly one file when a stale guard blocks a task; never weaken a test.
- Keep a scratch subfolder per agent so parallel agents do not overwrite each other's temp files.
- Put risky features behind default-off flags with a parity test, and give every user-only action (accounts, devices, live databases, credentials) to the human.
- Lazy-load code that is off by default; a size budget caught v2 sync code shipped to everyone.
- An independent read-only reviewer that must verify each finding found real data-loss bugs the tests had missed; run one after big merges.
