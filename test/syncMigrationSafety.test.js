import test from 'node:test'
import assert from 'node:assert/strict'
import { createSyncRouter } from '../src/sync/router.js'
import { createSyncEngine } from '../src/sync/engine.js'
import { createEngine2 } from '../src/sync/engine2.js'
import { createCloudV2 } from '../src/sync/cloudV2.js'
import { createFlags, createV2Rollout, createMigrator, FLAGS_OVERRIDE_KEY } from '../src/sync/migrate.js'
import { bootSync } from '../src/sync/appSubscriptions.js'
import { serialize } from '../src/sync/hlc.js'
import { createFakeCloudV2 } from './helpers/fakeCloudV2.js'
import { createFakeDb } from './helpers/fakeDb.js'

// Review findings 1, 2, 5 and 6 of the sync v2 rollout, on in-memory fakes only (fakeDb,
// fakeCloudV2 behind a supabase-js shaped client, a fake kv_store, a manual timer for the
// blob mirror). src/store.js cannot be imported under node:test, so the rig builds the same
// wiring it does: router + createV2Rollout + a flag source.

const T0 = 1_700_000_000_000
const DAY = 86_400_000
const settle = async () => { for (let i = 0; i < 25; i++) await new Promise((r) => setImmediate(r)) }
const task = (id, title, extra = {}) => ({ id, title, ...extra })

function makeFakeSupabase(cloud) {
  const fail = (e) => ({ data: null, error: { message: e.message, code: e.code }, status: e.status ?? 400 })
  return {
    auth: { getSession: () => cloud.getSession() },
    async rpc(fn, args) {
      try { return { data: await cloud.push(args.rows), error: null, status: 200 } } catch (e) { return fail(e) }
    },
    from() {
      const q = { gt: null }
      const b = {
        select() { return b },
        gt(col, v) { q.gt = v; return b },
        order() { return b },
        limit(n) { q.limit = n; return b },
        then(res, rej) {
          return (async () => {
            try { return { data: await cloud.pull({ sinceRev: q.gt ?? 0, limit: q.limit }), error: null, status: 200 } } catch (e) { return fail(e) }
          })().then(res, rej)
        },
      }
      return b
    },
    channel() {
      const ch = { bindings: [] }
      ch.on = (type, filter, cb) => { ch.bindings.push(cb); return ch }
      ch.subscribe = (statusCb) => {
        const sub = cloud.subscribe((evt) => ch.bindings[0](evt), { onStatus: (s) => statusCb(s) })
        ch.unsub = () => sub.unsubscribe()
        return ch
      }
      return ch
    },
    removeChannel(ch) { ch.unsub?.(); return Promise.resolve('ok') },
  }
}

function makeFakeKv() {
  const rows = new Map()
  const writes = []
  return {
    rows,
    writes,
    async read(key, uid) { return rows.get(`${uid}:${key}`) || null },
    async write(key, uid, wrapped) {
      writes.push(key)
      rows.set(`${uid}:${key}`, { value: wrapped.data, updated_at: new Date(wrapped.updatedAt).toISOString() })
    },
  }
}

function makeTimers() {
  const pending = new Map()
  let n = 0
  return {
    setTimer: (fn, ms) => { const h = ++n; pending.set(h, { fn, ms }); return h },
    clearTimer: (h) => { pending.delete(h) },
    async fireAll() {
      const due = [...pending.values()]
      pending.clear()
      for (const t of due) t.fn()
      await settle()
    },
  }
}

// Web Locks semantics: one queue per lock name (the drain lock is held for life).
const mutex = () => {
  const tails = new Map()
  return (name, fn) => {
    const run = (tails.get(name) || Promise.resolve()).then(fn)
    tails.set(name, run.then(() => undefined, () => undefined))
    return run
  }
}

const wireRow = (collection, id, body, ms, node = 'phoneA', pos = null, deleted = false) => ({
  collection, id, body: deleted ? null : body, pos, hlc: serialize({ ms, counter: 0, node }),
  device_id: node, deleted_at: deleted ? new Date(ms).toISOString() : null,
})

const pullRows = async (server) => Object.fromEntries(
  (await createCloudV2(makeFakeSupabase(server.fork())).pull({ sinceRev: 0 })).rows.map((x) => [x.id, x]),
)

