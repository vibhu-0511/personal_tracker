import test from 'node:test'
import assert from 'node:assert/strict'
import {
  createFlags, createBlobMirror, createMigrator, parseKeyList, preCutoverBackup,
  FLAGS_OVERRIDE_KEY, SEED_NODE,
} from '../src/sync/migrate.js'
import { createEngine2 } from '../src/sync/engine2.js'
import { createCloudV2 } from '../src/sync/cloudV2.js'
import { createCloudKv } from '../src/sync/cloudKv.js'
import { ADAPTER_KEYS } from '../src/sync/adapters.js'
import { serialize } from '../src/sync/hlc.js'
import { decideSync } from '../src/sync/logic.js'
import { createFakeCloudV2 } from './helpers/fakeCloudV2.js'
import { createFakeDb } from './helpers/fakeDb.js'

// Everything runs on in-memory fakes: fakeDb, fakeCloudV2 behind a supabase-js shaped
// client, a fake kv_store, a manual timer. No network, no real service.

const T0 = 1_700_000_000_000
const DAY = 86_400_000

const flush = async () => { for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r)) }

function makeClock(start = T0) {
  let t = start
  return { now: () => t, set: (v) => { t = v }, advance: (ms) => { t += ms } }
}

// supabase-js shaped client (rpc + select/gt/order/limit) over the v2 fake.
function makeFakeSupabase(cloud) {
  const fail = (e) => ({ data: null, error: { message: e.message, code: e.code }, status: e.status ?? 400 })
  return {
    auth: { getSession: () => cloud.getSession() },
    async rpc(fn, args) {
      try { return { data: await cloud.push(args.rows), error: null, status: 200 } } catch (e) { return fail(e) }
    },
    from() {
      const q = { gt: 0, limit: 1000 }
      const b = {
        select() { return b },
        gt(col, v) { q.gt = v; return b },
        order() { return b },
        limit(n) { q.limit = n; return b },
        then(res, rej) {
          return (async () => {
            try { return { data: await cloud.pull({ sinceRev: q.gt, limit: q.limit }), error: null, status: 200 } } catch (e) { return fail(e) }
          })().then(res, rej)
        },
      }
      return b
    },
  }
}

// kv_store stand-in behind createCloudKv's supabase surface; can reject writes.
function makeFakeKvSupabase() {
  const rows = new Map()
  const log = { writes: [], failNext: 0 }
  return {
    rows,
    log,
    auth: { getSession: async () => ({ data: { session: { user: { id: 'u1' } } } }) },
    from(table) {
      assert.equal(table, 'kv_store')
      return {
        upsert: async (row) => {
          if (log.failNext > 0) { log.failNext--; return { error: { message: 'JWT expired' } } }
          log.writes.push(row)
          rows.set(row.key, row)
          return { error: null }
        },
      }
    },
  }
}

function makeTimers() {
  const pending = new Map()
  let n = 0
  return {
    setTimer: (fn, ms) => { const h = ++n; pending.set(h, { fn, ms }); return h },
    clearTimer: (h) => { pending.delete(h) },
    get count() { return pending.size },
    delays: () => [...pending.values()].map((t) => t.ms),
    async fireAll() {
      const due = [...pending.entries()]
      pending.clear()
      for (const [, t] of due) t.fn()
      await flush()
    },
  }
}

function setup({ start = T0 } = {}) {
  const clock = makeClock(start)
  const db = createFakeDb()
  const server = createFakeCloudV2({ userId: 'u1', now: clock.now })
  const client = server.fork()
  const cloud = createCloudV2(makeFakeSupabase(client))
  let n = 0
  const engine = createEngine2({
    db, bus: null, now: clock.now, random: () => 0, newId: () => `dev${String(++n).padStart(3, '0')}`,
  })
  const migrator = createMigrator({ engine, db, cloud, now: clock.now })
  return { clock, db, server, client, cloud, engine, migrator }
}

const wireRow = (collection, id, body, ms, node = 'phone001', pos = null, deleted = false) => ({
  collection, id, body: deleted ? null : body, pos, hlc: serialize({ ms, counter: 0, node }),
  device_id: node, deleted_at: deleted ? new Date(ms).toISOString() : null,
})

