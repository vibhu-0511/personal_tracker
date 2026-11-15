import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createSyncRouter, createV1Db } from '../src/sync/router.js'
import { createSyncEngine } from '../src/sync/engine.js'
import { createEngine2 } from '../src/sync/engine2.js'
import { createFlags, FLAGS_OVERRIDE_KEY } from '../src/sync/migrate.js'
import { ADAPTER_KEYS } from '../src/sync/adapters.js'
import { createFakeDb } from './helpers/fakeDb.js'

// Everything runs on in-memory fakes (fakeDb, a fake kv_store cloud, a Web Locks style
// mutex, no bus, no network). src/store.js cannot be imported here (supabaseClient.js
// throws without env), so the routing logic under test lives in src/sync/router.js.

const T0 = 1_700_000_000_000
const flushTasks = async () => { for (let i = 0; i < 10; i++) await new Promise((r) => setImmediate(r)) }

function makeStorage(initial = {}) {
  const m = new Map(Object.entries(initial))
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) }
}

function makeFakeKvCloud({ userId = 'u1' } = {}) {
  const rows = new Map()
  const log = []
  return {
    rows,
    log,
    async getSession() { return { data: { session: userId ? { user: { id: userId } } : null } } },
    async read(key, uid) { log.push(['read', key]); return rows.get(`${uid}:${key}`) || null },
    async write(key, uid, wrapped) {
      log.push(['write', key])
      rows.set(`${uid}:${key}`, { value: wrapped.data, updated_at: new Date(wrapped.updatedAt).toISOString() })
    },
  }
}

const mutex = () => {
  let tail = Promise.resolve()
  return (_name, fn) => { const run = tail.then(fn); tail = run.then(() => undefined, () => undefined); return run }
}

function setup({ env = '', storage = makeStorage(), db = createFakeDb(), withV2 = true } = {}) {
  const cloud = makeFakeKvCloud()
  const v1 = createSyncEngine({ db, cloud, now: () => T0 })
  const flags = createFlags({ env, storage })
  const created = []
  const v2Keys = []
  const router = createSyncRouter({
    v1,
    createV2: withV2 ? () => {
      const e = createEngine2({ db, lock: mutex(), bus: null, now: () => T0, win: null, doc: null })
      created.push(e)
      return e
    } : undefined,
    flags,
    onV2Key: (key) => v2Keys.push(key),
  })
  return { db, cloud, v1, flags, router, created, v2Keys, storage }
}

// ---- flags off: byte-identical to v1 -------------------------------------------------

test('flags off: get/save/mutate are v1 calls with the same arguments and return what v1 returns', async () => {
  const calls = []
  const v1 = {
    async get(key, fb) { calls.push(['get', key, fb]); return 'v1-get' },
    async save(key, data) { calls.push(['save', key, data]) },
    async mutate(key, fn, fb) { calls.push(['mutate', key, fn, fb]); return 'v1-mutate' },
  }
  const fn = () => 1
  const router = createSyncRouter({
    v1,
    createV2: () => assert.fail('v2 must not be created with flags off'),
    flags: createFlags({ env: '', storage: makeStorage() }),
  })
  const fb = []
  assert.equal(await router.get('notes', fb), 'v1-get')
  assert.equal(calls[0][2], fb) // fallback passed through by identity
  await router.save('notes', ['x'])
  assert.equal(await router.mutate('tasks', fn, []), 'v1-mutate')
  assert.equal(calls[2][2], fn)
  assert.deepEqual(calls.map((c) => c[0]), ['get', 'save', 'mutate'])
  assert.equal(router.v2, null)
})

