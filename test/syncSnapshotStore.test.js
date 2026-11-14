import test from 'node:test'
import assert from 'node:assert/strict'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { createSnapshotStore, createSyncStatusStore } from '../src/sync/snapshotStore.js'
import { configureSynced, resetSynced, useSynced, useSyncStatus } from '../src/useSynced.js'

const tick = () => new Promise((resolve) => setImmediate(resolve))

// In-memory backend with the engine surface: per-key serialised update, subscribe emission.
function fakeBackend(initial = {}) {
  const data = new Map(Object.entries(initial))
  const subs = new Map()
  const statusFns = new Set()
  const queues = new Map()
  const calls = { get: 0, save: 0, update: 0, subscribe: 0, unsubscribe: 0 }
  const b = {
    calls,
    status: { pending: 0, lastSyncedAt: null },
    failNextGet: null,
    async get(key, fallback) {
      calls.get += 1
      if (b.failNextGet) {
        const err = b.failNextGet
        b.failNextGet = null
        throw err
      }
      return data.has(key) ? structuredClone(data.get(key)) : fallback
    },
    async save(key, next) {
      calls.save += 1
      data.set(key, structuredClone(next))
    },
    update(key, fn, fallback) {
      calls.update += 1
      const prev = queues.get(key) || Promise.resolve()
      const run = prev.then(async () => {
        const cur = data.has(key) ? structuredClone(data.get(key)) : fallback
        const next = await fn(cur)
        data.set(key, structuredClone(next))
        return next
      })
      queues.set(key, run.catch(() => undefined))
      return run
    },
    subscribe(key, fn) {
      calls.subscribe += 1
      let set = subs.get(key)
      if (!set) subs.set(key, (set = new Set()))
      set.add(fn)
      return () => {
        calls.unsubscribe += 1
        set.delete(fn)
      }
    },
    // a pull or other tab changes the key
    remote(key, next) {
      data.set(key, structuredClone(next))
      for (const fn of [...(subs.get(key) || [])]) fn(structuredClone(next))
    },
    onStatusChange(fn) {
      statusFns.add(fn)
      fn(false)
      return () => statusFns.delete(fn)
    },
    setFailed(v) { for (const fn of [...statusFns]) fn(v) },
    syncStatus() { return { ...b.status } },
  }
  return b
}

function counter(store, key) {
  const c = { n: 0 }
  const off = store.subscribe(key, () => { c.n += 1 })
  c.off = off
  return c
}

test('uncached key: stable not-ready snapshot, getSnapshot has no side effects', () => {
  const backend = fakeBackend({ tasks: [1] })
  const store = createSnapshotStore({ backend })
  const a = store.getSnapshot('tasks')
  assert.deepEqual(a, { value: undefined, ready: false, error: null })
  assert.equal(store.getSnapshot('tasks'), a)
  assert.equal(backend.calls.get, 0)
})

test('snapshot reference is stable between changes and replaced by each change', async () => {
  const backend = fakeBackend({ tasks: [{ id: 'a' }] })
  const store = createSnapshotStore({ backend })
  const c = counter(store, 'tasks')
  await tick()
  const first = store.getSnapshot('tasks')
  assert.equal(first.ready, true)
  assert.deepEqual(first.value, [{ id: 'a' }])
  assert.equal(store.getSnapshot('tasks'), first)
  assert.equal(store.getSnapshot('tasks'), first)

  backend.remote('tasks', [{ id: 'a' }, { id: 'b' }])
  const second = store.getSnapshot('tasks')
  assert.notEqual(second, first)
  assert.equal(store.getSnapshot('tasks'), second)
  assert.deepEqual(second.value, [{ id: 'a' }, { id: 'b' }])
  c.off()
})