const task = (id, title) => ({ id, title })

// ---- flags -------------------------------------------------------------------

function fakeStorage(initial = {}) {
  const map = new Map(Object.entries(initial))
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)) },
    map,
  }
}

test('flags default to OFF for every key (no env, no storage)', () => {
  const flags = createFlags({ env: undefined, storage: null })
  assert.deepEqual(flags.keys(), [])
  for (const key of ADAPTER_KEYS) assert.equal(flags.isV2(key), false)
  assert.equal(createFlags({ env: '', storage: fakeStorage() }).keys().length, 0)
})

test('flags come from VITE_SYNC_V2_KEYS; unknown names, blanks and repeats are ignored', () => {
  assert.deepEqual(parseKeyList(' puzzleProgress, notes ,bogus,,notes'), ['puzzleProgress', 'notes'])
  assert.deepEqual(parseKeyList(undefined), [])
  const flags = createFlags({ env: 'puzzleProgress,watchlist,nope', storage: fakeStorage() })
  assert.equal(flags.isV2('puzzleProgress'), true)
  assert.equal(flags.isV2('watchlist'), true)
  assert.equal(flags.isV2('notes'), false)
  assert.equal(flags.isV2('nope'), false)
  assert.deepEqual(flags.keys(), ['watchlist', 'puzzleProgress'].sort((a, b) => ADAPTER_KEYS.indexOf(a) - ADAPTER_KEYS.indexOf(b)))
})

test('a localStorage override beats the env list in both directions, per key', () => {
  const storage = fakeStorage({ [FLAGS_OVERRIDE_KEY]: JSON.stringify({ notes: true, watchlist: false }) })
  const flags = createFlags({ env: 'watchlist,progress', storage })
  assert.equal(flags.isV2('notes'), true) // on by override only
  assert.equal(flags.isV2('watchlist'), false) // off by override although in env
  assert.equal(flags.isV2('progress'), true) // no override: env decides
  assert.equal(flags.override('notes'), true)
  assert.equal(flags.override('progress'), null)
})

test('setOverride writes only the override, takes effect at once, and null clears it', () => {
  const storage = fakeStorage()
  const flags = createFlags({ env: 'progress', storage })
  assert.equal(flags.setOverride('tasks', true), true)
  assert.equal(flags.isV2('tasks'), true)
  assert.equal(flags.setOverride('progress', false), true)
  assert.equal(flags.isV2('progress'), false)
  assert.deepEqual(JSON.parse(storage.map.get(FLAGS_OVERRIDE_KEY)), { tasks: true, progress: false })
  flags.setOverride('progress', null)
  assert.equal(flags.isV2('progress'), true)
  assert.deepEqual(flags.envKeys(), ['progress'])
  assert.throws(() => flags.setOverride('bogus', true), TypeError)
  assert.throws(() => flags.setOverride('tasks', 'yes'), TypeError)
})

test('malformed or unreadable storage falls back to the env list', () => {
  const bad = fakeStorage({ [FLAGS_OVERRIDE_KEY]: '{not json' })
  assert.equal(createFlags({ env: 'notes', storage: bad }).isV2('notes'), true)
  const arr = fakeStorage({ [FLAGS_OVERRIDE_KEY]: '["notes"]' })
  assert.equal(createFlags({ env: '', storage: arr }).isV2('notes'), false)
  const throwing = { getItem() { throw new Error('blocked') }, setItem() { throw new Error('blocked') } }
  const flags = createFlags({ env: 'notes', storage: throwing })
  assert.equal(flags.isV2('notes'), true)
  assert.equal(flags.setOverride('tasks', true), false)
  assert.equal(flags.isV2('tasks'), false)
})

// ---- v1 blob mirror ------------------------------------------------------------