test('flags off: router over the real v1 engine leaves exactly the db and cloud writes v1 makes alone', async () => {
  const dbA = createFakeDb()
  const dbB = createFakeDb()
  const cloudA = makeFakeKvCloud()
  const cloudB = makeFakeKvCloud()
  const direct = createSyncEngine({ db: dbA, cloud: cloudA, now: () => T0 })
  const routed = createSyncRouter({
    v1: createSyncEngine({ db: dbB, cloud: cloudB, now: () => T0 }),
    createV2: () => assert.fail('no v2'),
    flags: createFlags({ env: '', storage: makeStorage() }),
  })

  const script = async (e) => {
    const out = []
    out.push(await e.get('notes', []))
    await e.save('notes', [{ id: 'n1', text: 'a' }])
    out.push(await e.get('notes', []))
    out.push(await e.mutate('progress', (p) => ({ ...p, a: { status: 'solved' } }), {}))
    out.push(await e.mutate('progress', (p) => ({ ...p, b: { status: 'todo' } }), {}))
    out.push(await e.mutate('reminders', (r) => [...r, { id: 'r1' }], []))
    await e.save('settings', { theme: 'ocean' })
    out.push(await e.get('settings', {}))
    return out
  }
  const outA = await script(direct)
  const outB = await script({
    get: routed.get,
    save: (k, d) => routed.save(k, d),
    mutate: routed.mutate,
  })
  assert.deepEqual(outB, outA)
  assert.deepEqual(dbB.snapshot(), dbA.snapshot())
  assert.deepEqual(dbB.calls, dbA.calls)
  // push timers are real here; settle them identically on both sides
  await direct.flush()
  await routed.flush()
  assert.deepEqual(cloudB.log, cloudA.log)
  assert.deepEqual([...cloudB.rows], [...cloudA.rows])
  assert.deepEqual(Object.keys(dbB.snapshot()).filter((k) => k.startsWith('r2:')), [])
})

test('flags off: every key is v1 and engine2 is never built, even for reconcile, flush, claimOwner, status', async () => {
  const s = setup()
  for (const key of ADAPTER_KEYS) assert.equal(s.router.isV2(key), false)
  await s.router.save('notes', [{ id: 'a' }])
  await s.router.mutate('reminders', (r) => r, [])
  assert.equal(await s.router.reconcileKey('notes'), 'push') // v1's own decision: local newer than the empty cloud
  await s.router.reconcileAll(ADAPTER_KEYS)
  await s.router.flush()
  await s.router.claimOwner('u1')
  const seen = []
  const off = s.router.onStatusChange((f) => seen.push(f))
  off()
  assert.deepEqual(seen, [false])
  assert.equal(s.created.length, 0)
  assert.equal(s.router.v2, null)
  assert.equal(await s.db.getItem('__owner'), 'u1')
})

test('flags off: a router without a v2 factory is plain v1 even if a flag says on', async () => {
  const s = setup({ env: 'notes', withV2: false })
  assert.equal(s.router.isV2('notes'), false)
  await s.router.save('notes', [{ id: 'a' }])
  assert.equal((await s.db.getItem('notes')).data[0].id, 'a')
})

test('flag source that throws means off', async () => {
  const v1 = { async get() { return 'v1' }, save: async () => {}, mutate: async () => 0 }
  const router = createSyncRouter({
    v1,
    createV2: () => assert.fail('no'),
    flags: { isV2() { throw new Error('boom') } },
  })
  assert.equal(await router.get('notes', []), 'v1')
})

test('unknown or non-adapter keys are never v2', async () => {
  const s = setup({ env: 'notes,__owner,bogus' })
  assert.equal(s.router.isV2('__owner'), false)
  assert.equal(s.router.isV2('bogus'), false)
  assert.equal(s.router.isV2('notes'), true)
})

// ---- a key on: engine2 --------------------------------------------------------------

test('key on: get/save/mutate hit engine2, not v1, and write the v2 record layout', async () => {
  const s = setup({ env: 'notes,reminders' })
  const v1Calls = []
  for (const m of ['get', 'save', 'mutate']) {
    const orig = s.v1[m]
    s.v1[m] = (...a) => { v1Calls.push(m); return orig(...a) }
  }
  assert.deepEqual(await s.router.get('notes', []), [])
  await s.router.save('notes', [{ id: 'n1', text: 'hello' }])
  assert.deepEqual(await s.router.get('notes', []), [{ id: 'n1', text: 'hello' }])
  const updated = await s.router.mutate('reminders', (r) => [...r, { id: 'r1', text: 'x' }], [])
  assert.deepEqual(updated, [{ id: 'r1', text: 'x' }])
  assert.deepEqual(await s.router.get('reminders', []), [{ id: 'r1', text: 'x' }])

  assert.deepEqual(v1Calls, [])
  assert.equal(s.created.length, 1) // one engine2 shared by both keys
  assert.equal(s.router.v2, s.created[0])
  const snap = s.db.snapshot()
  assert.ok(snap['r2:notes'].recs.n1, 'engine2 collection written')
  assert.ok(snap['r2:reminders'].recs.r1)
  assert.equal(Object.hasOwn(snap, 'notes'), false) // v1 shape is the mirror's job, not the router's
  assert.deepEqual(s.cloud.log, []) // kv_store untouched
})

