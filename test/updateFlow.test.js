import test from 'node:test'
import assert from 'node:assert/strict'
import { createUpdateFlow, scheduleUpdateChecks, UPDATE_CHECK_INTERVAL_MS } from '../src/pwa/updateFlow.js'

function deferred() {
  let resolve, reject
  const promise = new Promise((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

test('flush is awaited before updateServiceWorker runs', async () => {
  const order = []
  const gate = deferred()
  const confirm = createUpdateFlow({
    flush: async () => { order.push('flush-start'); await gate.promise; order.push('flush-end') },
    updateServiceWorker: async (reload) => { order.push(`update:${reload}`) },
  })
  const p = confirm()
  await new Promise((r) => setImmediate(r))
  assert.deepEqual(order, ['flush-start'])
  gate.resolve()
  await p
  assert.deepEqual(order, ['flush-start', 'flush-end', 'update:true'])
})

test('a failing flush still applies the update after the user confirms', async () => {
  const errors = []
  let updated = 0
  const confirm = createUpdateFlow({
    flush: async () => { throw new Error('offline') },
    updateServiceWorker: async () => { updated += 1 },
    onFlushError: (e) => errors.push(e.message),
  })
  await confirm()
  assert.equal(updated, 1)
  assert.deepEqual(errors, ['offline'])
})

test('no update call happens without confirmation', async () => {
  let flushed = 0
  let updated = 0
  const confirm = createUpdateFlow({
    flush: async () => { flushed += 1 },
    updateServiceWorker: async () => { updated += 1 },
  })
  await new Promise((r) => setImmediate(r))
  assert.equal(typeof confirm, 'function')
  assert.equal(flushed, 0)
  assert.equal(updated, 0)
})

test('double confirmation applies the update once', async () => {
  let updated = 0
  const gate = deferred()
  const confirm = createUpdateFlow({
    flush: () => gate.promise,
    updateServiceWorker: async () => { updated += 1 },
  })
  const a = confirm()
  const b = confirm()
  gate.resolve()
  await Promise.all([a, b])
  assert.equal(updated, 1)
})

test('scheduleUpdateChecks updates on the interval and on visibilitychange, and stops cleanly', () => {
  let updates = 0
  const registration = { update: () => { updates += 1; return Promise.resolve() } }
  const listeners = new Map()
  const doc = {
    visibilityState: 'hidden',
    addEventListener: (t, fn) => listeners.set(t, fn),
    removeEventListener: (t) => listeners.delete(t),
  }
  let tick = null
  let cleared = false
  const stop = scheduleUpdateChecks(registration, {
    doc,
    setIntervalFn: (fn, ms) => { assert.equal(ms, UPDATE_CHECK_INTERVAL_MS); tick = fn; return 1 },
    clearIntervalFn: () => { cleared = true },
  })
  tick()
  assert.equal(updates, 1)
  listeners.get('visibilitychange')()
  assert.equal(updates, 1, 'hidden tab does not check')
  doc.visibilityState = 'visible'
  listeners.get('visibilitychange')()
  assert.equal(updates, 2)
  stop()
  assert.equal(cleared, true)
  assert.equal(listeners.size, 0)
})

test('scheduleUpdateChecks tolerates a missing registration', () => {
  const stop = scheduleUpdateChecks(undefined)
  assert.equal(typeof stop, 'function')
  stop()
})
