# Agentflow

Two things, zero dependencies beyond Node 20+:

1. **waveflow** (`wave.mjs`): turns `docs/plan/plan.json` into waves of parallel agents. Each agent works in its own git worktree, may touch only the files its task declares, and is merged one at a time behind a test-and-build gate.
2. **Live graph** (`server.mjs` + `ui/index.html`): streams every Claude Code tool call, subagent, hook event and assistant message as an animated graph, next to a build graph (phases, waves, tasks) whose status is derived from git, plus an "Agentic layers" tab.

It runs next to the older copy in `tools/live` (port 4317); agentflow defaults to **4777**.

```
Claude Code --hooks--> hook.mjs --POST /event--> server.mjs --SSE /events--> browser
                                                  ^        ^
                              transcript tail ----+        +---- git poll every 2s (task status)
```

## Start

```bash
node tools/agentflow/server.mjs          # or: npm run agentflow  -> http://127.0.0.1:4777
```

`.claude/settings.json` registers `node "$CLAUDE_PROJECT_DIR/tools/agentflow/hook.mjs"` (timeout 3) for SessionStart, UserPromptSubmit, PreToolUse, PostToolUse, Notification, Stop, SubagentStop, PreCompact, SessionEnd. A session that is already running may need `/hooks` opened once, or a restart, to load them. No session handy: press **Run demo** in the page, or `npm run agentflow:demo`.

Env: `AGENTFLOW_PORT` (4777), `AGENTFLOW_HOST` (127.0.0.1), `AGENTFLOW_ANY_HOST=1` (accept any Host header, for a proxy), `AGENTFLOW_REPO`, `AGENTFLOW_PLAN` (docs/plan/plan.json).

## Safety

- Hooks print nothing and always exit 0, so they cannot change or block Claude Code. If the server is down they exit silently.
- Hook payloads contain **command text, file paths and tool output**. They are stored in `.agentflow/` (gitignored, ring of the last 2000 events), truncated (input 2000, output 4000 chars), and sent only to the local page. Never put secrets on a command line.
- POST endpoints require `content-type: application/json` and a localhost `Host` header. Only whitelisted static files are served.

## Endpoints

`POST /event` (hook payload, 204) · `GET /events` (SSE: `hello`, `ev`, `build`; replay after `Last-Event-ID`, or the last 30 minutes; keepalive every 15s) · `GET /api/plan` · `GET /api/state` · `POST /task {id, s, note}` (override: failed, blocked, ... or `"s":"auto"` to clear; stored in `.agentflow/overrides.json`) · `POST /demo` · `GET /health` · `GET /`.

The first event carrying `transcript_path` starts a tail at the end of that file (poll 600ms) that emits assistant text.

## Task status comes from git

Branch `wave/<phase>-W<n>/<id>`. `merged`: a merge commit subject names the branch (deleting branches is fine) or the tip is in HEAD with own commits. `committed`: commits not in HEAD. `running`: branch exists with no own commits (fresh worktree). `yours`: `owner: user`. `blocked`/`failed`: overrides. Else `queued`. "Own commits" = commits since the branch's merge-base with HEAD (not versus the default branch). A branch fast-forwarded into HEAD has zero own commits, so use the runner's `merge` (always `--no-ff`).

## Waveflow

```bash
node tools/agentflow/wave.mjs next          # JSON: batch (<=6), pulledForward, blockedInWave, userInWave
node tools/agentflow/wave.mjs prep ID...    # worktree + branch from current HEAD, node_modules symlink, <WT>/<id>.base
node tools/agentflow/wave.mjs brief ID      # full agent brief
node tools/agentflow/wave.mjs check ID...   # >=1 commit, clean worktree, every changed file matches writes (* and **)
node tools/agentflow/wave.mjs merge ID...   # merge --no-ff; test + build; red => git reset --hard to pre-merge sha
node tools/agentflow/wave.mjs clean ID...   # remove worktrees and base files (branches stay)
node tools/agentflow/wave.mjs status
node scripts/plan/plan-lint.mjs docs/plan/plan.json
```

Env: `AGENTFLOW_WT` (default `<repo>/../wt`), `AGENTFLOW_TEST_CMD` (`npm test`), `AGENTFLOW_BUILD_CMD` (`npm run build`), `AGENTFLOW_TRAILERS` (trailer lines for briefs and merge commits; default a plain `Co-Authored-By: Claude <noreply@anthropic.com>`).

Orchestration loop: `next` -> `prep` -> launch every agent of the batch in one turn with the prompt `Run "node tools/agentflow/wave.mjs brief <ID>" and do exactly what the brief says.` -> wait -> `check` -> `merge` -> `clean` -> next batch. Never start `owner: user` tasks. If an agent stops on a usage limit, resume it with SendMessage; verify the commit exists rather than trusting the report. Widen a write list by one file if a stale guard blocks, never weaken a test. Ship risky changes behind a default-off flag with a parity test.

## Standalone (hosted artifact) variant

`artifact/build.mjs <out.html> [session_id]` inlines `lib/graph.mjs` and `artifact/adapter.js` into one HTML file. The adapter reads a snapshot document (collection `agentflow`, doc `feed`) from the page's database capability. `feed.mjs <out.json>` writes that snapshot from the transcript files (main plus one per subagent) and git. **This variant updates when a snapshot is pushed, not continuously.** Live connector polling is only enabled if you pass a session id at build time.

## Tests

`npm test` runs `test/agentflow*.test.js` (graph, build, transcript, wave helpers, server) and `test/planLint.test.js`.
