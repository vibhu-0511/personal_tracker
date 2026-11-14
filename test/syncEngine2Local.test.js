import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createEngine2, LOCK_NAME, BUS_TYPE, META_KEY, OUTBOX_KEY } from '../src/sync/engine2.js'
import { ADAPTER_KEYS } from '../src/sync/adapters.js'
import { createFakeDb } from './helpers/fakeDb.js'

// No fake-indexeddb in package.json, so storage is the in-memory fakeDb (it
// structured-clones like IndexedDB). Lock and bus are injected fakes.

const fixture = () => JSON.parse(readFileSync(new URL('./fixtures/sync-v1-blobs.json', import.meta.url), 'utf8'))

// Mutex with Web Locks semantics: requests for one name run one at a time, FIFO.
function createFakeLock() {
  const tails = new Map()
  const state = { held: 0, requests: [], maxHeld: 0 }
  const lock = (name, fn) => {
    state.requests.push(name)
    const prev = tails.get(name) || Promise.resolve()
    const run = prev.then(async () => {
      state.held++
      state.maxHeld = Math.max(state.maxHeld, state.held)
      try {
        return await fn()
      } finally {
        state.held--
      }
    })
    tails.set(name, run.then(() => undefined, () => undefined))
    return run
  }
  lock.state = state
  return lock
}

// BroadcastChannel stand-in: a message reaches every other member, never the sender.
function createFakeBusGroup() {
  const members = new Set()
  const sent = []
  function make() {
    const listeners = new Set()
    const member = {
      listeners,
      postMessage(data) {
        sent.push(data)
        const copy = structuredClone(data)
        for (const m of members) if (m !== member) queueMicrotask(() => m.listeners.forEach((h) => h({ data: copy })))
      },
      addEventListener(type, h) { if (type === 'message') listeners.add(h) },
      removeEventListener(type, h) { if (type === 'message') listeners.delete(h) },
      close() { members.delete(member) },
    }
    members.add(member)
    return member
  }
  return { make, sent }
}

// A db whose writes assert that the lock is held.
function guardedDb(db, lock) {
  const violations = []
  return {
    violations,
    getItem: (k) => db.getItem(k),
    async setItem(k, v) {
      if (lock.state.held === 0) violations.push(k)
      return db.setItem(k, v)
    },
    removeItem: (k) => db.removeItem(k),
    clear: () => db.clear(),
    keys: () => db.keys(),
  }
}

function setup(opts = {}) {
  const db = opts.db ?? createFakeDb()
  const lock = opts.lock ?? createFakeLock()
  const group = opts.group ?? createFakeBusGroup()
  let t = opts.t ?? 1_700_000_000_000
  const clockMs = { now: () => t, set: (v) => { t = v }, advance: (ms) => { t += ms } }
  let n = 0
  const make = (name = 'a', extra = {}) =>
    createEngine2({
      db: extra.db ?? db,
      lock,
      bus: group.make(),
      now: clockMs.now,
      newId: () => `${name}${String(++n).padStart(3, '0')}`,
      random: () => 0,
      onLocalWriteError: extra.onLocalWriteError,
    })
  return { db, lock, group, clockMs, make }
}

const stored = (db, collection) => db.snapshot()[`r2:${collection}`]?.recs ?? {}
const dirtyIds = (e) => e.outbox.snapshot().dirty.map(([c, id]) => `${c}/${id}`).sort()

test('get(key) materialises the v1 getSynced shape for all 17 synced keys', async () => {
  const { db, make } = setup()
  const e = make()
  const blobs = fixture()
  for (const key of ADAPTER_KEYS) await e.save(key, blobs[key])
  for (const key of ADAPTER_KEYS) {
    assert.deepEqual(await e.get(key, undefined), blobs[key], `get(${key})`)
  }
  // ...and from a cold engine reading only what was persisted
  const cold = setup({ db: createFakeDb(db.snapshot()) }).make('b')
  for (const key of ADAPTER_KEYS) assert.deepEqual(await cold.get(key), blobs[key], `cold get(${key})`)
})