test('one notification per change (initial load, remote change, save, update)', async () => {
  const backend = fakeBackend({ tasks: [] })
  const store = createSnapshotStore({ backend })
  const c = counter(store, 'tasks')
  await tick()
  assert.equal(c.n, 1) // the load

  backend.remote('tasks', [{ id: 'r' }])
  assert.equal(c.n, 2)

  await store.save('tasks', [{ id: 's' }])
  assert.equal(c.n, 3)

  await store.update('tasks', (cur) => [...cur, { id: 'u' }])
  assert.equal(c.n, 4)
  assert.deepEqual(store.getSnapshot('tasks').value, [{ id: 's' }, { id: 'u' }])
  c.off()
})

test('a structurally equal value is not a change: same reference, no notification', async () => {
  const backend = fakeBackend({ tasks: [{ id: 'a' }] })
  const store = createSnapshotStore({ backend })
  const c = counter(store, 'tasks')
  await tick()
  const snap = store.getSnapshot('tasks')
  const n = c.n

  backend.remote('tasks', [{ id: 'a' }]) // echo of what we already hold
  await store.save('tasks', [{ id: 'a' }])
  await store.update('tasks', (cur) => cur)
  assert.equal(store.getSnapshot('tasks'), snap)
  assert.equal(c.n, n)
  c.off()
})

test('ready is true synchronously once a key is cached, including for a later subscriber', async () => {
  const backend = fakeBackend({ habits: [{ id: 'h' }] })
  const store = createSnapshotStore({ backend })
  assert.equal(store.getSnapshot('habits').ready, false)
  const c = counter(store, 'habits')
  await tick()
  c.off() // route change: the screen unmounts

  // new mount: ready on the very first read, before any await
  assert.equal(store.getSnapshot('habits').ready, true)
  assert.deepEqual(store.getSnapshot('habits').value, [{ id: 'h' }])
  const c2 = counter(store, 'habits')
  assert.equal(store.getSnapshot('habits').ready, true)
  await tick()
  c2.off()
})

test('prime caches synchronously with one notification', () => {
  const store = createSnapshotStore({ backend: fakeBackend() })
  let n = 0
  const off = store.subscribe('notes', () => { n += 1 })
  assert.equal(store.prime('notes', [1]), true)
  assert.equal(store.getSnapshot('notes').ready, true)
  assert.equal(store.prime('notes', [1]), false)
  assert.equal(n, 1)
  off()
})

test('re-subscribing a cached key revalidates in the background, notifying only on a difference', async () => {
  const backend = fakeBackend({ k: { a: 1 } })
  const store = createSnapshotStore({ backend })
  let c = counter(store, 'k')
  await tick()
  c.off()
  const cached = store.getSnapshot('k')

  c = counter(store, 'k') // nothing changed meanwhile
  await tick()
  assert.equal(store.getSnapshot('k'), cached)
  assert.equal(c.n, 0)
  c.off()

  backend.remote('k', { a: 2 }) // missed while unsubscribed: nobody subscribed to the backend
  c = counter(store, 'k')
  await tick()
  assert.deepEqual(store.getSnapshot('k').value, { a: 2 })
  assert.equal(c.n, 1)
  c.off()
})

test('backend subscription follows listeners: one attach, detach on the last unsubscribe', async () => {
  const backend = fakeBackend({ k: [] })
  const store = createSnapshotStore({ backend })
  const a = counter(store, 'k')
  const b = counter(store, 'k')
  assert.equal(backend.calls.subscribe, 1)
  await tick()
  assert.equal(backend.calls.get, 1) // one shared load
  a.off()
  assert.equal(backend.calls.unsubscribe, 0)
  b.off()
  assert.equal(backend.calls.unsubscribe, 1)
  assert.equal(store.listenerCount('k'), 0)
  backend.remote('k', [1]) // nobody is attached any more
  assert.deepEqual(store.getSnapshot('k').value, [])
})