test('mixed: a v1 key and a v2 key side by side, only the flagged one reaches engine2', async () => {
  const s = setup({ env: 'goals' })
  await s.router.save('notes', [{ id: 'n' }]) // v1
  await s.router.save('goals', [{ id: 'g' }]) // v2
  const snap = s.db.snapshot()
  assert.deepEqual(snap.notes.data, [{ id: 'n' }])
  assert.ok(snap['r2:goals'])
  assert.equal(Object.hasOwn(snap, 'goals'), false)
  assert.equal(Object.hasOwn(snap, 'r2:notes'), false)
})

test('mutations on a v2 key are serialised: two concurrent mutate calls both survive', async () => {
  const s = setup({ env: 'reminders' })
  await Promise.all([
    s.router.mutate('reminders', (r) => [...r, { id: 'a' }], []),
    s.router.mutate('reminders', (r) => [...r, { id: 'b' }], []),
  ])
  assert.deepEqual((await s.router.get('reminders', [])).map((r) => r.id).sort(), ['a', 'b'])
})

test('per-device override beats the env list in both directions', async () => {
  const storage = makeStorage({ [FLAGS_OVERRIDE_KEY]: JSON.stringify({ notes: false, tasks: true }) })
  const s = setup({ env: 'notes', storage })
  assert.equal(s.router.isV2('notes'), false)
  assert.equal(s.router.isV2('tasks'), true)
  // flipping at runtime takes effect on the next call
  s.flags.setOverride('tasks', null)
  assert.equal(s.router.isV2('tasks'), false)
  await s.router.save('tasks', [{ id: 't' }])
  assert.equal(s.created.length, 0)
})

test('onV2Key is announced once per key, the first time it is routed to v2', async () => {
  const s = setup({ env: 'notes,tasks' })
  await s.router.get('notes', [])
  await s.router.save('notes', [])
  await s.router.mutate('notes', (n) => n, [])
  await s.router.get('tasks', [])
  await s.router.get('goals', []) // v1
  assert.deepEqual(s.v2Keys, ['notes', 'tasks'])
})

test('a failing engine2 factory propagates, is not cached, and never falls back to v1', async () => {
  let attempts = 0
  const db = createFakeDb()
  const v1 = createSyncEngine({ db, cloud: makeFakeKvCloud(), now: () => T0 })
  const router = createSyncRouter({
    v1,
    createV2: () => {
      attempts++
      if (attempts === 1) throw new Error('no BroadcastChannel')
      return createEngine2({ db, lock: mutex(), bus: null, win: null, doc: null })
    },
    flags: createFlags({ env: 'notes', storage: makeStorage() }),
  })
  await assert.rejects(router.save('notes', [{ id: 'a' }]), /no BroadcastChannel/)
  assert.equal(await db.getItem('notes'), null) // v1 was not written
  await router.save('notes', [{ id: 'a' }])
  assert.equal(attempts, 2)
  assert.deepEqual(await router.get('notes', []), [{ id: 'a' }])
})

// ---- lifecycle ---------------------------------------------------------------------

test('reconcileKey: a v2 key resolves noop and never touches the v1 cloud path; v1 keys delegate', async () => {
  const s = setup({ env: 'notes' })
  assert.equal(await s.router.reconcileKey('notes'), 'noop')
  assert.deepEqual(s.cloud.log, [])
  await s.router.save('tasks', [{ id: 't' }])
  await s.router.flush()
  assert.deepEqual(s.cloud.log, [['write', 'tasks']])
  s.cloud.log.length = 0
  await s.router.reconcileKey('tasks')
  assert.deepEqual(s.cloud.log, [['read', 'tasks']])
})

test('reconcileAll: v1 gets only the v1 keys; with a v2 key on, engine2 sync is started', async () => {
  const reconciled = []
  const started = []
  const v1 = { reconcileAll: async (keys) => reconciled.push(keys), onStatusChange: () => () => {} }
  const keys = ['notes', 'tasks', 'goals']
  const flagsOn = createFlags({ env: 'tasks', storage: makeStorage() })
  const router = createSyncRouter({
    v1,
    createV2: () => ({ startSync: async () => { started.push(1); return true }, subscribe() {} }),
    flags: flagsOn,
  })
  await router.reconcileAll(keys)
  assert.deepEqual(reconciled, [['notes', 'goals']])
  assert.deepEqual(started, [1])

  // all off: the very same array goes to v1, engine2 is not built
  const off = createSyncRouter({
    v1,
    createV2: () => assert.fail('no'),
    flags: createFlags({ env: '', storage: makeStorage() }),
  })
  await off.reconcileAll(keys)
  assert.equal(reconciled[1], keys)
})

