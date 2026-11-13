import test from 'node:test'
import assert from 'node:assert/strict'
import { normalize, reduce, newModel, familyOf, labelOf, cdOf } from '../tools/live/lib/graph.mjs'
import { deriveStatuses } from '../tools/live/lib/build.mjs'

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

test('deriveStatuses reads branches and merge commits', () => {
  const plan = [{ id: 'A-01' }, { id: 'A-02' }, { id: 'A-03' }, { id: 'A-04' }, { id: 'U-1', o: 'user' }, { id: 'A-05' }]
  const repo = {
    branches: [
      { name: 'wave/P0-W1/A-01', sha: 'a', own: 1, inHead: true },     // merged by ancestry
      { name: 'wave/P0-W1/A-02', sha: 'b', own: 2, inHead: false },    // committed, not merged
      { name: 'wave/P0-W1/A-03', sha: 'c', own: 0, inHead: true },     // fresh worktree, no commits yet
    ],
    mergeSubjects: ['Merge wave/P0-W1/A-04 into dev branch (P0 wave 1)'],  // branch already deleted
  }
  const s = deriveStatuses(plan, repo, { 'A-05': { s: 'failed', note: 'red base' } })
  assert.equal(s['A-01'].s, 'merged')
  assert.equal(s['A-02'].s, 'committed')
  assert.equal(s['A-03'].s, 'running')
  assert.equal(s['A-04'].s, 'merged')
  assert.equal(s['U-1'].s, 'yours')
  assert.equal(s['A-05'].s, 'failed')
  assert.equal(s['A-05'].note, 'red base')
})
