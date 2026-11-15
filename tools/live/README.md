# Forge Live

Live graph of what Claude Code is doing and what the build plan looks like right now. No build step, no dependencies.

```
Claude Code ──hooks──► hook.mjs ──POST /event──► server.mjs ──SSE /events──► browser
                                                   ▲   ▲
                              transcript tail ─────┘   └── git poll (2s) → task status
```

## Run (on the machine where you run Claude Code)

```bash
npm run live          # http://127.0.0.1:4317
```

Open the page, then start or continue a Claude Code session in this repo. `.claude/settings.json` registers the hooks, so
nothing else to configure. If a session was already running, open `/hooks` once or restart it so the hooks load.
Try it without a session: press **Run demo** in the page, or `npm run live:demo`.

## What you see

| Panel | Source |
|---|---|
| Harness strip (Prompt → Context → Model → Gate → Tool → Result → Final) | `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `Stop`, assistant text |
| Agent graph, one node per tool call, one lane per subagent | `PreToolUse` / `PostToolUse` paired by `tool_use_id` |
| `cd` tag on nodes, cwd chip | `cwd` field of each event, `cd` in Bash commands |
| tests / build chips | parsed from Bash output |
| Event feed | all events plus assistant text tailed from the session transcript |
| Build graph (phases → waves → tasks) | `docs/plan/plan.json` + git: branch `wave/<P>-W<n>/<ID>` with commits = committed, merge commit naming it = merged, worktree on it = running |

Mark a task by hand (for example a failure git cannot see):
`curl -X POST localhost:4317/task -H 'content-type: application/json' -d '{"id":"R6-01","s":"failed","note":"red base"}'`
(`"s":"auto"` removes the override).

## Notes

- Hooks print nothing and always exit 0, so they cannot alter or block Claude Code. If the server is not running they exit silently.
- The server binds to 127.0.0.1 and rejects other `Host` headers (set `FORGE_LIVE_ANY_HOST=1` to allow a proxy). POSTs must be `application/json`.
- Events can contain commands, file paths and tool output. They are stored in `.live/` (gitignored) and sent only to the local page.
- Env: `FORGE_LIVE_PORT` (default 4317), `FORGE_LIVE_HOST`, `FORGE_REPO`.
- Each hook costs one short `node` process per event.
