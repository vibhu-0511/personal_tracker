import test from 'node:test'
import assert from 'node:assert/strict'
import { serialize } from '../src/sync/hlc.js'
import { createCloudV2, fromWireRow, toWireRow, PUSH_BATCH_SIZE, PULL_PAGE_SIZE } from '../src/sync/cloudV2.js'
import { createFakeCloudV2 } from './helpers/fakeCloudV2.js'

const T0 = 1_700_000_000_000
const stamp = (ms, counter = 0) => serialize({ ms, counter, node: 'devaaaaa' })

// A supabase-js shaped client (rpc, from().select().gt().order().limit(),
// channel().on().subscribe(), removeChannel) backed by the in-memory v2 fake.
// Like supabase-js it resolves { data, error } instead of throwing.
function makeFakeSupabase(cloud) {
  const log = { rpc: [], queries: [], channels: [], removed: [] }
  const fail = (e) => ({ data: null, error: { message: e.message, code: e.code }, status: e.status ?? 400 })
  return {
    log,
    auth: { getSession: () => cloud.getSession() },
    async rpc(fn, args) {
      log.rpc.push({ fn, args: JSON.parse(JSON.stringify(args)) })
      try { return { data: await cloud.push(args.rows), error: null, status: 200 } } catch (e) { return fail(e) }
    },
    from(table) {
      const q = { table, filters: [], order: null, limit: null }
      log.queries.push(q)
      const b = {
        select(cols) { q.select = cols; return b },
        gt(col, v) { q.filters.push(['gt', col, v]); return b },
        order(col, opts) { q.order = [col, opts]; return b },
        limit(n) { q.limit = n; return b },
        then(res, rej) {
          return (async () => {
            const since = q.filters.find((f) => f[1] === 'rev')?.[2] ?? 0
            try { return { data: await cloud.pull({ sinceRev: since, limit: q.limit }), error: null, status: 200 } } catch (e) { return fail(e) }
          })().then(res, rej)
        },
      }
      return b
    },
    channel(name) {
      const ch = { name, bindings: [], subscribeCalls: 0 }
      log.channels.push(ch)
      ch.on = (type, filter, cb) => { ch.bindings.push({ type, filter, cb }); return ch }
      ch.subscribe = (statusCb) => {
        ch.subscribeCalls++
        const sub = cloud.subscribe((evt) => ch.bindings[0].cb(evt), { onStatus: (s) => statusCb(s) })
        ch.unsub = () => sub.unsubscribe()
        return ch
      }
      return ch
    },
    removeChannel(ch) { log.removed.push(ch.name); ch.unsub?.(); return Promise.resolve('ok') },
  }
}

function setup() {
  const clock = { ms: T0 }
  const cloud = createFakeCloudV2({ userId: 'u1', now: () => clock.ms })
  const supabase = makeFakeSupabase(cloud)
  return { cloud, supabase, v2: createCloudV2(supabase), clock }
}

const rec = (id, n = 0, extra = {}) => ({
  collection: 'tasks', id, body: { title: id }, pos: 1000, hlc: stamp(T0, n), deviceId: 'devaaaaa', deletedAt: null, ...extra,
})

test('wire mapping: camelCase record <-> snake_case row', () => {
  const r = rec('t1')
  assert.deepEqual(toWireRow(r), {
    collection: 'tasks', id: 't1', body: { title: 't1' }, pos: 1000, hlc: stamp(T0), device_id: 'devaaaaa', deleted_at: null,
  })
  const back = fromWireRow({ user_id: 'u1', ...toWireRow(r), rev: '7', server_at: 'x' })
  assert.equal(back.deviceId, 'devaaaaa')
  assert.equal(back.deletedAt, null)
  assert.equal(back.rev, 7)
  assert.equal(back.userId, 'u1')
})

test('push calls rpc forge_push with { rows } and returns applied rows', async () => {
  const { v2, supabase, cloud } = setup()
  const out = await v2.push([rec('t1', 1), rec('t2', 2)])
  assert.equal(supabase.log.rpc.length, 1)
  assert.equal(supabase.log.rpc[0].fn, 'forge_push')
  assert.deepEqual(Object.keys(supabase.log.rpc[0].args), ['rows'])
  assert.equal(supabase.log.rpc[0].args.rows[0].device_id, 'devaaaaa')
  assert.deepEqual(out.map((o) => [o.collection, o.id]), [['tasks', 't1'], ['tasks', 't2']])
  assert.equal(out[0].rev, cloud.getRow('u1', 'tasks', 't1').rev)
})

