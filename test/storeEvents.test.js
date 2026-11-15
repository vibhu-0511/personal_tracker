import test from 'node:test'
import assert from 'node:assert/strict'
import { subscribeStoreKey, emitStoreKey, listenerCount } from '../src/storeEvents.js'

test('subscribe receives emits for its key only', () => {
  const seen = []
  const off = subscribeStoreKey('habits', (k) => seen.push(k))
  emitStoreKey('habits')
  emitStoreKey('tasks')
  assert.deepEqual(seen, ['habits'])
  off()
})

test('unsubscribe stops delivery and releases the listener', () => {
  let n = 0
  const off = subscribeStoreKey('habits', () => { n++ })
  emitStoreKey('habits')
  off()
  off() // idempotent
  emitStoreKey('habits')
  assert.equal(n, 1)
  assert.equal(listenerCount('habits'), 0)
})

test('no listener leak after many subscribe/unsubscribe cycles', () => {
  const before = listenerCount()
  for (let i = 0; i < 100; i++) subscribeStoreKey(`k${i % 5}`, () => {})()
  assert.equal(listenerCount(), before)
})

test('a throwing listener does not block others', () => {
  const origError = console.error
  console.error = () => {}
  let ok = 0
  const a = subscribeStoreKey('x', () => { throw new Error('boom') })
  const b = subscribeStoreKey('x', () => { ok++ })
  try {
    emitStoreKey('x')
  } finally {
    console.error = origError
    a(); b()
  }
  assert.equal(ok, 1)
})

test('unsubscribing during an emit is safe', () => {
  let calls = 0
  const off = subscribeStoreKey('y', () => { calls++; off() })
  const other = subscribeStoreKey('y', () => { calls++ })
  emitStoreKey('y')
  emitStoreKey('y')
  other()
  assert.equal(calls, 3)
  assert.equal(listenerCount('y'), 0)
})

test('store.saveSynced emits after the save resolves', async () => {
  const src = (await import('node:fs')).readFileSync(new URL('../src/store.js', import.meta.url), 'utf8')
  const m = src.match(/async function saveSynced\(key, data\) \{([\s\S]*?)\n\}/)
  assert.ok(m, 'saveSynced found')
  const body = m[1]
  assert.ok(body.indexOf('await engine.save(key, data)') !== -1)
  assert.ok(body.indexOf('emitStoreKey(key)') > body.indexOf('await engine.save(key, data)'))
})