// One device. `server` may be shared to model a second device on the same account.
function rig({ env = 'tasks', db = createFakeDb(), server, offline = false } = {}) {
  let t = T0
  const now = () => t
  const cloudServer = server ?? createFakeCloudV2({ userId: 'u1', now })
  const client = cloudServer.fork()
  if (offline) client.setOffline(true)
  const kv = makeFakeKv()
  const timers = makeTimers()
  const store = new Map()
  const flags = createFlags({
    env,
    storage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) },
  })
  const v1 = createSyncEngine({ db, cloud: { ...kv, getSession: async () => ({ data: { session: { user: { id: 'u1' } } } }) }, now })
  let rollout
  let n = 0
  const router = createSyncRouter({
    v1,
    flags,
    createV2: () => {
      const engine2 = createEngine2({
        db, cloud: createCloudV2(makeFakeSupabase(client)), lock: mutex(), bus: null, now, win: null, doc: null,
        random: () => 0, newId: () => `dev${String(++n).padStart(3, '0')}`,
      })
      rollout = createV2Rollout({
        engine: engine2, db, cloudKv: kv, getUserId: async () => 'u1', isV2: (k) => flags.isV2(k), now, ...timers,
      })
      return engine2
    },
    prepareV2Key: (key) => rollout.prepareKey(key),
    onV2Synced: () => rollout.release(),
    onV2Key: (key) => rollout.mirror.watch(key),
  })
  return {
    db, kv, timers, flags, router, v1, client, server: cloudServer, store,
    get rollout() { return rollout },
    setNow: (v) => { t = v },
    close: () => router.v2?.close(),
    async seedV1(key, data, updatedAt) { await db.setItem(key, { data, updatedAt }) },
  }
}

// ---- finding 1 -------------------------------------------------------------------------

test('finding 1: failed first pull leaves the v1 blob and kv_store untouched, and one add does not shrink the list', async () => {
  const s = rig({ offline: true })
  try {
    const original = { data: [task('a', 'A'), task('b', 'B'), task('c', 'C')], updatedAt: T0 - 1000 }
    await s.db.setItem('tasks', original)

    await s.router.reconcileAll(['tasks']) // no cursor: waits for the first pull, which fails
    assert.equal(s.router.v2.syncStatus().lastSyncedAt, null)

    // the first v2 read shows the v1 data, not an empty list
    assert.deepEqual((await s.router.get('tasks', [])).map((x) => x.id), ['a', 'b', 'c'])
    await s.router.mutate('tasks', (list) => [...list, task('d', 'D')], [])
    assert.deepEqual((await s.router.get('tasks', [])).map((x) => x.id), ['a', 'b', 'c', 'd'])

    await s.timers.fireAll()
    await s.rollout.mirror.flush()
    assert.deepEqual(await s.db.getItem('tasks'), original) // rollback copy intact
    assert.equal(s.kv.writes.length, 0)
    assert.equal(s.kv.rows.size, 0)
  } finally { s.close() }
})

test('finding 1: a key with nothing seeded and no pull never writes a partial blob (v2 not provisioned)', async () => {
  const s = rig({ offline: true })
  try {
    const original = { data: [task('a', 'A'), task('b', 'B'), task('c', 'C')], updatedAt: T0 - 1000 }
    await s.db.setItem('tasks', original)
    // straight to a v2 write, no reconcile at all
    await s.router.save('tasks', [task('x', 'only one')])
    await s.timers.fireAll()
    await s.rollout.mirror.flush()
    assert.deepEqual(await s.db.getItem('tasks'), original)
    assert.equal(s.kv.writes.length, 0)
  } finally { s.close() }
})

test('finding 1: once a pull has succeeded the held change is mirrored in full (all items, local and kv)', async () => {
  const s = rig({ offline: true })
  try {
    await s.db.setItem('tasks', { data: [task('a', 'A'), task('b', 'B'), task('c', 'C')], updatedAt: T0 - 1000 })
    await s.router.reconcileAll(['tasks'])
    await s.router.mutate('tasks', (list) => [...list, task('d', 'D')], [])
    await s.timers.fireAll()
    assert.equal(s.kv.writes.length, 0)

    s.client.setOffline(false)
    await s.router.v2.pull()
    await s.rollout.release()
    await s.timers.fireAll()
    await s.rollout.mirror.flush()
    assert.deepEqual((await s.db.getItem('tasks')).data.map((x) => x.id).sort(), ['a', 'b', 'c', 'd'])
    assert.deepEqual(s.kv.rows.get('u1:tasks').value.map((x) => x.id).sort(), ['a', 'b', 'c', 'd'])
  } finally { s.close() }
})

