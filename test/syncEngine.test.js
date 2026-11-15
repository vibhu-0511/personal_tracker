import test from 'node:test'
import assert from 'node:assert/strict'
import { createSyncEngine } from '../src/sync/engine.js'

function makeFakeDb(initial = {}) {
  const store = new Map(Object.entries(initial))
  return {
    async getItem(key) { return store.has(key) ? store.get(key) : null },
    async setItem(key, value) { store.set(key, value); return value },
    async removeItem(key) { store.delete(key) },
    async clear() { store.clear() },
  }
}

function makeFakeCloud({ userId = 'u1' } = {}) {
  let sessionUserId = userId
  const rows = new Map()
  let writeCalls = 0
  return {
    rows,
    get writeCalls() { return writeCalls },
    setSessionUserId(id) { sessionUserId = id },
    async getSession() {
      return { data: { session: sessionUserId ? { user: { id: sessionUserId } } : null } }
    },
    async read(key, uid) {
      return rows.get(`${uid}:${key}`) || null
    },
    async write(key, uid, wrapped) {
      writeCalls++
      rows.set(`${uid}:${key}`, { value: wrapped.data, updated_at: new Date(wrapped.updatedAt).toISOString() })
    },
  }
}

const flushMicrotasks = () => new Promise((resolve) => setImmediate(resolve))

test('save schedules exactly one push with the latest value', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const cloud = makeFakeCloud()
  const engine = createSyncEngine({ db: makeFakeDb(), cloud })
  await engine.save('notes', 'A')
  t.mock.timers.tick(700)
  await flushMicrotasks()
  assert.equal(cloud.writeCalls, 1)
  assert.equal((await cloud.read('notes', 'u1')).value, 'A')
})

test('two saves inside the debounce window produce one push with the latest value', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const cloud = makeFakeCloud()
  const engine = createSyncEngine({ db: makeFakeDb(), cloud })
  await engine.save('notes', 'A')
  t.mock.timers.tick(100)
  await engine.save('notes', 'B')
  t.mock.timers.tick(700)
  await flushMicrotasks()
  assert.equal(cloud.writeCalls, 1)
  assert.equal((await cloud.read('notes', 'u1')).value, 'B')
})

test('a pending local edit wins a race against a newer cloud pull', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const cloud = makeFakeCloud()
  const engine = createSyncEngine({ db: makeFakeDb(), cloud })
  await engine.save('notes', 'B')
  // a concurrent cloud write lands with a later timestamp than our local edit
  cloud.rows.set('u1:notes', { value: 'cloud-value', updated_at: new Date(Date.now() + 999999).toISOString() })
  const action = await engine.reconcileKey('notes')
  assert.equal(action, 'push')
  assert.equal((await cloud.read('notes', 'u1')).value, 'B')
  // the debounce timer still fires later; it must not resurrect the pulled value
  t.mock.timers.tick(700)
  await flushMicrotasks()
  assert.equal((await cloud.read('notes', 'u1')).value, 'B')
})

test('a save with no session marks status failed and keeps the write pending for retry', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const cloud = makeFakeCloud({ userId: null })
  const engine = createSyncEngine({ db: makeFakeDb(), cloud })
  let failed
  engine.onStatusChange((f) => { failed = f })
  await engine.save('notes', 'A')
  t.mock.timers.tick(700)
  await flushMicrotasks()
  assert.equal(failed, true)
  assert.equal(await cloud.read('notes', 'u1'), null)

  cloud.setSessionUserId('u1')
  const action = await engine.reconcileKey('notes')
  assert.equal(action, 'push')
  assert.equal((await cloud.read('notes', 'u1')).value, 'A')
})

test('claimOwner clears local storage when a different user signs in', async () => {
  const db = makeFakeDb({ notes: { data: 'mine', updatedAt: 1 } })
  const engine = createSyncEngine({ db, cloud: makeFakeCloud() })
  await engine.claimOwner('u1')
  assert.deepEqual(await db.getItem('notes'), { data: 'mine', updatedAt: 1 })
  await engine.claimOwner('u2')
  assert.equal(await db.getItem('notes'), null)
})