test('push with no records makes no call', async () => {
  const { v2, supabase } = setup()
  assert.deepEqual(await v2.push([]), [])
  assert.equal(supabase.log.rpc.length, 0)
})

test('push batches at most 200 rows per rpc call', async () => {
  assert.equal(PUSH_BATCH_SIZE, 200)
  const { v2, supabase, cloud } = setup()
  const recs = Array.from({ length: 450 }, (_, i) => rec(`t${String(i).padStart(3, '0')}`, i))
  const out = await v2.push(recs)
  assert.deepEqual(supabase.log.rpc.map((c) => c.args.rows.length), [200, 200, 50])
  assert.equal(out.length, 450)
  assert.equal(cloud.allRows().length, 450)
})

test('push throws on {error} with status and code, and stops at the failed batch', async () => {
  const { v2, supabase, cloud } = setup()
  cloud.inject('503', { times: 1 })
  await assert.rejects(() => v2.push([rec('a', 1)]), (e) => e instanceof Error && e.status === 503 && /Unavailable/.test(e.message))

  cloud.inject('constraint', { times: 1 })
  await assert.rejects(() => v2.push([rec('b', 2)]), (e) => e.code === '23514')

  const before = supabase.log.rpc.length
  cloud.inject('503', { times: Infinity })
  await assert.rejects(() => v2.push(Array.from({ length: 450 }, (_, i) => rec(`x${i}`, i))))
  assert.equal(supabase.log.rpc.length, before + 1) // first batch failed, no further batches
})

test('push is idempotent: replaying the same records applies nothing', async () => {
  const { v2 } = setup()
  const recs = [rec('t1', 1)]
  assert.equal((await v2.push(recs)).length, 1)
  assert.equal((await v2.push(recs)).length, 0)
})

test('pull pages 1000 rows ordered by rev and maps to camelCase', async () => {
  assert.equal(PULL_PAGE_SIZE, 1000)
  const { v2, supabase, cloud } = setup()
  const recs = Array.from({ length: 2500 }, (_, i) => rec(`t${String(i).padStart(4, '0')}`, i))
  for (let i = 0; i < recs.length; i += 200) await v2.push(recs.slice(i, i + 200))
  const { rows, cursor } = await v2.pull({ sinceRev: 0 })
  assert.equal(rows.length, 2500)
  assert.equal(cursor, cloud.lastRev)
  assert.ok(rows.every((r, i) => i === 0 || r.rev > rows[i - 1].rev))
  assert.equal(rows[0].deviceId, 'devaaaaa')
  const qs = supabase.log.queries
  assert.equal(qs.length, 3) // 1000 + 1000 + 500
  assert.ok(qs.every((q) => q.table === 'records' && q.limit === 1000 && q.order[0] === 'rev' && q.order[1].ascending === true))
  assert.deepEqual(qs.map((q) => q.filters[0][2]), [0, rows[999].rev, rows[1999].rev])
})

test('pull does an extra empty-page fetch only when the last page is full', async () => {
  const { v2, supabase } = setup()
  const recs = Array.from({ length: 1000 }, (_, i) => rec(`t${String(i).padStart(4, '0')}`, i))
  for (let i = 0; i < recs.length; i += 200) await v2.push(recs.slice(i, i + 200))
  const { rows } = await v2.pull()
  assert.equal(rows.length, 1000)
  assert.equal(supabase.log.queries.length, 2)
})

test('pull is a delta: only rows after sinceRev, tombstones included; empty keeps the cursor', async () => {
  const { v2 } = setup()
  await v2.push([rec('t1', 1), rec('t2', 2)])
  const first = await v2.pull()
  await v2.push([rec('t1', 3, { body: null, deletedAt: new Date(T0).toISOString() })])
  const delta = await v2.pull({ sinceRev: first.cursor })
  assert.equal(delta.rows.length, 1)
  assert.equal(delta.rows[0].id, 't1')
  assert.equal(delta.rows[0].body, null)
  assert.ok(delta.rows[0].deletedAt)
  const none = await v2.pull({ sinceRev: delta.cursor })
  assert.deepEqual(none, { rows: [], cursor: delta.cursor })
})