function mirrorSetup(opts = {}) {
  const base = setup(opts)
  const kvSupabase = makeFakeKvSupabase()
  const timers = makeTimers()
  const errors = []
  const mirror = createBlobMirror({
    engine: base.engine,
    db: base.db,
    cloudKv: createCloudKv(kvSupabase),
    getUserId: async () => 'u1',
    now: base.clock.now,
    onError: (e) => errors.push(e),
    ...timers,
  })
  return { ...base, kvSupabase, timers, errors, mirror }
}

test('every v2 save rewrites the local v1 shape {data, updatedAt}; kv_store follows after the debounce', async () => {
  const s = mirrorSetup()
  s.mirror.watch('tasks')
  s.clock.set(T0 + 1000)
  await s.engine.save('tasks', [task('a', 'one')])
  await flush()
  assert.deepEqual(await s.db.getItem('tasks'), { data: [task('a', 'one')], updatedAt: T0 + 1000 })
  assert.equal(s.kvSupabase.log.writes.length, 0) // debounced, not yet written
  assert.deepEqual(s.timers.delays(), [5000])

  s.clock.set(T0 + 2000)
  await s.engine.save('tasks', [task('a', 'one'), task('b', 'two')])
  await flush()
  assert.deepEqual(await s.db.getItem('tasks'), { data: [task('a', 'one'), task('b', 'two')], updatedAt: T0 + 2000 })
  assert.equal(s.timers.count, 1) // the second save re-armed the one timer

  await s.timers.fireAll()
  assert.equal(s.kvSupabase.log.writes.length, 1) // coalesced to the latest value
  assert.deepEqual(s.kvSupabase.rows.get('tasks'), {
    user_id: 'u1', key: 'tasks', value: [task('a', 'one'), task('b', 'two')], updated_at: new Date(T0 + 2000).toISOString(),
  })
  assert.deepEqual(s.mirror.pending(), [])
})

test('the mirrored v1 data equals the kv_store blob, so v1 sees nothing to reconcile', async () => {
  const s = mirrorSetup()
  s.mirror.watch('notes')
  await s.engine.save('notes', [{ id: 'n1', body: 'hi' }])
  await flush()
  await s.timers.fireAll()
  const local = await s.db.getItem('notes')
  const row = s.kvSupabase.rows.get('notes')
  assert.deepEqual(decideSync(local, { value: row.value, updated_at: row.updated_at }), { action: 'noop' })
})

test('flipping a key back to v1: writeNow + flush leave v1 with current data in both places', async () => {
  const s = mirrorSetup()
  s.mirror.watch('goals')
  await s.engine.save('goals', [{ id: 'g1', title: 'x' }])
  await flush()
  s.mirror.unwatch('goals') // flag flipped off: later saves are no longer mirrored
  s.clock.advance(10)
  await s.engine.save('goals', [{ id: 'g1', title: 'x' }, { id: 'g2', title: 'y' }])
  await flush()
  assert.equal((await s.db.getItem('goals')).data.length, 1) // stale until the explicit write

  await s.mirror.writeNow('goals')
  assert.deepEqual((await s.db.getItem('goals')).data.map((g) => g.id), ['g1', 'g2'])
  assert.deepEqual(s.kvSupabase.rows.get('goals').value.map((g) => g.id), ['g1', 'g2'])
  assert.deepEqual(await s.mirror.flush(), [])
})

test('mirror updatedAt is strictly increasing even when the clock does not move', async () => {
  const s = mirrorSetup()
  s.mirror.watch('tasks')
  await s.engine.save('tasks', [task('a', '1')])
  await flush()
  const first = (await s.db.getItem('tasks')).updatedAt
  await s.engine.save('tasks', [task('a', '2')])
  await flush()
  assert.ok((await s.db.getItem('tasks')).updatedAt > first)
})