test('flush: v1 and engine2 both flushed; an engine2 failure does not block v1', async () => {
  const order = []
  const v1 = { flush: async () => { order.push('v1') } }
  const router = createSyncRouter({
    v1,
    createV2: () => ({ flush: async () => { order.push('v2'); throw new Error('offline') }, subscribe() {}, get() { return [] } }),
    flags: createFlags({ env: 'notes', storage: makeStorage() }),
  })
  await router.flush()
  assert.deepEqual(order, ['v1']) // engine2 not built yet
  await router.get('notes', [])
  await router.flush()
  assert.deepEqual(order.sort(), ['v1', 'v1', 'v2'])
})

test('claimOwner: engine2 claims first; v1 clear() keeps r2:* while v2 is in use and is db.clear() otherwise', async () => {
  // a different user signs in on a device that holds data for u1
  const db = createFakeDb()
  const cloud = makeFakeKvCloud({ userId: 'u2' })
  let router
  const v1 = createSyncEngine({
    db: createV1Db(db, { keepV2: () => router?.v2 != null }),
    cloud,
    now: () => T0,
  })
  router = createSyncRouter({
    v1,
    createV2: () => createEngine2({ db, lock: mutex(), bus: null, win: null, doc: null }),
    flags: createFlags({ env: 'notes', storage: makeStorage() }),
  })
  await router.claimOwner('u1')
  await router.save('notes', [{ id: 'n1' }])
  await router.save('tasks', [{ id: 't1' }]) // v1 key
  assert.ok(db.has('r2:notes'))
  assert.ok(db.has('tasks'))

  await router.claimOwner('u2')
  assert.equal(await db.getItem('__owner'), 'u2')
  assert.equal(db.has('tasks'), false) // v1 data of u1 is gone
  assert.deepEqual(await router.get('notes', []), []) // v2 data of u1 is gone
  const meta = await db.getItem('r2:meta')
  assert.equal(meta.userId, 'u2') // engine2 meta survived v1's clear and names the new owner
  assert.equal(router.v2.meta.userId, 'u2')
})

test('claimOwner with no flags on: engine2 untouched, v1 behaviour (db.clear on a user change)', async () => {
  const db = createFakeDb({ __owner: 'u1', notes: { data: [1], updatedAt: 5 } })
  const router = createSyncRouter({
    v1: createSyncEngine({ db: createV1Db(db, { keepV2: () => false }), cloud: makeFakeKvCloud(), now: () => T0 }),
    createV2: () => assert.fail('no'),
    flags: createFlags({ env: '', storage: makeStorage() }),
  })
  await router.claimOwner('u2')
  assert.equal(db.calls.clear, 1)
  assert.equal(db.has('notes'), false)
  assert.equal(await db.getItem('__owner'), 'u2')
})

test('createV1Db: clear is the plain db.clear() unless keepV2; every other method delegates', async () => {
  const db = createFakeDb({ a: 1, 'r2:notes': { recs: {} }, 'r2:meta': { userId: 'u' } })
  const plain = createV1Db(db)
  assert.equal(await plain.getItem('a'), 1)
  await plain.setItem('b', 2)
  await plain.removeItem('b')
  assert.deepEqual(await plain.keys(), ['a', 'r2:notes', 'r2:meta'])
  const keep = createV1Db(db, { keepV2: () => true })
  await keep.clear()
  assert.deepEqual(db.snapshot(), { 'r2:notes': { recs: {} }, 'r2:meta': { userId: 'u' } })
  assert.equal(db.calls.clear, 0)
  await plain.clear()
  assert.equal(db.calls.clear, 1)
  assert.deepEqual(db.snapshot(), {})
})

test('onStatusChange: v1 only until engine2 exists; then failed = v1 or v2, delivered on change only', async () => {
  let push1
  let push2
  const v1 = { onStatusChange: (fn) => { push1 = fn; fn(false); return () => { push1 = null } } }
  const v2 = { onStatusChange: (fn) => { push2 = fn; fn(false); return () => { push2 = null } }, get: async () => [], subscribe() {} }
  const router = createSyncRouter({
    v1,
    createV2: () => v2,
    flags: createFlags({ env: 'notes', storage: makeStorage() }),
  })
  const seen = []
  const off = router.onStatusChange((f) => seen.push(f))
  assert.deepEqual(seen, [false])
  push1(true)
  assert.deepEqual(seen, [false, true])
  await router.get('notes', []) // engine2 appears and attaches to the existing listener
  assert.deepEqual(seen, [false, true]) // still failed, no duplicate delivery
  push1(false)
  assert.deepEqual(seen, [false, true, false])
  push2(true)
  assert.deepEqual(seen, [false, true, false, true])
  push1(true)
  assert.deepEqual(seen, [false, true, false, true]) // already failed
  off()
  assert.equal(push1, null)
  assert.equal(push2, null)
})