test('pull throws on {error}', async () => {
  const { v2, cloud } = setup()
  cloud.inject('503', { ops: ['pull'] })
  await assert.rejects(() => v2.pull(), (e) => e.status === 503)
  cloud.inject('401', { ops: ['pull'] })
  await assert.rejects(() => v2.pull(), (e) => e.status === 401)
})

test('subscribe uses one channel with filter user_id=eq.<uid>, event * and delivers camelCase records', async () => {
  const { v2, supabase, cloud } = setup()
  const events = []
  const statuses = []
  const sub = v2.subscribe('u1', (e) => events.push(e), { onStatus: (s) => statuses.push(s) })
  assert.equal(supabase.log.channels.length, 1)
  const ch = supabase.log.channels[0]
  assert.equal(ch.bindings.length, 1)
  assert.deepEqual(ch.bindings[0].filter, { event: '*', schema: 'public', table: 'records', filter: 'user_id=eq.u1' })
  assert.equal(ch.bindings[0].type, 'postgres_changes')
  assert.equal(ch.subscribeCalls, 1)
  assert.deepEqual(statuses, ['SUBSCRIBED'])

  await v2.push([rec('t1', 1)])
  await v2.push([rec('t1', 2, { body: { title: 'x' } })])
  assert.deepEqual(events.map((e) => e.eventType), ['INSERT', 'UPDATE'])
  assert.equal(events[0].record.deviceId, 'devaaaaa')
  assert.equal(events[1].record.body.title, 'x')
  assert.deepEqual(events[1].old, { user_id: 'u1', collection: 'tasks', id: 't1' })

  sub.unsubscribe()
  assert.deepEqual(supabase.log.removed, ['records:u1'])
  await v2.push([rec('t2', 3)])
  assert.equal(events.length, 2)
  assert.equal(cloud.subscriberCount, 0)
})

test('subscribe ignores another user and requires a userId', async () => {
  const { v2, cloud } = setup()
  const events = []
  v2.subscribe('u1', (e) => events.push(e))
  const other = cloud.fork({ userId: 'u2' })
  await other.push([{ collection: 'tasks', id: 'o1', body: {}, pos: null, hlc: stamp(T0), device_id: 'd', deleted_at: null }])
  assert.equal(events.length, 0)
  assert.throws(() => v2.subscribe('', () => {}), /userId/)
})

test('subscribe reports SUBSCRIBED after reconnect so the engine can delta-pull', async () => {
  const { v2, cloud } = setup()
  const events = []
  const statuses = []
  const seen = { cursor: 0 }
  const sub = v2.subscribe('u1', (e) => events.push(e), {
    onStatus: (s) => {
      statuses.push(s)
      if (s === 'SUBSCRIBED') seen.pullWanted = (seen.pullWanted ?? 0) + 1
    },
  })
  await v2.push([rec('t1', 1)])
  seen.cursor = (await v2.pull()).cursor

  const phone = cloud.fork()
  cloud.setRealtimeUp(false)
  await phone.push([{ collection: 'tasks', id: 'missed', body: { a: 1 }, pos: null, hlc: stamp(T0, 9), device_id: 'phone', deleted_at: null }])
  assert.equal(events.length, 1) // the event during the outage is lost
  cloud.setRealtimeUp(true)
  assert.deepEqual(statuses, ['SUBSCRIBED', 'CHANNEL_ERROR', 'SUBSCRIBED'])
  assert.equal(seen.pullWanted, 2)

  const { rows } = await v2.pull({ sinceRev: seen.cursor })
  assert.deepEqual(rows.map((r) => r.id), ['missed'])
  sub.unsubscribe()
})

test('createCloudV2 requires a client and exposes getSession', async () => {
  assert.throws(() => createCloudV2(null), /supabase client/)
  const { v2 } = setup()
  const { data } = await v2.getSession()
  assert.equal(data.session.user.id, 'u1')
})