test('a failed kv_store write keeps the key dirty, reports it and retries with backoff; the local shape is unaffected', async () => {
  const s = mirrorSetup()
  s.mirror.watch('tasks')
  await s.engine.save('tasks', [task('a', '1')])
  await flush()
  s.kvSupabase.log.failNext = 1
  await s.timers.fireAll()
  assert.equal(s.errors.length, 1)
  assert.equal(s.errors[0].op, 'kv')
  assert.match(s.errors[0].error.message, /JWT expired/)
  assert.deepEqual(s.mirror.pending(), ['tasks'])
  assert.deepEqual(s.timers.delays(), [10000]) // 5 s * 2^1
  assert.equal((await s.db.getItem('tasks')).data.length, 1)

  await s.timers.fireAll()
  assert.deepEqual(s.mirror.pending(), [])
  assert.equal(s.kvSupabase.rows.get('tasks').value.length, 1)
})

test('no signed-in user: the kv write waits, nothing throws into the engine', async () => {
  const base = setup()
  const kvSupabase = makeFakeKvSupabase()
  const timers = makeTimers()
  const errors = []
  let uid = null
  const mirror = createBlobMirror({
    engine: base.engine, db: base.db, cloudKv: createCloudKv(kvSupabase), getUserId: async () => uid,
    now: base.clock.now, onError: (e) => errors.push(e), ...timers,
  })
  mirror.watch('tasks')
  await base.engine.save('tasks', [task('a', '1')])
  await flush()
  await timers.fireAll()
  assert.equal(kvSupabase.log.writes.length, 0)
  assert.equal(errors[0].op, 'kv')
  uid = 'u1'
  assert.deepEqual(await mirror.flush(), [])
  assert.equal(kvSupabase.log.writes.length, 1)
})

test('a failing local write is reported and does not stop later mirrors', async () => {
  const s = mirrorSetup()
  s.mirror.watch('tasks')
  s.db.failOn('setItem', { key: 'tasks' })
  await s.engine.save('tasks', [task('a', '1')])
  await flush()
  assert.equal(s.errors[0].op, 'local')
  await s.engine.save('tasks', [task('a', '1'), task('b', '2')])
  await flush()
  assert.equal((await s.db.getItem('tasks')).data.length, 2)
})

test('stop() unsubscribes and cancels timers', async () => {
  const s = mirrorSetup()
  s.mirror.watch('tasks')
  await s.engine.save('tasks', [task('a', '1')])
  await flush()
  s.mirror.stop()
  assert.equal(s.timers.count, 0)
  await s.engine.save('tasks', [task('a', '2')])
  await flush()
  assert.equal((await s.db.getItem('tasks')).data[0].title, '1')
})

// ---- importBlob ------------------------------------------------------------------

const records = async (db, collection) => (await db.getItem(`r2:${collection}`))?.recs ?? {}

test('importBlob adds new records and updates changed ones', async () => {
  const s = setup()
  await s.engine.save('tasks', [task('a', 'old'), task('b', 'same')])
  const r = await s.migrator.importBlob('tasks', { data: [task('a', 'new'), task('b', 'same'), task('c', 'added')], updatedAt: T0 })
  assert.deepEqual(r, { key: 'tasks', added: 1, updated: 1 })
  assert.deepEqual(await s.engine.get('tasks', []), [task('a', 'new'), task('b', 'same'), task('c', 'added')])
})

test('importBlob never tombstones: records the blob omits survive, no deleted_at anywhere', async () => {
  const s = setup()
  await s.engine.save('tasks', [task('a', '1'), task('b', '2'), task('c', '3')])
  const r = await s.migrator.importBlob('tasks', { data: [task('c', '3 edited')], updatedAt: T0 })
  assert.equal(r.updated, 1)
  assert.deepEqual((await s.engine.get('tasks', [])).map((t) => t.id), ['a', 'b', 'c'])
  const recs = await records(s.db, 'tasks')
  assert.equal(Object.values(recs).filter((x) => x.d != null || x.b == null).length, 0)
  assert.equal(s.engine.outbox.snapshot().dirty.length, 3) // only the original three; nothing tombstoned

  // an empty blob is a no-op, not a "delete everything"
  assert.deepEqual(await s.migrator.importBlob('tasks', { data: [], updatedAt: T0 }), { key: 'tasks', added: 0, updated: 0 })
  assert.equal((await s.engine.get('tasks', [])).length, 3)
  assert.deepEqual(await s.migrator.importBlob('tasks', null), { key: 'tasks', added: 0, updated: 0 })
})