test('finding 1: a fresh device (no cursor) awaits the first pull in reconcileAll, so v2 keys render the cloud data', async () => {
  const server = createFakeCloudV2({ userId: 'u1', now: () => T0 })
  await server.fork().push([wireRow('tasks', 'r1', task('r1', 'remote one'), T0 - DAY, 'phoneA', 1000), wireRow('tasks', 'r2', task('r2', 'remote two'), T0 - DAY, 'phoneA', 2000)])
  const s = rig({ server })
  try {
    await s.router.reconcileAll(['tasks'])
    assert.notEqual(s.router.v2.syncStatus().lastSyncedAt, null) // the pull finished before reconcileAll resolved
    assert.deepEqual((await s.router.get('tasks', [])).map((x) => x.id), ['r1', 'r2'])
  } finally { s.close() }
})

test('finding 1: seeding is additive and idempotent; the first v2 read shows the v1 blob', async () => {
  const s = rig()
  try {
    await s.seedV1('tasks', [task('a', 'A'), task('b', 'B')], T0 - 500)
    assert.deepEqual((await s.router.get('tasks', [])).map((x) => x.id), ['a', 'b'])
    s.router.v2.close()
    const again = await createMigrator({ engine: s.router.v2, db: s.db }).importBlob('tasks', await s.db.getItem('tasks'), { safe: true })
    assert.deepEqual(again, { key: 'tasks', added: 0, updated: 0 })
  } finally { s.close() }
})

// ---- finding 2 -------------------------------------------------------------------------

test('finding 2: flag flipped off, a v2 event does not touch the v1 blob or arm a kv_store write', async () => {
  const s = rig()
  try {
    await s.seedV1('tasks', [task('a', 'A')], T0 - 1000)
    await s.router.reconcileAll(['tasks']) // pulled: mirror is live
    await s.router.save('tasks', [task('a', 'A'), task('b', 'B')])
    await s.timers.fireAll()
    assert.deepEqual((await s.db.getItem('tasks')).data.map((x) => x.id), ['a', 'b'])
    const kvBefore = s.kv.writes.length

    s.flags.setOverride('tasks', false) // back to v1 at runtime
    assert.equal(s.router.isV2('tasks'), false)
    await s.router.save('tasks', [task('a', 'A'), task('b', 'B'), task('v1only', 'edited in v1')]) // v1 write
    const v1Blob = await s.db.getItem('tasks')
    assert.equal(v1Blob.data.length, 3)

    // a v2 event: a remote record arrives by pull, and a bus-style write on engine2
    await s.server.fork().push([wireRow('tasks', 'remote', task('remote', 'R'), T0, 'phoneA', 9000)])
    await s.router.v2.pull()
    await s.router.v2.save('tasks', [task('zzz', 'v2 write')])
    await s.timers.fireAll()
    await s.rollout.mirror.flush()
    await settle()

    assert.deepEqual(await s.db.getItem('tasks'), v1Blob)
    assert.equal(s.kv.writes.length, kvBefore) // nothing new reached kv_store
  } finally { s.close() }
})

test('finding 2: a kv_store write armed while the flag was on is dropped once it is off', async () => {
  const s = rig()
  try {
    await s.seedV1('tasks', [task('a', 'A')], T0 - 1000)
    await s.router.reconcileAll(['tasks'])
    await s.router.save('tasks', [task('a', 'A'), task('b', 'B')]) // arms the debounced kv write
    await settle()
    s.flags.setOverride('tasks', false)
    await s.timers.fireAll()
    assert.equal(s.kv.writes.length, 0)
    assert.deepEqual(s.rollout.mirror.pending(), [])
  } finally { s.close() }
})

test('finding 2: flipping the flag back on re-seeds from the (newer) v1 blob and mirrors again', async () => {
  const s = rig()
  try {
    await s.seedV1('tasks', [task('a', 'A')], T0 - 1000)
    await s.router.reconcileAll(['tasks'])
    s.flags.setOverride('tasks', false)
    await s.router.save('tasks', [task('a', 'A'), task('n', 'new in v1')])
    s.flags.setOverride('tasks', true)
    assert.deepEqual((await s.router.get('tasks', [])).map((x) => x.id), ['a', 'n'])
    await s.router.save('tasks', [task('a', 'A'), task('n', 'new in v1'), task('m', 'v2')])
    await s.timers.fireAll()
    assert.deepEqual((await s.db.getItem('tasks')).data.map((x) => x.id), ['a', 'n', 'm'])
  } finally { s.close() }
})