test('get returns the fallback until something was stored, then the stored data', async () => {
  const { make } = setup()
  const e = make()
  assert.deepEqual(await e.get('tasks', []), [])
  assert.equal(await e.get('settings'), undefined)
  const fb = { done: {}, quiz: {}, tasks: {}, current: null }
  assert.deepEqual(await e.get('investProgress', fb), fb)
  await e.save('tasks', [{ id: 't1', title: 'a' }])
  assert.deepEqual(await e.get('tasks', []), [{ id: 't1', title: 'a' }])
  // mutating what get returned cannot change the store
  const got = await e.get('tasks', [])
  got[0].title = 'MUTATED'
  assert.equal((await e.get('tasks', []))[0].title, 'a')
})

test('save writes only changed records plus dirty marks, before it resolves', async () => {
  const { db, make } = setup()
  const e = make()
  await e.save('tasks', [{ id: 't1', title: 'one' }, { id: 't2', title: 'two' }, { id: 't3', title: 'three' }])
  const before = stored(db, 'tasks')
  assert.equal(Object.keys(before).length, 3)
  // simulate the drain acking everything
  e.outbox.ack(e.outbox.nextBatch())
  await db.setItem(OUTBOX_KEY, e.outbox.snapshot())
  assert.equal(e.outbox.size(), 0)

  const list = await e.get('tasks', [])
  const edited = list.map((x) => (x.id === 't2' ? { ...x, title: 'TWO' } : x))
  const writesBefore = db.calls.setItem
  await e.save('tasks', edited)
  // already durable when save resolved
  const after = stored(db, 'tasks')
  assert.deepEqual(after.t1, before.t1)
  assert.deepEqual(after.t3, before.t3)
  assert.notEqual(after.t2.h, before.t2.h)
  assert.ok(after.t2.h > before.t2.h)
  assert.deepEqual(after.t2.b, { id: 't2', title: 'TWO' })
  assert.equal(after.t2.p, before.t2.p, 'pos untouched by a body edit')
  assert.equal(db.calls.setItem - writesBefore, 2, 'one collection item and the outbox')
  assert.deepEqual(db.snapshot()[OUTBOX_KEY].dirty, [['tasks', 't2', after.t2.h]])
  assert.deepEqual(dirtyIds(e), ['tasks/t2'])
})

test('an unchanged save writes nothing', async () => {
  const { db, make } = setup()
  const e = make()
  await e.save('tasks', [{ id: 't1', title: 'one' }])
  const list = await e.get('tasks', [])
  const writes = db.calls.setItem
  await e.save('tasks', list)
  await e.save('tasks', list.map((x) => ({ ...x })))
  assert.equal(db.calls.setItem, writes)
})

test('delete writes a tombstone; only the changed record and its mark', async () => {
  const { db, make } = setup()
  const e = make()
  await e.save('tasks', [{ id: 't1' }, { id: 't2' }])
  const list = await e.get('tasks', [])
  await e.save('tasks', list.filter((x) => x.id !== 't1'))
  const recs = stored(db, 'tasks')
  assert.equal(recs.t1.b, null)
  assert.ok(recs.t1.d)
  assert.deepEqual(recs.t2.b, { id: 't2' })
  assert.deepEqual(await e.get('tasks', []), [{ id: 't2' }])
  // undo: re-adding the tombstoned id resurrects it
  await e.save('tasks', [{ id: 't1' }, { id: 't2' }])
  assert.deepEqual((await e.get('tasks', [])).map((x) => x.id), ['t1', 't2'])
})