// ---- store.js contract ---------------------------------------------------------------

test('store.js keeps every v1 export and signature, SYNCED_KEYS and the untouched dsa key', () => {
  const src = readFileSync(new URL('../src/store.js', import.meta.url), 'utf8')
  const fns = [...src.matchAll(/^export (?:async )?function (\w+)\(([^)]*)\)/gm)].map((m) => `${m[1]}(${m[2]})`)
  assert.deepEqual(fns, [
    'storageAvailable()',
    'reconcileAll()',
    'getSettings()', 'saveSettings(settings)',
    'getNotes()', 'saveNotes(notes)',
    'getProgress()', 'markProblem(problemId, status, tags)',
    'getExpenses()', 'saveExpenses(expenses)',
    'getBudgets()', 'saveBudgets(budgets)',
    'getGoals()', 'saveGoals(goals)',
    'getExamProgress()', 'saveExamProgress(progress)',
    'getExamNotes()', 'saveExamNotes(notes)',
    'getPuzzleProgress()', 'savePuzzleProgress(progress)',
    'getInvestProgress()', 'saveInvestProgress(progress)',
    'getWatchlist()', 'saveWatchlist(watchlist)',
    'getTasks()', 'saveTasks(tasks)',
    'getReminders()', 'saveReminders(reminders)', 'mutateReminders(fn)',
    'getHabits()', 'saveHabits(habits)',
    'getMoodLog()', 'saveMoodLog(log)',
    'getLoans()', 'saveLoans(loans)',
    'getChecklists()', 'saveChecklists(checklists)',
    'mutateTasks(fn)', 'mutateHabits(fn)', 'mutateMoodLog(fn)', 'mutateNotes(fn)',
  ])
  const consts = [...src.matchAll(/^export const (\w+)/gm)].map((m) => m[1])
  assert.deepEqual(consts, ['onSyncStatusChange', 'reconcileKey', 'flush', 'claimOwner', 'SYNCED_KEYS'])
  const list = src.match(/export const SYNCED_KEYS = \[([\s\S]*?)\]/)[1]
  assert.deepEqual([...list.matchAll(/'(\w+)'/g)].map((m) => m[1]), [
    'settings', 'notes', 'progress', 'expenses', 'budgets', 'goals',
    'examProgress', 'examNotes', 'investProgress', 'watchlist',
    'tasks', 'reminders', 'habits', 'moodLog', 'loans', 'puzzleProgress', 'checklists',
  ])
  assert.deepEqual([...list.matchAll(/'(\w+)'/g)].map((m) => m[1]), [...ADAPTER_KEYS])
  assert.equal(src.includes('dsa_mastery'), false)
  // every read and write goes through the router; the v1 engine is only handed to it
  assert.match(src, /const engine = createSyncRouter\(/)
  assert.equal(/\bv1Engine\.(get|save|mutate)\(/.test(src), false)
  // the emit-after-write code is unchanged (test/storeEvents.test.js reads these bodies too)
  assert.match(src, /async function saveSynced\(key, data\) \{\n {2}await engine\.save\(key, data\)\n {2}emitStoreKey\(key\)\n\}/)
  assert.match(src, /async function mutateEmit\(key, fn, fallback\) \{\n {2}const result = await engine\.mutate\(key, fn, fallback\)\n {2}emitStoreKey\(key\)\n {2}return result\n\}/)
  assert.match(src, /export async function reconcileAll\(\) \{\n {2}await engine\.reconcileAll\(SYNCED_KEYS\)\n\}/)
})

test('store.js wiring: flags default to env + override only, nothing turns a key on', () => {
  const src = readFileSync(new URL('../src/store.js', import.meta.url), 'utf8')
  assert.match(src, /createFlags\(\)/)
  assert.equal(/setOverride\(/.test(src), false)
  assert.equal(/VITE_SYNC_V2_KEYS/.test(src.replace(/\/\/.*$/gm, '')), false)
})