// ---- finding 5 -------------------------------------------------------------------------

function bootFakes({ cursor }) {
  const order = []
  let releaseV1
  const v1Gate = new Promise((r) => { releaseV1 = r })
  return {
    order,
    releaseV1,
    args: {
      userId: 'u1',
      claimOwner: async () => { order.push('claim') },
      reconcileAll: async () => { order.push('all') },
      reconcileV1: async () => { order.push('v1:start'); await v1Gate; order.push('v1:end') },
      reconcileV2: async () => { order.push('v2') },
      getSettings: async () => { order.push('settings'); return {} },
      hasLocalCursor: () => cursor,
      onBackgroundDone: () => order.push('bg:done'),
    },
  }
}

test('finding 5: with a cursor present, render still blocks on the v1 reconcile; only the v2 half is background', async () => {
  const f = bootFakes({ cursor: true })
  let done = false
  const p = bootSync(f.args).then((r) => { done = true; return r })
  await settle()
  assert.equal(done, false) // v1 half still running
  assert.ok(!f.order.includes('settings'))
  assert.ok(!f.order.includes('v2')) // v2 starts only after v1 finished
  f.releaseV1()
  const r = await p
  assert.deepEqual(f.order.slice(0, 4), ['claim', 'v1:start', 'v1:end', 'settings'])
  await r.background
  assert.ok(f.order.includes('v2'))
  assert.equal(f.order.at(-1), 'bg:done')
})

test('finding 5: a failing v1 reconcile with a cursor rejects, as v1 always did', async () => {
  const f = bootFakes({ cursor: true })
  f.args.reconcileV1 = async () => { throw new Error('offline') }
  await assert.rejects(bootSync(f.args), /offline/)
})

test('finding 5: router.reconcileV1 hands v1 only its keys and is awaited; reconcileV2 seeds and starts engine2', async () => {
  const s = rig({ env: 'tasks' })
  try {
    const seen = []
    const orig = s.v1.reconcileAll
    s.v1.reconcileAll = async (keys) => { seen.push(keys); await orig(keys) }
    await s.router.reconcileV1(['notes', 'tasks'])
    assert.deepEqual(seen, [['notes']])
    assert.equal(s.router.v2, null) // v1 half does not build engine2
    await s.seedV1('tasks', [task('a', 'A')], T0 - 1)
    await s.router.reconcileV2(['notes', 'tasks'], { wait: 'all' })
    assert.notEqual(s.router.v2, null)
    assert.deepEqual((await s.router.get('tasks', [])).map((x) => x.id), ['a'])
  } finally { s.close() }
})

// ---- finding 6 -------------------------------------------------------------------------

test('finding 6: a stale blob does not resurrect a cloud tombstone or overwrite a newer cloud record (seed)', async () => {
  const s = rig()
  const t100 = T0 - 10 * DAY
  await s.server.fork().push([
    wireRow('tasks', 'T', null, t100, 'phoneA', null, true), // device A deleted T at t=100
    wireRow('tasks', 'R', task('R', 'edited on A'), t100 + DAY, 'phoneA', 2000), // and edited R afterwards
  ])
  const migrator = createMigrator({ engine: {}, db: s.db, cloud: createCloudV2(makeFakeSupabase(s.client)), now: () => T0 })
  const stale = { data: [task('T', 'old T'), task('R', 'old R'), task('N', 'never uploaded')], updatedAt: T0 - 2 * DAY }
  const r = await migrator.seedFromLocalBlob('tasks', { blob: stale, safe: true })
  assert.equal(r.pushed, 1) // only N
  const rows = await pullRows(s.server)
  assert.notEqual(rows.T.deletedAt, null)
  assert.deepEqual(rows.R.body, task('R', 'edited on A'))
  assert.deepEqual(rows.N.body, task('N', 'never uploaded'))
  assert.equal((await migrator.seedFromLocalBlob('tasks', { blob: stale, safe: true })).pushed, 0) // idempotent
})

