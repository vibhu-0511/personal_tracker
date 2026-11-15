import test from 'node:test'
import assert from 'node:assert/strict'
import { normalize, reduce, newModel, familyOf, labelOf, cdOf, messageEvents } from '../tools/agentflow/lib/graph.mjs'

const pre = (tool, input, id, extra = {}) => normalize({ hook_event_name: 'PreToolUse', session_id: 's', tool_name: tool, tool_input: input, tool_use_id: id, cwd: '/r', ...extra }, 1000)
const post = (tool, input, resp, id, name = 'PostToolUse', extra = {}) => normalize({ hook_event_name: name, session_id: 's', tool_name: tool, tool_input: input, tool_response: resp, tool_use_id: id, cwd: '/r', ...extra }, 2500)

test('familyOf and labelOf classify tools', () => {
  assert.equal(familyOf('Bash'), 'shell')
  assert.equal(familyOf('Edit'), 'file')
  assert.equal(familyOf('Agent'), 'agent')
  assert.equal(familyOf('mcp__github__get_file_contents'), 'mcp')
  assert.equal(familyOf('TaskCreate'), 'task')
  assert.equal(labelOf('Read', { file_path: '/a/b/c.js' }), 'c.js')
  assert.equal(labelOf('mcp__github__get_me', {}), 'github · get_me')
})

test('cdOf finds a directory change in a command', () => {
  assert.equal(cdOf('cd /work/repo && npm test'), '/work/repo')
  assert.equal(cdOf('ls; cd "a b"; pwd'), 'a b')
  assert.equal(cdOf('npm test'), null)
})

test('a tool call pairs Pre and Post by tool_use_id and records result', () => {
  const m = newModel()
  reduce(m, pre('Bash', { command: 'npm test' }, 'u1'))
  assert.equal(m.nodes[0].state, 'running')
  assert.equal(m.counts.running, 1)
  assert.equal(m.stage, 'tool')
  reduce(m, post('Bash', { command: 'npm test' }, { stdout: '# tests 5\n# pass 5\n# fail 0' }, 'u1'))
  assert.equal(m.nodes.length, 1)
  assert.equal(m.nodes[0].state, 'ok')
  assert.equal(m.counts.running, 0)
  assert.deepEqual(m.checks.tests && { pass: m.checks.tests.pass, fail: m.checks.tests.fail }, { pass: 5, fail: 0 })
  assert.equal(m.stage, 'result')
})

test('failures and parallel calls are tracked separately', () => {
  const m = newModel()
  reduce(m, pre('Agent', { description: 'a' }, 'a1'))
  reduce(m, pre('Agent', { description: 'b' }, 'a2'))
  assert.equal(m.counts.running, 2)
  assert.equal(m.counts.agents, 2)
  reduce(m, post('Agent', {}, 'done', 'a2'))
  reduce(m, post('Bash', { command: 'x' }, { error: 'boom' }, 'zz', 'PostToolUseFailure'))
  assert.equal(m.nodes.find(n => n.toolUseId === 'a2').state, 'ok')
  assert.equal(m.nodes.find(n => n.toolUseId === 'a1').state, 'running')
  assert.equal(m.counts.error, 1)
  assert.equal(m.nodes.at(-1).state, 'fail')
})

test('subagent events get their own lane linked to the spawning Agent call', () => {
  const m = newModel()
  reduce(m, pre('Agent', { description: 'x' }, 'a1'))
  reduce(m, pre('Read', { file_path: '/f' }, 'r1', { agent_id: 'ag1', agent_type: 'general-purpose' }))
  assert.deepEqual(m.lanes, ['main', 'ag1'])
  assert.equal(m.nodes[1].parent, m.nodes[0].id)
})

test('parent_tool_use_id links a subagent lane to the exact Agent call', () => {
  const m = newModel()
  reduce(m, pre('Agent', { description: 'a' }, 'a1'))
  reduce(m, pre('Agent', { description: 'b' }, 'a2'))
  reduce(m, pre('Read', { file_path: '/f' }, 'r1', { agent_id: 'ag1', agent_label: 'task a', parent_tool_use_id: 'a1' }))
  assert.equal(m.nodes[2].parent, m.nodes[0].id)
  assert.equal(m.laneInfo.ag1.label, 'task a')
})