test('map, doc and habit keys diff per record (bare false/0 values, check-ins)', async () => {
  const { db, make } = setup()
  const e = make()
  await e.save('progress', { a: false, b: 0, c: { s: 1 } })
  assert.deepEqual(await e.get('progress', {}), { a: false, b: 0, c: { s: 1 } })
  await e.save('progress', { a: false, b: 1, c: { s: 1 } })
  assert.equal(stored(db, 'progress').b.b, 1)
  assert.deepEqual(dirtyIds(e), ['progress/a', 'progress/b', 'progress/c'], 'a and c from the first save, b again')

  await e.save('habits', [{ id: 'h1', name: 'run', checkins: ['2026-01-01'] }])
  const habits = await e.get('habits', [])
  const writes = Object.keys(stored(db, 'habitCheckins')).length
  assert.equal(writes, 1)
  await e.save('habits', habits.map((h) => ({ ...h, checkins: [...h.checkins, '2026-01-02'] })))
  assert.equal(Object.keys(stored(db, 'habitCheckins')).length, 2)
  assert.deepEqual((await e.get('habits', []))[0].checkins, ['2026-01-01', '2026-01-02'])
})

test('reordering a list changes one pos, not every record', async () => {
  const { db, make } = setup()
  const e = make()
  await e.save('tasks', [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }])
  const before = stored(db, 'tasks')
  await e.save('tasks', [{ id: 'a' }, { id: 'c' }, { id: 'd' }, { id: 'b' }])
  const after = stored(db, 'tasks')
  const changed = Object.keys(after).filter((id) => after[id].h !== before[id].h)
  assert.deepEqual(changed, ['b'])
  assert.deepEqual((await e.get('tasks', [])).map((x) => x.id), ['a', 'c', 'd', 'b'])
})

test('save rejects a blob of the wrong shape without touching the store', async () => {
  const { db, make } = setup()
  const e = make()
  await e.save('tasks', [{ id: 't1' }])
  const snap = db.snapshot()
  await assert.rejects(() => e.save('tasks', { id: 't1' }), TypeError)
  await assert.rejects(() => e.save('progress', []), TypeError)
  await assert.rejects(() => e.save('nope', []), TypeError)
  assert.deepEqual(db.snapshot(), snap)
})

test('update(key, fn) is serialised per key: two concurrent updates both survive', async () => {
  const { make } = setup()
  const e = make()
  const order = []
  const slow = e.update('tasks', async (list) => {
    order.push('slow:start')
    await new Promise((r) => setTimeout(r, 15))
    order.push('slow:end')
    return [...list, { id: 'a' }]
  }, [])
  const fast = e.update('tasks', (list) => {
    order.push('fast')
    return [...list, { id: 'b' }]
  }, [])
  const [r1, r2] = await Promise.all([slow, fast])
  assert.deepEqual(order, ['slow:start', 'slow:end', 'fast'])
  assert.deepEqual(r1.map((x) => x.id), ['a'])
  assert.deepEqual(r2.map((x) => x.id).sort(), ['a', 'b'])
  assert.deepEqual((await e.get('tasks', [])).map((x) => x.id).sort(), ['a', 'b'])
  // many at once
  await Promise.all(Array.from({ length: 10 }, (_, i) => e.update('tasks', (l) => [...l, { id: `n${i}` }], [])))
  assert.equal((await e.get('tasks', [])).length, 12)
})

test('updates on different keys do not block each other\'s results', async () => {
  const { make } = setup()
  const e = make()
  await Promise.all([
    e.update('tasks', (l) => [...l, { id: 't' }], []),
    e.update('notes', (l) => [...l, { id: 'n' }], []),
  ])
  assert.equal((await e.get('tasks', [])).length, 1)
  assert.equal((await e.get('notes', [])).length, 1)
})

test('a rejected update does not poison the queue', async () => {
  const { make } = setup()
  const e = make()
  await assert.rejects(() => e.update('tasks', () => { throw new Error('boom') }, []), /boom/)
  await e.update('tasks', (l) => [...l, { id: 'ok' }], [])
  assert.deepEqual((await e.get('tasks', [])).map((x) => x.id), ['ok'])
})