test('update is stale-snapshot safe: concurrent updates both survive', async () => {
  const backend = fakeBackend({ tasks: [] })
  const store = createSnapshotStore({ backend })
  const c = counter(store, 'tasks')
  await tick()
  await Promise.all([
    store.update('tasks', (cur) => [...cur, 'a']),
    store.update('tasks', (cur) => [...cur, 'b']),
  ])
  assert.deepEqual(store.getSnapshot('tasks').value, ['a', 'b'])
  // a pull lands, then an update from an old render still builds on fresh state
  backend.remote('tasks', ['a', 'b', 'pulled'])
  await store.update('tasks', (cur) => [...cur, 'c'])
  assert.deepEqual(store.getSnapshot('tasks').value, ['a', 'b', 'pulled', 'c'])
  c.off()
})

test('update passes the fallback for a key with no data', async () => {
  const backend = fakeBackend()
  const store = createSnapshotStore({ backend })
  await store.update('reminders', (cur) => [...cur, 'x'], [])
  assert.deepEqual(store.getSnapshot('reminders').value, ['x'])
})

test('a load result that lands after a newer change is dropped', async () => {
  const backend = fakeBackend({ k: 'old' })
  let release
  const gate = new Promise((resolve) => { release = resolve })
  const realGet = backend.get
  backend.get = async (...args) => {
    const v = await realGet(...args)
    await gate
    return v
  }
  const store = createSnapshotStore({ backend })
  const c = counter(store, 'k')
  backend.remote('k', 'new') // subscriber emission beats the slow load
  assert.equal(store.getSnapshot('k').value, 'new')
  release()
  await tick()
  assert.equal(store.getSnapshot('k').value, 'new')
  assert.equal(c.n, 1)
  c.off()
})

test('load failure sets error with ready false, and the next subscribe retries', async () => {
  const backend = fakeBackend({ k: [1] })
  backend.failNextGet = new Error('disk gone')
  const store = createSnapshotStore({ backend })
  const c = counter(store, 'k')
  await tick()
  assert.equal(store.getSnapshot('k').ready, false)
  assert.equal(store.getSnapshot('k').error, 'disk gone')
  assert.equal(c.n, 1)
  c.off()

  const c2 = counter(store, 'k')
  await tick()
  assert.equal(store.getSnapshot('k').ready, true)
  assert.equal(store.getSnapshot('k').error, null)
  c2.off()
})

test('a failed revalidation of a cached key keeps serving the value', async () => {
  const backend = fakeBackend({ k: [1] })
  const store = createSnapshotStore({ backend })
  let c = counter(store, 'k')
  await tick()
  c.off()
  const cached = store.getSnapshot('k')
  backend.failNextGet = new Error('offline')
  c = counter(store, 'k')
  await tick()
  assert.equal(store.getSnapshot('k'), cached)
  assert.equal(c.n, 0)
  c.off()
})

test('save rejection propagates and leaves the snapshot alone', async () => {
  const backend = fakeBackend({ k: [1] })
  backend.save = async () => { throw new Error('quota') }
  const store = createSnapshotStore({ backend })
  const c = counter(store, 'k')
  await tick()
  const snap = store.getSnapshot('k')
  await assert.rejects(store.save('k', [2]), /quota/)
  assert.equal(store.getSnapshot('k'), snap)
  c.off()
})

test('a throwing listener does not block the others', async () => {
  const backend = fakeBackend({ k: 1 })
  const store = createSnapshotStore({ backend })
  const offBad = store.subscribe('k', () => { throw new Error('boom') })
  const good = counter(store, 'k')
  await tick()
  assert.equal(good.n, 1)
  offBad()
  good.off()
})

test('onChange fires once per applied change, not for dropped ones', async () => {
  const backend = fakeBackend({ k: [1] })
  const seen = []
  const store = createSnapshotStore({ backend, onChange: (key) => seen.push(key) })
  const c = counter(store, 'k')
  await tick()
  backend.remote('k', [1])
  backend.remote('k', [2])
  assert.deepEqual(seen, ['k', 'k'])
  c.off()
})

