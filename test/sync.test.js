import test from 'node:test'
import assert from 'node:assert/strict'
import { readLocalShape, wrapForSave, decideSync } from '../src/sync/logic.js'

test('readLocalShape: null stays null', () => {
  assert.equal(readLocalShape(null), null)
})

test('readLocalShape: legacy unwrapped value gets wrapped with updatedAt 0', () => {
  const legacy = [{ id: 1 }]
  assert.deepEqual(readLocalShape(legacy), { data: legacy, updatedAt: 0 })
})

test('readLocalShape: already-wrapped value passes through unchanged', () => {
  const wrapped = { data: { a: 1 }, updatedAt: 12345 }
  assert.deepEqual(readLocalShape(wrapped), wrapped)
})

test('wrapForSave stamps the current time', () => {
  const before = Date.now()
  const wrapped = wrapForSave({ x: 1 })
  assert.deepEqual(wrapped.data, { x: 1 })
  assert.ok(wrapped.updatedAt >= before)
})

test('decideSync: no cloud row, has local -> seed by pushing', () => {
  const local = { data: [1, 2], updatedAt: 100 }
  assert.deepEqual(decideSync(local, null), { action: 'push', value: local })
})

test('decideSync: no cloud row, no local -> noop', () => {
  assert.deepEqual(decideSync(null, null), { action: 'noop' })
})

test('decideSync: cloud newer than local -> pull', () => {
  const local = { data: 'old', updatedAt: 100 }
  const cloudRow = { value: 'new', updated_at: new Date(200).toISOString() }
  const result = decideSync(local, cloudRow)
  assert.equal(result.action, 'pull')
  assert.deepEqual(result.value, { data: 'new', updatedAt: 200 })
})

test('decideSync: local newer than cloud -> push', () => {
  const local = { data: 'new', updatedAt: 300 }
  const cloudRow = { value: 'old', updated_at: new Date(100).toISOString() }
  assert.deepEqual(decideSync(local, cloudRow), { action: 'push', value: local })
})

test('decideSync: no local but cloud has data -> pull', () => {
  const cloudRow = { value: 'cloud-data', updated_at: new Date(500).toISOString() }
  const result = decideSync(null, cloudRow)
  assert.equal(result.action, 'pull')
  assert.deepEqual(result.value, { data: 'cloud-data', updatedAt: 500 })
})

test('decideSync: equal timestamps -> noop', () => {
  const ts = 400
  const local = { data: 'x', updatedAt: ts }
  const cloudRow = { value: 'x', updated_at: new Date(ts).toISOString() }
  assert.deepEqual(decideSync(local, cloudRow), { action: 'noop' })
})