test('importBlob only marks the touched records dirty (nothing else is rewritten)', async () => {
  const s = setup()
  await s.engine.save('tasks', [task('a', '1'), task('b', '2')])
  const hlcA = (await records(s.db, 'tasks')).a.h
  await s.migrator.importBlob('tasks', { data: [task('b', '2 edited'), task('z', 'new')], updatedAt: T0 })
  const recs = await records(s.db, 'tasks')
  assert.equal(recs.a.h, hlcA) // untouched record keeps its stamp
  assert.ok(recs.b.h > hlcA && recs.z.h > hlcA)
  assert.deepEqual(s.engine.outbox.snapshot().dirty.map(([, id]) => id).sort(), ['a', 'b', 'z'])
})

test('importBlob is idempotent and accepts a bare legacy value', async () => {
  const s = setup()
  const blob = { data: [task('a', '1'), task('b', '2')], updatedAt: T0 }
  assert.deepEqual(await s.migrator.importBlob('tasks', blob), { key: 'tasks', added: 2, updated: 0 })
  assert.deepEqual(await s.migrator.importBlob('tasks', blob), { key: 'tasks', added: 0, updated: 0 })
  assert.deepEqual(await s.migrator.importBlob('tasks', [task('c', '3')]), { key: 'tasks', added: 1, updated: 0 })
  assert.equal((await s.engine.get('tasks', [])).length, 3)
})

test('importBlob into a map key and a doc key', async () => {
  const s = setup()
  await s.engine.save('progress', { p1: true, p2: false })
  const r = await s.migrator.importBlob('progress', { data: { p2: true, p3: 0 }, updatedAt: T0 })
  assert.deepEqual(r, { key: 'progress', added: 1, updated: 1 })
  assert.deepEqual(await s.engine.get('progress', {}), { p1: true, p2: true, p3: 0 })
  await s.migrator.importBlob('settings', { data: { theme: 'cream' }, updatedAt: T0 })
  assert.deepEqual(await s.engine.get('settings', {}), { theme: 'cream' })
})

test('importBlob on habits adds check-ins and never removes one', async () => {
  const s = setup()
  await s.engine.save('habits', [{ id: 'h1', name: 'Run', checkins: ['2026-01-01', '2026-01-02'] }])
  const r = await s.migrator.importBlob('habits', {
    data: [{ id: 'h1', name: 'Run', checkins: ['2026-01-02', '2026-01-03'] }, { id: 'h2', name: 'Read', checkins: ['2026-01-03'] }],
    updatedAt: T0,
  })
  assert.equal(r.added, 3) // h2, h1:2026-01-03, h2:2026-01-03
  const habits = await s.engine.get('habits', [])
  assert.deepEqual(habits.find((h) => h.id === 'h1').checkins.sort(), ['2026-01-01', '2026-01-02', '2026-01-03'])
  assert.deepEqual(habits.find((h) => h.id === 'h2').checkins, ['2026-01-03'])
})

test('importBlob never replaces a logged mood with a derived one', async () => {
  const s = setup()
  await s.engine.save('moodLog', [{ date: '2026-02-01', valence: 5, source: 'logged' }])
  const r = await s.migrator.importBlob('moodLog', {
    data: [{ date: '2026-02-01', valence: 2, source: 'derived' }, { date: '2026-02-02', valence: 3, source: 'derived' }],
    updatedAt: T0,
  })
  assert.deepEqual(r, { key: 'moodLog', added: 1, updated: 0 })
  assert.equal((await s.engine.get('moodLog', [])).find((m) => m.date === '2026-02-01').valence, 5)
})

test('importBlob keeps the local order and appends new records in blob order', async () => {
  const s = setup()
  await s.engine.save('tasks', [task('b', 'B'), task('a', 'A')])
  await s.migrator.importBlob('tasks', { data: [task('a', 'A'), task('x', 'X'), task('b', 'B'), task('y', 'Y')], updatedAt: T0 })
  assert.deepEqual((await s.engine.get('tasks', [])).map((t) => t.id), ['b', 'a', 'x', 'y'])
})