test('finding 6: a record\'s own newer updatedAt may replace a live cloud record, never a tombstone (seed)', async () => {
  const s = rig()
  const base = T0 - 10 * DAY
  await s.server.fork().push([
    wireRow('progress', 'p1', { status: 'todo', updatedAt: base }, base),
    wireRow('progress', 'p2', null, base, 'phoneA', null, true),
  ])
  const migrator = createMigrator({ engine: {}, db: s.db, cloud: createCloudV2(makeFakeSupabase(s.client)), now: () => T0 })
  const blob = {
    data: { p1: { status: 'done', updatedAt: base + DAY }, p2: { status: 'done', updatedAt: base + 5 * DAY } },
    updatedAt: base + 6 * DAY,
  }
  const r = await migrator.seedFromLocalBlob('progress', { blob, safe: true })
  assert.equal(r.pushed, 1)
  const rows = await pullRows(s.server)
  assert.equal(rows.p1.body.status, 'done')
  assert.notEqual(rows.p2.deletedAt, null)
})

test('finding 6: importBlob (safe) never overwrites an existing record or resurrects a tombstone; adds get the lowest stamp', async () => {
  const s = rig()
  try {
    await s.router.get('tasks', []) // builds engine2
    const engine = s.router.v2
    const migrator = createMigrator({ engine, db: s.db })
    await engine.save('tasks', [task('T', 'T'), task('R', 'R new')])
    await engine.save('tasks', [task('R', 'R new')]) // T tombstoned locally
    const stale = { data: [task('T', 'T old'), task('R', 'R old'), task('N', 'N')], updatedAt: T0 + 1000 }
    const r = await migrator.importBlob('tasks', stale, { safe: true })
    assert.deepEqual(r, { key: 'tasks', added: 1, updated: 0 })
    assert.deepEqual((await engine.get('tasks', [])).map((x) => [x.id, x.title]), [['R', 'R new'], ['N', 'N']])
    const recs = (await s.db.getItem('r2:tasks')).recs
    assert.notEqual(recs.T.d, null) // still a tombstone
    assert.match(recs.N.h, /^000000000000000-/) // seeded: loses to any cloud row
    assert.deepEqual(await migrator.importBlob('tasks', stale, { safe: true }), { key: 'tasks', added: 0, updated: 0 })
  } finally { s.close() }
})

test('finding 6: importBlob (safe) updates a live record only with a strictly newer own updatedAt', async () => {
  const s = rig({ env: 'progress' })
  try {
    await s.router.get('progress', {})
    const engine = s.router.v2
    const migrator = createMigrator({ engine, db: s.db })
    await engine.save('progress', { p1: { status: 'todo', updatedAt: T0 - 100 }, p2: { status: 'todo', updatedAt: T0 - 100 } })
    const blob = {
      data: { p1: { status: 'done', updatedAt: T0 - 500 }, p2: { status: 'done', updatedAt: T0 + 5000 } },
      updatedAt: T0,
    }
    // p1: older own stamp -> kept; p2: strictly newer own stamp -> replaced
    const r = await migrator.importBlob('progress', blob, { safe: true })
    assert.equal(r.updated, 1)
    const got = await engine.get('progress', {})
    assert.equal(got.p1.status, 'todo')
    assert.equal(got.p2.status, 'done')
  } finally { s.close() }
})

test('finding 6: device B seeding a stale blob before its first pull is overruled by A\'s tombstone and newer edit', async () => {
  const server = createFakeCloudV2({ userId: 'u1', now: () => T0 })
  const t100 = T0 - 10 * DAY
  await server.fork().push([
    wireRow('tasks', 'T', null, t100, 'phoneA', null, true),
    wireRow('tasks', 'R', task('R', 'edited on A'), t100 + DAY, 'phoneA', 2000),
  ])
  const b = rig({ server })
  try {
    await b.seedV1('tasks', [task('T', 'old T'), task('R', 'old R')], T0 - 2 * DAY)
    // first read seeds engine2 from the blob (shows what v1 showed)
    assert.deepEqual((await b.router.get('tasks', [])).map((x) => x.id), ['T', 'R'])
    await b.router.reconcileAll(['tasks']) // first pull: the cloud rows beat the lowest-stamped seed
    assert.deepEqual((await b.router.get('tasks', [])).map((x) => [x.id, x.title]), [['R', 'edited on A']])
    await b.router.v2.flush()
    const rows = await pullRows(server)
    assert.notEqual(rows.T.deletedAt, null)
    assert.equal(rows.R.body.title, 'edited on A')
  } finally { b.close() }
})

test('flags stay off by default: the rollout helpers are never built without a flag', async () => {
  const s = rig({ env: '' })
  await s.seedV1('tasks', [task('a', 'A')], T0)
  await s.router.reconcileAll(['tasks'])
  assert.equal(s.router.v2, null)
  assert.equal(s.rollout, undefined)
  assert.equal(s.store.has(FLAGS_OVERRIDE_KEY), false)
})
