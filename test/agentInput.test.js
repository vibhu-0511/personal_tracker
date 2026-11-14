import test from 'node:test'
import assert from 'node:assert/strict'
import { validateAgentInput } from '../api/_lib/agentInput.js'

const ok = (over = {}) => ({ systemPrompt: 'be brief', messages: [{ role: 'user', content: 'hi' }], ...over })

test('accepts a valid body and returns cleaned fields', () => {
  const r = validateAgentInput(ok({ messages: [{ role: 'user', content: 'hi', extra: 1 }, { role: 'assistant', content: 'yo' }] }))
  assert.equal(r.ok, true)
  assert.deepEqual(r.value.messages, [{ role: 'user', content: 'hi' }, { role: 'assistant', content: 'yo' }])
  assert.equal(r.value.systemPrompt, 'be brief')
})

test('rejects non-object bodies', () => {
  for (const b of [null, undefined, 'x', 5, []]) assert.equal(validateAgentInput(b).ok, false)
})

test('systemPrompt must be a string of at most 4000 chars', () => {
  assert.equal(validateAgentInput(ok({ systemPrompt: 5 })).ok, false)
  assert.equal(validateAgentInput({ messages: [] }).ok, false)
  assert.equal(validateAgentInput(ok({ systemPrompt: 'a'.repeat(4000) })).ok, true)
  assert.equal(validateAgentInput(ok({ systemPrompt: 'a'.repeat(4001) })).ok, false)
})

test('messages must be an array of at most 40 entries', () => {
  assert.equal(validateAgentInput(ok({ messages: 'x' })).ok, false)
  const mk = n => Array.from({ length: n }, () => ({ role: 'user', content: 'a' }))
  assert.equal(validateAgentInput(ok({ messages: mk(40) })).ok, true)
  assert.equal(validateAgentInput(ok({ messages: mk(41) })).ok, false)
})

test('roles are limited to user and assistant', () => {
  for (const role of ['system', 'tool', '', undefined, 1]) {
    assert.equal(validateAgentInput(ok({ messages: [{ role, content: 'x' }] })).ok, false)
  }
})

test('content must be a non-empty string of at most 8000 chars', () => {
  for (const content of ['', '   ', null, undefined, 3, ['a']]) {
    assert.equal(validateAgentInput(ok({ messages: [{ role: 'user', content }] })).ok, false)
  }
  assert.equal(validateAgentInput(ok({ messages: [{ role: 'user', content: 'a'.repeat(8000) }] })).ok, true)
  assert.equal(validateAgentInput(ok({ messages: [{ role: 'user', content: 'a'.repeat(8001) }] })).ok, false)
})

test('rejects non-object message entries', () => {
  for (const m of [null, 'hi', 4, []]) assert.equal(validateAgentInput(ok({ messages: [m] })).ok, false)
})