test('subscribe(key) fires once per change with a new array reference', async () => {
  const { make } = setup()
  const e = make()
  const seen = []
  const off = e.subscribe('tasks', (v) => seen.push(v))
  await e.save('tasks', [{ id: 'a' }])
  assert.equal(seen.length, 1)
  assert.deepEqual(seen[0], [{ id: 'a' }])
  await e.update('tasks', (l) => [...l, { id: 'b' }], [])
  assert.equal(seen.length, 2)
  assert.notEqual(seen[1], seen[0])
  assert.ok(Array.isArray(seen[1]))
  // no-op save: no change, no event
  await e.save('tasks', await e.get('tasks', []))
  assert.equal(seen.length, 2)
  // other keys do not notify
  await e.save('notes', [{ id: 'n' }])
  assert.equal(seen.length, 2)
  // a change of several records is still one event
  await e.save('tasks', [{ id: 'x' }, { id: 'y' }, { id: 'z' }])
  assert.equal(seen.length, 3)
  assert.equal(new Set(seen).size, 3)
  off()
  await e.save('tasks', [])
  assert.equal(seen.length, 3)
})

test('a subscriber that throws does not break the save or other subscribers', async () => {
  const { make } = setup()
  const e = make()
  const seen = []
  e.subscribe('tasks', () => { throw new Error('bad subscriber') })
  e.subscribe('tasks', (v) => seen.push(v))
  await e.save('tasks', [{ id: 'a' }])
  assert.equal(seen.length, 1)
})

test('served snapshot is replaced after every get and save', async () => {
  const { make, db } = setup()
  const a = make('a')
  const b = make('b')
  await a.save('tasks', [{ id: 'x' }])

  // 1. b adds y after a's last get/save: a's stale save must not delete it
  await b.save('tasks', [...(await b.get('tasks', [])), { id: 'y' }])
  await a.save('tasks', [{ id: 'x', n: 1 }])
  assert.deepEqual((await a.get('tasks', [])).map((r) => r.id).sort(), ['x', 'y'], 'y survived the stale save')
  assert.equal(stored(db, 'tasks').y.d, null)

  // 2. after a get that returned y, removing it is a real delete
  const list = await a.get('tasks', [])
  await a.save('tasks', list.filter((r) => r.id !== 'y'))
  assert.ok(stored(db, 'tasks').y.d, 'y tombstoned once it had been served')

  // 3. after a save, the saved array is the new base: z was saved, then removed
  await a.save('tasks', [{ id: 'x', n: 1 }, { id: 'z' }])
  await b.save('tasks', [...(await b.get('tasks', [])), { id: 'w' }])
  await a.save('tasks', [{ id: 'x', n: 1 }])
  assert.ok(stored(db, 'tasks').z.d, 'z (served by the save) tombstoned')
  assert.equal(stored(db, 'tasks').w.d, null, 'w (never served to a) survives')
})

test('a write failure to the db calls onLocalWriteError and sets failed', async () => {
  const errors = []
  const { db, make } = setup()
  const e = make('a', { onLocalWriteError: (key, err) => errors.push([key, err]) })
  const statuses = []
  e.onStatusChange((f) => statuses.push(f))
  await e.save('tasks', [{ id: 't1' }])
  assert.equal(e.failed, false)

  db.failOn('setItem', { key: 'r2:tasks' })
  await e.save('tasks', [{ id: 't1' }, { id: 't2' }]) // resolves, like v1
  assert.equal(errors.length, 1)
  assert.equal(errors[0][0], 'tasks')
  assert.match(errors[0][1].message, /QuotaExceeded/)
  assert.equal(e.failed, true)
  assert.deepEqual(statuses, [false, true])
  // the edit is not lost from memory
  assert.deepEqual((await e.get('tasks', [])).map((x) => x.id), ['t1', 't2'])
  assert.ok(!('t2' in stored(db, 'tasks')), 'not durable yet')

  // the next successful write persists it and clears failed
  await e.save('tasks', [{ id: 't1' }, { id: 't2' }, { id: 't3' }])
  assert.equal(e.failed, false)
  assert.deepEqual(statuses, [false, true, false])
  assert.deepEqual(Object.keys(stored(db, 'tasks')).sort(), ['t1', 't2', 't3'])
  assert.ok(dirtyIds(e).includes('tasks/t2'))
})