test('status store: stable snapshot, failed follows the backend, pending and lastSyncedAt on refresh', () => {
  const backend = fakeBackend()
  const status = createSyncStatusStore({ backend })
  const initial = status.getSnapshot()
  assert.deepEqual(initial, { failed: false, pending: 0, lastSyncedAt: null })
  assert.equal(status.getSnapshot(), initial)

  let n = 0
  const off = status.subscribe(() => { n += 1 })
  assert.equal(status.getSnapshot(), initial) // primed from the backend: nothing changed
  assert.equal(n, 0)

  backend.setFailed(true)
  assert.equal(n, 1)
  assert.equal(status.getSnapshot().failed, true)
  backend.setFailed(true) // same value again
  assert.equal(n, 1)

  backend.status = { pending: 3, lastSyncedAt: 1700 }
  assert.equal(status.refresh(), true)
  assert.deepEqual(status.getSnapshot(), { failed: true, pending: 3, lastSyncedAt: 1700 })
  assert.equal(status.refresh(), false)
  assert.equal(n, 2)
  off()
})

test('status store: polls only while subscribed and cleans up', () => {
  const backend = fakeBackend()
  let tickFn = null
  let cleared = 0
  const status = createSyncStatusStore({
    backend,
    intervalMs: 50,
    setIntervalFn: (fn) => { tickFn = fn; return 7 },
    clearIntervalFn: (id) => { assert.equal(id, 7); cleared += 1 },
  })
  const off = status.subscribe(() => {})
  assert.equal(typeof tickFn, 'function')
  backend.status = { pending: 1, lastSyncedAt: null }
  tickFn()
  assert.equal(status.getSnapshot().pending, 1)
  off()
  assert.equal(cleared, 1)
})

test('status store without status support stays at defaults', () => {
  const status = createSyncStatusStore({ backend: {} })
  const off = status.subscribe(() => {})
  assert.deepEqual(status.getSnapshot(), { failed: false, pending: 0, lastSyncedAt: null })
  off()
})

test('createSnapshotStore rejects a backend without get/save/update', () => {
  assert.throws(() => createSnapshotStore({}), TypeError)
  assert.throws(() => createSnapshotStore({ backend: { get() {} } }), TypeError)
})

test('hooks: useSynced returns {value, ready, error, save, update}; ready synchronously once cached', () => {
  const backend = fakeBackend({ habits: [{ id: 'h' }] })
  const { store } = configureSynced(backend, { statusIntervalMs: 0 })
  try {
    let seen
    const Probe = () => {
      seen = useSynced('habits', [])
      return null
    }
    renderToString(createElement(Probe))
    assert.deepEqual(Object.keys(seen).sort(), ['error', 'ready', 'save', 'update', 'value'])
    assert.equal(seen.ready, false)
    assert.deepEqual(seen.value, []) // fallback until ready

    store.prime('habits', [{ id: 'h' }])
    renderToString(createElement(Probe))
    assert.equal(seen.ready, true)
    assert.deepEqual(seen.value, [{ id: 'h' }])
    assert.equal(seen.error, null)
    assert.equal(typeof seen.save, 'function')
    assert.equal(typeof seen.update, 'function')
  } finally {
    resetSynced()
  }
})

test('hooks: useSyncStatus returns {failed, pending, lastSyncedAt}', () => {
  configureSynced(fakeBackend(), { statusIntervalMs: 0 })
  try {
    let seen
    const Probe = () => {
      seen = useSyncStatus()
      return null
    }
    renderToString(createElement(Probe))
    assert.deepEqual(seen, { failed: false, pending: 0, lastSyncedAt: null })
  } finally {
    resetSynced()
  }
})

test('hooks throw a clear error while no backend is configured', () => {
  resetSynced()
  const Probe = () => {
    useSynced('x')
    return null
  }
  assert.throws(() => renderToString(createElement(Probe)), /no sync backend configured/)
})