// ---- seedFromLocalBlob -------------------------------------------------------------

test('seed pushes records missing or newer in the cloud, hlc derived from blob.updatedAt', async () => {
  const s = setup()
  const updatedAt = T0 - 5 * DAY
  await s.client.push([
    wireRow('tasks', 'a', task('a', 'cloud-old'), updatedAt - DAY, 'phone001', 1000), // older, body differs -> push
    wireRow('tasks', 'b', task('b', 'same'), updatedAt - DAY, 'phone001', 2000), // older but equal body -> skip
    wireRow('tasks', 'e', task('e', 'cloud-new'), updatedAt + DAY, 'phone001', 4000), // newer in cloud -> skip
  ])
  const blob = {
    data: [task('a', 'local-edit'), task('b', 'same'), task('c', 'never-uploaded'), task('d', 'also'), task('e', 'stale-local')],
    updatedAt,
  }
  await s.db.setItem('tasks', blob)

  const r = await s.migrator.seedFromLocalBlob('tasks')
  assert.deepEqual(r, { key: 'tasks', pushed: 3, skipped: 2, total: 5 })

  const { rows } = await s.cloud.pull({ sinceRev: 0 })
  const byId = Object.fromEntries(rows.map((x) => [x.id, x]))
  const expectHlc = serialize({ ms: updatedAt, counter: 0, node: SEED_NODE })
  assert.equal(expectHlc, `${String(updatedAt).padStart(15, '0')}-0000-backfill`) // same shape forge_backfill() writes
  for (const id of ['a', 'c', 'd']) {
    assert.equal(byId[id].hlc, expectHlc)
    assert.equal(byId[id].deviceId, SEED_NODE)
  }
  assert.deepEqual(byId.a.body, task('a', 'local-edit'))
  assert.deepEqual(byId.c.body, task('c', 'never-uploaded'))
  assert.equal(byId.c.pos, 3000) // list position kept
  assert.deepEqual(byId.b.body, task('b', 'same'))
  assert.notEqual(byId.b.hlc, expectHlc)
  assert.deepEqual(byId.e.body, task('e', 'cloud-new'))
})

test('seed is idempotent: a second run pushes nothing', async () => {
  const s = setup()
  const blob = { data: [task('a', '1'), task('b', '2')], updatedAt: T0 - DAY }
  await s.db.setItem('tasks', blob)
  assert.equal((await s.migrator.seedFromLocalBlob('tasks')).pushed, 2)
  assert.deepEqual(await s.migrator.seedFromLocalBlob('tasks'), { key: 'tasks', pushed: 0, skipped: 2, total: 2 })
})

test('a seeded record loses to a real v2 edit made later', async () => {
  const s = setup()
  await s.migrator.seedFromLocalBlob('tasks', { blob: { data: [task('a', 'seeded')], updatedAt: T0 - 2 * DAY } })
  const { rows } = await s.cloud.pull({ sinceRev: 0 })
  await s.cloud.push([{ ...rows[0], body: task('a', 'v2 edit'), hlc: serialize({ ms: T0 - DAY, counter: 0, node: 'phone001' }), deviceId: 'phone001' }])
  const after = await s.migrator.seedFromLocalBlob('tasks', { blob: { data: [task('a', 'seeded')], updatedAt: T0 - 2 * DAY } })
  assert.equal(after.pushed, 0)
  const pulled = (await s.cloud.pull({ sinceRev: 0 })).rows
  assert.deepEqual(pulled.find((x) => x.id === 'a').body, task('a', 'v2 edit'))
})

test('seed does not undo a newer cloud tombstone, but resurrects over an older one', async () => {
  const s = setup()
  const updatedAt = T0 - 3 * DAY
  await s.client.push([
    wireRow('tasks', 'gone-new', null, updatedAt + DAY, 'phone001', null, true),
    wireRow('tasks', 'gone-old', null, updatedAt - DAY, 'phone001', null, true),
  ])
  const r = await s.migrator.seedFromLocalBlob('tasks', {
    blob: { data: [task('gone-new', 'x'), task('gone-old', 'y')], updatedAt },
  })
  assert.equal(r.pushed, 1)
  const rows = (await s.cloud.pull({ sinceRev: 0 })).rows
  assert.equal(rows.find((x) => x.id === 'gone-new').deletedAt != null, true)
  assert.deepEqual(rows.find((x) => x.id === 'gone-old').body, task('gone-old', 'y'))
})