test('a failing outbox write is also reported', async () => {
  const errors = []
  const { db, make } = setup()
  const e = make('a', { onLocalWriteError: (k, err) => errors.push(k) })
  await e.ready()
  db.failOn('setItem', { key: OUTBOX_KEY })
  await e.save('notes', [{ id: 'n1' }])
  assert.deepEqual(errors, ['notes'])
  assert.equal(e.failed, true)
})

test('every db write happens inside the injected lock', async () => {
  const lock = createFakeLock()
  const raw = createFakeDb()
  const db = guardedDb(raw, lock)
  const { make } = setup({ lock, db })
  const e = make()
  await e.save('tasks', [{ id: 'a' }])
  await e.update('tasks', (l) => [...l, { id: 'b' }], [])
  await e.save('habits', [{ id: 'h', checkins: ['2026-01-01'] }])
  assert.deepEqual(db.violations, [])
  assert.ok(lock.state.requests.length >= 3)
  assert.ok(lock.state.requests.every((n) => n === LOCK_NAME))
  assert.equal(lock.state.maxHeld, 1)
  assert.ok(raw.calls.setItem >= 5)
})

test('two tabs: concurrent updates through one lock both survive (fresh read inside the lock)', async () => {
  const { db, make } = setup()
  const a = make('a')
  const b = make('b')
  await a.ready()
  await b.ready()
  assert.equal(a.meta.deviceId, b.meta.deviceId, 'one device id per db')
  await Promise.all([
    ...Array.from({ length: 5 }, (_, i) => a.update('tasks', (l) => [...l, { id: `a${i}` }], [])),
    ...Array.from({ length: 5 }, (_, i) => b.update('tasks', (l) => [...l, { id: `b${i}` }], [])),
  ])
  const ids = Object.keys(stored(db, 'tasks')).sort()
  assert.equal(ids.length, 10)
  assert.ok(Object.values(stored(db, 'tasks')).every((r) => r.d === null))
  // stamps from two tabs of one device never collide
  const hlcs = Object.values(stored(db, 'tasks')).map((r) => r.h)
  assert.equal(new Set(hlcs).size, 10)
  // the outbox saw all of them even though each tab had its own in-memory copy
  await a.save('tasks', await a.get('tasks', []))
  assert.equal(db.snapshot()[OUTBOX_KEY].dirty.length, 10)
})

test('a write is announced on the bus; a second tab reloads its cache and notifies', async () => {
  const { group, make } = setup()
  const a = make('a')
  const b = make('b')
  assert.deepEqual(await b.get('tasks', []), []) // b caches the empty collection
  const seen = []
  b.subscribe('tasks', (v) => seen.push(v))

  await a.save('tasks', [{ id: 't1', title: 'from a' }])
  assert.deepEqual(group.sent, [{ type: BUS_TYPE, from: group.sent[0].from, collections: ['tasks'] }])
  await b.whenIdle()
  assert.equal(seen.length, 1)
  assert.deepEqual(seen[0], [{ id: 't1', title: 'from a' }])
  assert.deepEqual(await b.get('tasks', []), [{ id: 't1', title: 'from a' }])

  b.close()
})

