import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { readSessionEvents } from '../tools/agentflow/lib/transcript.mjs'

const line = o => JSON.stringify(o) + '\n'
test('readSessionEvents merges main and subagent transcripts, with labels and parent links', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'af-tr-'))
  try {
    const S = 'sess1'
    fs.writeFileSync(path.join(dir, `${S}.jsonl`),
      line({ type: 'user', timestamp: '2026-01-01T00:00:00Z', message: { role: 'user', content: 'do it' } }) +
      line({ type: 'assistant', timestamp: '2026-01-01T00:00:01Z', message: { role: 'assistant', content: [{ type: 'text', text: 'ok' }, { type: 'tool_use', id: 'tA', name: 'Agent', input: { description: 'T1' } }] } }) +
      'not json\n' +
      line({ type: 'user', timestamp: '2026-01-01T00:00:09Z', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'tA', content: 'done' }] } }) +
      line({ type: 'summary' }))
    fs.mkdirSync(path.join(dir, S, 'subagents'), { recursive: true })
    const sub = path.join(dir, S, 'subagents')
    fs.writeFileSync(path.join(sub, 'agent-abc.jsonl'),
      line({ type: 'user', timestamp: '2026-01-01T00:00:02Z', message: { role: 'user', content: 'sub prompt' } }) +   // a subagent's prompt is not a user prompt
      line({ type: 'assistant', timestamp: '2026-01-01T00:00:03Z', message: { role: 'assistant', content: [{ type: 'tool_use', id: 'tB', name: 'Read', input: { file_path: '/x' } }] } }) +
      line({ type: 'user', timestamp: '2026-01-01T00:00:04Z', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'tB', content: 'x', is_error: true }] } }))
    fs.writeFileSync(path.join(sub, 'agent-abc.meta.json'), JSON.stringify({ description: 'Task T1', toolUseId: 'tA' }))
    const ev = readSessionEvents(dir, S)
    assert.deepEqual(ev.map(e => e.event), ['UserPromptSubmit', 'AssistantText', 'PreToolUse', 'PreToolUse', 'PostToolUseFailure', 'PostToolUse'])
    assert.ok(ev.every((e, i) => i === 0 || ev[i - 1].ts <= e.ts))
    const subRead = ev.find(e => e.tool === 'Read')
    assert.equal(subRead.agent, 'abc'); assert.equal(subRead.agentLabel, 'Task T1'); assert.equal(subRead.parentUse, 'tA')
    assert.equal(ev.find(e => e.event === 'PostToolUseFailure').tool, 'Read')
    assert.equal(ev.at(-1).tool, 'Agent')
  } finally { fs.rmSync(dir, { recursive: true, force: true }) }
})

test('readSessionEvents returns [] for a session without files', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'af-tr-'))
  try { assert.deepEqual(readSessionEvents(dir, 'none'), []) } finally { fs.rmSync(dir, { recursive: true, force: true }) }
})