test('seed clamps a wrong-clock blob (updatedAt more than 24 h ahead) to now, and treats a legacy blob as updatedAt 0', async () => {
  const s = setup()
  await s.migrator.seedFromLocalBlob('tasks', { blob: { data: [task('a', '1')], updatedAt: T0 + 30 * DAY } })
  await s.migrator.seedFromLocalBlob('notes', { blob: [{ id: 'n1', body: 'legacy' }] })
  const rows = (await s.cloud.pull({ sinceRev: 0 })).rows
  assert.equal(rows.find((x) => x.collection === 'tasks').hlc, serialize({ ms: T0, counter: 0, node: SEED_NODE }))
  assert.equal(rows.find((x) => x.collection === 'notes').hlc, serialize({ ms: 0, counter: 0, node: SEED_NODE }))
})

test('seed covers habits, check-ins included, and ignores other collections in the cloud', async () => {
  const s = setup()
  await s.client.push([wireRow('tasks', 'a', task('a', 'unrelated'), T0 - DAY)])
  const blob = { data: [{ id: 'h1', name: 'Run', checkins: ['2026-01-01', '2026-01-02'] }], updatedAt: T0 - DAY }
  const r = await s.migrator.seedFromLocalBlob('habits', { blob })
  assert.deepEqual(r, { key: 'habits', pushed: 3, skipped: 0, total: 3 })
  const rows = (await s.cloud.pull({ sinceRev: 0 })).rows
  assert.deepEqual(rows.filter((x) => x.collection === 'habitCheckins').map((x) => x.id).sort(), ['h1:2026-01-01', 'h1:2026-01-02'])
})

test('seed of a missing or empty local blob pushes nothing; seedAll shares one pull', async () => {
  const s = setup()
  assert.deepEqual(await s.migrator.seedFromLocalBlob('tasks'), { key: 'tasks', pushed: 0, skipped: 0, total: 0 })
  await s.db.setItem('tasks', { data: [task('a', '1')], updatedAt: T0 - DAY })
  await s.db.setItem('progress', { data: { p1: true }, updatedAt: T0 - DAY })
  const results = await s.migrator.seedAll(['tasks', 'progress', 'notes'])
  assert.deepEqual(results.map((r) => [r.key, r.pushed]), [['tasks', 1], ['progress', 1], ['notes', 0]])
})

test('seed without a cloud throws instead of silently doing nothing', async () => {
  const s = setup()
  const m = createMigrator({ engine: s.engine, db: s.db })
  await assert.rejects(m.seedFromLocalBlob('tasks'), TypeError)
})

// ---- verify --------------------------------------------------------------------------

test('verify deep-equals the materialised records against the blob', async () => {
  const s = setup()
  const data = [task('a', '1'), task('b', '2')]
  await s.engine.save('tasks', data)
  const ok = await s.migrator.verify('tasks', { blob: { data, updatedAt: T0 } })
  assert.deepEqual(ok, { key: 'tasks', ok: true, missing: [], extra: [], changed: [] })

  const bad = await s.migrator.verify('tasks', { blob: { data: [task('a', 'edited'), task('c', '3')], updatedAt: T0 } })
  assert.equal(bad.ok, false)
  assert.deepEqual(bad.changed, ['tasks/a'])
  assert.deepEqual(bad.missing, ['tasks/c'])
  assert.deepEqual(bad.extra, ['tasks/b'])
})