test('a no-op save is not announced, and a tab ignores its own echo and foreign messages', async () => {
  const { group, make } = setup()
  const a = make('a')
  const bus = group.make() // a bystander that can inject messages
  await a.save('tasks', [{ id: 't1' }])
  const sentAfterFirst = group.sent.length
  await a.save('tasks', await a.get('tasks', []))
  assert.equal(group.sent.length, sentAfterFirst)
  const seen = []
  a.subscribe('tasks', (v) => seen.push(v))
  bus.postMessage({ type: 'other', from: 'x', collections: ['tasks'] })
  bus.postMessage({ type: BUS_TYPE, from: 'x', collections: ['not-a-collection', 7] })
  await a.whenIdle()
  await new Promise((r) => setTimeout(r, 0))
  await a.whenIdle()
  assert.equal(seen.length, 0)
})

test('habit writes announce both collections and notify the owning key once', async () => {
  const { group, make } = setup()
  const a = make('a')
  const b = make('b')
  await b.get('habits', [])
  const seen = []
  b.subscribe('habits', (v) => seen.push(v))
  await a.save('habits', [{ id: 'h1', name: 'run', checkins: ['2026-01-01'] }])
  assert.deepEqual([...group.sent[0].collections].sort(), ['habitCheckins', 'habits'])
  await b.whenIdle()
  assert.equal(seen.length, 1)
  assert.deepEqual(seen[0], [{ id: 'h1', name: 'run', checkins: ['2026-01-01'] }])
})

test('clock never goes behind stored stamps, even if the wall clock moved back', async () => {
  const { db, clockMs, make } = setup()
  const e = make()
  await e.save('tasks', [{ id: 't1', v: 1 }])
  const h1 = stored(db, 'tasks').t1.h
  clockMs.set(clockMs.now() - 3_600_000) // device clock set back an hour
  const cold = setup({ db, t: clockMs.now() }).make('c')
  await cold.update('tasks', (l) => l.map((x) => ({ ...x, v: 2 })), [])
  const h2 = stored(db, 'tasks').t1.h
  assert.ok(h2 > h1, `${h2} should be after ${h1}`)
})

test('meta keeps cursor/userId/lastPullAt and one deviceId, used as hlc node and record device', async () => {
  const { db, make } = setup()
  await db.setItem(META_KEY, { cursor: 42, userId: 'u1', deviceId: 'dev-fixed', lastPullAt: 7 })
  const e = make()
  await e.save('tasks', [{ id: 't1' }])
  assert.deepEqual(e.meta, { cursor: 42, userId: 'u1', deviceId: 'dev-fixed', lastPullAt: 7 })
  assert.ok(stored(db, 'tasks').t1.h.endsWith('-dev-fixed'))
  assert.deepEqual(db.snapshot()[META_KEY], { cursor: 42, userId: 'u1', deviceId: 'dev-fixed', lastPullAt: 7 })

  const fresh = setup()
  const f = fresh.make()
  await f.ready()
  assert.match(f.meta.deviceId, /^a\d+$/)
  assert.equal(f.meta.cursor, null)
  assert.equal(fresh.db.snapshot()[META_KEY].deviceId, f.meta.deviceId)
})

test('outbox is persisted and restored across engine instances', async () => {
  const { db, make } = setup()
  const e = make()
  await e.save('tasks', [{ id: 't1' }, { id: 't2' }])
  const e2 = setup({ db }).make('z')
  await e2.ready()
  assert.deepEqual(dirtyIds(e2), ['tasks/t1', 'tasks/t2'])
  assert.equal(e2.outbox.hlcOf('tasks', 't1'), stored(db, 'tasks').t1.h)
})

test('stored rows with a malformed hlc are ignored, not fatal', async () => {
  const db = createFakeDb({
    'r2:tasks': { recs: { ok: { b: { id: 'ok' }, h: '001700000000000-0000-dev', d: null, p: 1000 }, bad: { b: { id: 'bad' }, h: 'nope', d: null, p: 2000 } } },
  })
  const e = setup({ db }).make()
  assert.deepEqual(await e.get('tasks', []), [{ id: 'ok' }])
})
