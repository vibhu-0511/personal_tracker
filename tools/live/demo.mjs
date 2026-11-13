#!/usr/bin/env node
// Synthetic Claude Code hook events, to try the live view without a real session.
//   node tools/live/demo.mjs            posts to a running server
// The server also plays this when you press "Run demo" in the page.
import http from 'node:http'
import { fileURLToPath } from 'node:url'

const S = 'demo-session'
const cwd = '/work/personal_tracker'
let n = 0
const id = () => 'toolu_demo_' + (++n)
const pre = (tool, input, agent, u) => ({ hook_event_name: 'PreToolUse', session_id: S, cwd, tool_name: tool, tool_input: input, tool_use_id: u, agent_id: agent })
const post = (tool, input, out, u, agent, fail) => ({ hook_event_name: fail ? 'PostToolUseFailure' : 'PostToolUse', session_id: S, cwd, tool_name: tool, tool_input: input, tool_response: fail ? { error: out } : { stdout: out }, tool_use_id: u, agent_id: agent })

export function demoEvents() {
  n = 0
  const ev = []
  const add = (delay, payload) => ev.push({ delay, payload })
  const call = (tool, input, out, run = 600, agent, fail) => { const u = id(); add(250, pre(tool, input, agent, u)); add(run, post(tool, input, out, u, agent, fail)) }
  add(0, { hook_event_name: 'SessionStart', session_id: S, cwd, source: 'startup' })
  add(400, { hook_event_name: 'UserPromptSubmit', session_id: S, cwd, prompt: 'Run wave 1 of phase P0 with parallel agents' })
  call('Bash', { command: 'git checkout -B dev origin/plan', description: 'Check out the plan branch' }, 'Switched to a new branch', 700)
  call('Read', { file_path: '/work/personal_tracker/docs/plan/WORKFLOW.md' }, '# Forge build workflow ...', 500)
  call('Grep', { pattern: 'wave: 1', path: 'docs/plan' }, 'plan.json: 6 matches', 450)
  call('Bash', { command: 'cd /work/personal_tracker && npm test', description: 'Run unit tests' }, '# tests 109\n# pass 109\n# fail 0', 1400)
  const a = ['R6-01', 'B1-01', 'B3-03'].map(t => ({ t, u: id() }))
  for (const x of a) add(120, pre('Agent', { description: `Task ${x.t}`, subagent_type: 'general-purpose', prompt: '...' }, null, x.u))
  for (const x of a) {
    const ag = 'agent_' + x.t.replace(/\W/g, '')
    for (const [tool, input] of [['Read', { file_path: `/work/wt/${x.t}/src/store.js` }], ['Edit', { file_path: `/work/wt/${x.t}/src/sync/cloudKv.js` }], ['Bash', { command: 'node --test test/', description: `Test ${x.t}` }]]) {
      const u = id(); add(200, pre(tool, input, ag, u)); add(500, post(tool, input, 'ok', u, ag))
    }
  }
  for (const x of a) add(300, post('Agent', { description: `Task ${x.t}` }, `${x.t} done, committed`, x.u))
  add(100, { hook_event_name: 'SubagentStop', session_id: S, cwd, agent_type: 'general-purpose' })
  call('Bash', { command: 'git merge --no-ff wave/P0-W1/R6-01', description: 'Merge R6-01' }, 'Merge made by the ort strategy.', 700)
  call('Bash', { command: 'npm test', description: 'Test after merge' }, '# tests 117\n# pass 117\n# fail 0', 1200)
  call('Bash', { command: 'npm run build', description: 'Build after merge' }, '✓ built in 2.7s', 1200)
  call('Bash', { command: 'node scripts/plan/plan-lint.mjs docs/plan/plan.json' }, '6 phases, 46 waves, 154 tasks; 0 errors, 0 warnings', 500)
  call('Bash', { command: 'cat missing.txt' }, 'cat: missing.txt: No such file or directory', 500, null, true)
  add(300, { hook_event_name: 'Stop', session_id: S, cwd })
  return ev
}

export async function play(post, events = demoEvents()) {
  for (const e of events) { await new Promise(r => setTimeout(r, e.delay)); post(e.payload) }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = +(process.env.FORGE_LIVE_PORT || 4317)
  const send = payload => { const r = http.request({ host: '127.0.0.1', port, path: '/event', method: 'POST', headers: { 'content-type': 'application/json' } }); r.on('error', () => {}); r.end(JSON.stringify(payload)) }
  play(send).then(() => console.log('demo finished'))
}