test('verify reads the local v1 shape by default and flags an order difference', async () => {
  const s = setup()
  await s.engine.save('tasks', [task('a', '1'), task('b', '2')])
  await s.db.setItem('tasks', { data: [task('b', '2'), task('a', '1')], updatedAt: T0 })
  const r = await s.migrator.verify('tasks')
  assert.equal(r.ok, false) // same records, different order
  assert.deepEqual([r.missing, r.extra, r.changed], [[], [], []])
  await s.db.setItem('tasks', { data: [task('a', '1'), task('b', '2')], updatedAt: T0 })
  assert.equal((await s.migrator.verify('tasks')).ok, true)
})

test('verify normalises the blob like the adapters: id-less items and repeated ids do not fail it', async () => {
  const s = setup()
  await s.engine.save('tasks', [task('a', '1')])
  const r = await s.migrator.verify('tasks', { blob: { data: [task('a', '1'), { title: 'no id' }, task('a', 'dup')], updatedAt: T0 } })
  assert.equal(r.ok, true)
})

test('verify of every shape: habits (check-ins), investProgress, settings, maps', async () => {
  const s = setup()
  const habits = [{ id: 'h1', name: 'Run', checkins: ['2026-01-01'] }]
  const invest = { done: { l1: true }, quiz: { l1: 3 }, tasks: {}, current: 'l2' }
  await s.engine.save('habits', habits)
  await s.engine.save('investProgress', invest)
  await s.engine.save('settings', { theme: 'cream' })
  await s.engine.save('progress', { a: false, b: 0 })
  for (const [key, data] of [['habits', habits], ['investProgress', invest], ['settings', { theme: 'cream' }], ['progress', { a: false, b: 0 }]]) {
    assert.equal((await s.migrator.verify(key, { blob: { data, updatedAt: T0 } })).ok, true, key)
  }
  assert.equal((await s.migrator.verify('progress', { blob: { data: { a: false, b: 1 }, updatedAt: T0 } })).ok, false)
})

test('verify with no blob at all expects an empty key', async () => {
  const s = setup()
  assert.equal((await s.migrator.verify('tasks')).ok, true)
  await s.engine.save('tasks', [task('a', '1')])
  const r = await s.migrator.verify('tasks')
  assert.equal(r.ok, false)
  assert.deepEqual(r.extra, ['tasks/a'])
})

test('end to end: seed a v1 blob, pull it into a fresh engine, verify ok', async () => {
  const s = setup()
  const data = [task('a', '1'), task('b', '2'), task('c', '3')]
  await s.db.setItem('tasks', { data, updatedAt: T0 - DAY })
  await s.migrator.seedFromLocalBlob('tasks')

  // a second device: pull the cloud records into its engine through importBlob-free path
  const dbB = createFakeDb()
  let n = 0
  const engineB = createEngine2({ db: dbB, bus: null, now: s.clock.now, random: () => 0, newId: () => `b${++n}`, cloud: s.cloud })
  const migB = createMigrator({ engine: engineB, db: dbB, cloud: s.cloud, now: s.clock.now })
  const { rows } = await s.cloud.pull({ sinceRev: 0 })
  await migB.importBlob('tasks', { data: rows.filter((r) => r.collection === 'tasks').sort((x, y) => x.pos - y.pos).map((r) => r.body), updatedAt: T0 })
  assert.equal((await migB.verify('tasks', { blob: { data, updatedAt: T0 - DAY } })).ok, true)
})

// ---- pre-cutover export (X1-07, reused) ------------------------------------------------

test('preCutoverBackup reuses the X1-07 export', async () => {
  const db = createFakeDb({
    notes: { data: [{ id: 'n1' }], updatedAt: 5 },
    tasks: [task('legacy', 'raw value written before sync existed')],
  })
  const { filename, json } = await preCutoverBackup({ db, now: () => T0 })
  assert.equal(filename, `forge-backup-pre-v2-${new Date(T0).toISOString().slice(0, 10)}.json`)
  const file = JSON.parse(json)
  assert.equal(file.format, 'forge-backup')
  assert.equal(file.version, 1)
  assert.deepEqual(file.keys.notes, { data: [{ id: 'n1' }], updatedAt: 5 })
  assert.deepEqual(file.keys.tasks, { data: [task('legacy', 'raw value written before sync existed')], updatedAt: 0 })
})