test('lifecycle events become marks and drive the stage', () => {
  const m = newModel()
  reduce(m, normalize({ hook_event_name: 'UserPromptSubmit', session_id: 's', prompt: 'hello' }, 1))
  assert.equal(m.stage, 'prompt')
  reduce(m, normalize({ hook_event_name: 'Stop', session_id: 's' }, 2))
  assert.equal(m.stage, 'final')
  assert.equal(m.nodes.length, 2)
  assert.equal(m.nodes[0].type, 'mark')
})

test('normalize truncates huge payloads', () => {
  const e = normalize({ hook_event_name: 'PostToolUse', tool_name: 'Bash', tool_response: { stdout: 'x'.repeat(10000) }, tool_input: { command: 'y'.repeat(9000) } })
  assert.ok(e.output.length < 4100)
  assert.ok(e.input.command.length < 2100)
})

test('Bash output feeds the tests and build chips', () => {
  const m = newModel()
  reduce(m, pre('Bash', { command: 'cd /w && npm run build' }, 'b1'))
  assert.equal(m.nodes[0].cd, '/w')
  reduce(m, post('Bash', { command: 'cd /w && npm run build' }, { stdout: '✓ built in 2.7s' }, 'b1'))
  assert.deepEqual(m.checks.build && m.checks.build.ok, true)
  reduce(m, pre('Bash', { command: 'npm test' }, 'b2'))
  reduce(m, post('Bash', { command: 'npm test' }, { stdout: '# pass 3\n# fail 2' }, 'b2'))
  assert.equal(m.checks.tests.fail, 2)
})

test('Post without a matching Pre falls back to the last running node of the same tool', () => {
  const m = newModel()
  reduce(m, pre('Read', { file_path: '/a' }, ''))
  reduce(m, post('Read', { file_path: '/a' }, 'ok', 'unknown-id'))
  assert.equal(m.nodes.length, 1)
  assert.equal(m.nodes[0].state, 'ok')
})

test('a subagent lane without parent_tool_use_id attaches to the latest running Agent call', () => {
  const m = newModel()
  reduce(m, pre('Agent', { description: 'a' }, 'a1'))
  reduce(m, pre('Agent', { description: 'b' }, 'a2'))
  reduce(m, pre('Read', { file_path: '/f' }, 'r1', { agent_id: 'ag9' }))
  assert.equal(m.nodes[2].parent, m.nodes[1].id)
})

test('normalize keeps the documented fields and truncates strings', () => {
  const e = normalize({ hook_event_name: 'PreToolUse', session_id: 's', agent_id: 'x', cwd: '/c', transcript_path: '/t.jsonl', tool_name: 'Bash', tool_use_id: 'u', tool_input: { command: 'q' } }, 5)
  for (const k of ['ts', 'event', 'session', 'agent', 'agentLabel', 'parentUse', 'cwd', 'tool', 'toolUseId', 'input', 'output', 'error', 'prompt', 'message', 'text']) assert.ok(k in e, k)
  assert.equal(e.transcript, '/t.jsonl')
  assert.equal(normalize(null).event, 'Unknown')
})

test('messageEvents turns transcript blocks into pre/post/text events', () => {
  const useName = new Map()
  const a = messageEvents('assistant', [{ type: 'text', text: 'hi' }, { type: 'tool_use', id: 't1', name: 'Bash', input: { command: 'ls' } }], 10, { useName })
  assert.deepEqual(a.map(e => e.event), ['AssistantText', 'PreToolUse'])
  const u = messageEvents('user', [{ type: 'tool_result', tool_use_id: 't1', content: 'out', is_error: true }], 20, { useName })
  assert.equal(u[0].event, 'PostToolUseFailure')
  assert.equal(u[0].tool, 'Bash')
})