test('a legacy local value is backed up before a pull overwrites it', async () => {
  const db = makeFakeDb({ notes: ['legacy-array'] })
  const cloud = makeFakeCloud()
  cloud.rows.set('u1:notes', { value: 'cloud-notes', updated_at: new Date().toISOString() })
  const engine = createSyncEngine({ db, cloud })
  await engine.reconcileKey('notes')
  assert.deepEqual(await db.getItem('notes__pre_sync_backup'), { data: ['legacy-array'], updatedAt: 0 })
  assert.equal((await db.getItem('notes')).data, 'cloud-notes')
})

test('a local write failure marks status failed without an unhandled rejection', async () => {
  const db = makeFakeDb()
  const realSetItem = db.setItem.bind(db)
  db.setItem = async (key, val) => {
    if (key === 'notes') throw new Error('quota exceeded')
    return realSetItem(key, val)
  }
  let failed
  const engine = createSyncEngine({ db, cloud: makeFakeCloud(), onLocalWriteError: () => {} })
  engine.onStatusChange((f) => { failed = f })
  await assert.doesNotReject(engine.save('notes', 'A'))
  assert.equal(failed, true)
})

test('flush pushes pending writes immediately without waiting for the debounce', async () => {
  const cloud = makeFakeCloud()
  const engine = createSyncEngine({ db: makeFakeDb(), cloud })
  await engine.save('notes', 'A')
  await engine.flush()
  assert.equal((await cloud.read('notes', 'u1')).value, 'A')
})

function makeFlakyCloud() {
  const cloud = makeFakeCloud()
  const realWrite = cloud.write.bind(cloud)
  const ctl = { fail: true, attempts: 0 }
  cloud.write = async (...args) => {
    ctl.attempts++
    if (ctl.fail) throw new Error('kv_store write failed')
    return realWrite(...args)
  }
  return { cloud, ctl }
}

test('a rejecting cloud write keeps the key pending, sets failed, and a timer retry later pushes it', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const { cloud, ctl } = makeFlakyCloud()
  const engine = createSyncEngine({ db: makeFakeDb(), cloud })
  let failed
  engine.onStatusChange((f) => { failed = f })
  await engine.save('notes', 'A')
  t.mock.timers.tick(700)
  await flushMicrotasks()
  assert.equal(failed, true)
  assert.equal(await cloud.read('notes', 'u1'), null)

  ctl.fail = false
  t.mock.timers.tick(999)
  await flushMicrotasks()
  assert.equal(await cloud.read('notes', 'u1'), null, 'retry must not fire before 1s')
  t.mock.timers.tick(1)
  await flushMicrotasks()
  assert.equal((await cloud.read('notes', 'u1')).value, 'A')
  assert.equal(failed, false)
})

test('retry backoff doubles (1s, 2s, 4s) and is capped', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const { cloud, ctl } = makeFlakyCloud()
  const engine = createSyncEngine({ db: makeFakeDb(), cloud, retryBaseMs: 1000, retryMaxMs: 4000 })
  await engine.save('notes', 'A')
  t.mock.timers.tick(700)
  await flushMicrotasks()
  assert.equal(ctl.attempts, 1)
  for (const [delay, expected] of [[1000, 2], [2000, 3], [4000, 4], [4000, 5]]) {
    t.mock.timers.tick(delay - 1)
    await flushMicrotasks()
    assert.equal(ctl.attempts, expected - 1, `no retry before ${delay}ms`)
    t.mock.timers.tick(1)
    await flushMicrotasks()
    assert.equal(ctl.attempts, expected)
  }
})

test('a new save during backoff supersedes the scheduled retry', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const { cloud, ctl } = makeFlakyCloud()
  const engine = createSyncEngine({ db: makeFakeDb(), cloud })
  await engine.save('notes', 'A')
  t.mock.timers.tick(700)
  await flushMicrotasks()
  ctl.fail = false
  await engine.save('notes', 'B')
  t.mock.timers.tick(700)
  await flushMicrotasks()
  assert.equal((await cloud.read('notes', 'u1')).value, 'B')
})

test('a failed push during reconcile is retried with backoff', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const db = makeFakeDb({ notes: { data: 'local', updatedAt: 5 } })
  const { cloud, ctl } = makeFlakyCloud()
  const engine = createSyncEngine({ db, cloud })
  assert.equal(await engine.reconcileKey('notes'), 'noop')
  ctl.fail = false
  t.mock.timers.tick(1000)
  await flushMicrotasks()
  assert.equal((await cloud.read('notes', 'u1')).value, 'local')
})
