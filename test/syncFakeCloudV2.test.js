import test from 'node:test'
import assert from 'node:assert/strict'
import { serialize } from '../src/sync/hlc.js'
import { createFakeCloudV2, MAX_PUSH_ROWS } from './helpers/fakeCloudV2.js'
import { createFakeDb, makeFakeDb } from './helpers/fakeDb.js'

const T0 = 1_700_000_000_000
const HOUR = 3600 * 1000
const DAY = 24 * HOUR

const stamp = (ms, counter = 0, node = 'devaaaaa') => serialize({ ms, counter, node })

function setup(opts = {}) {
  const clock = { ms: T0 }
  const cloud = createFakeCloudV2({ userId: 'u1', now: () => clock.ms, ...opts })
  return { cloud, clock }
}

// A live record as the client sends it to forge_push.
const live = (id, hlc, body = { title: id }, extra = {}) => ({
  collection: 'tasks', id, body, pos: 1000, hlc, device_id: 'devaaaaa', deleted_at: null, ...extra,
})
const dead = (id, hlc) => ({
  collection: 'tasks', id, body: null, pos: null, hlc, device_id: 'devaaaaa', deleted_at: new Date(T0).toISOString(),
})

// ---- the validated SQL vectors (R6-report.md: fresh, newer, replay, stale, tombstone, drift, rev, isolation) ----

test('fresh row applies and returns its collection, id and rev', async () => {
  const { cloud } = setup()
  const out = await cloud.push([live('t1', stamp(T0))])
  assert.equal(out.length, 1)
  assert.equal(out[0].out_collection, 'tasks')
  assert.equal(out[0].out_id, 't1')
  assert.equal(typeof out[0].out_rev, 'number')
  const row = cloud.getRow('u1', 'tasks', 't1')
  assert.deepEqual(row.body, { title: 't1' })
  assert.equal(row.user_id, 'u1')
  assert.equal(row.rev, out[0].out_rev)
})

test('newer edit applies and replaces the stored row', async () => {
  const { cloud } = setup()
  await cloud.push([live('t1', stamp(T0), { title: 'old' })])
  const out = await cloud.push([live('t1', stamp(T0 + 1), { title: 'new' })])
  assert.equal(out.length, 1)
  assert.equal(cloud.getRow('u1', 'tasks', 't1').body.title, 'new')
  assert.equal(cloud.allRows().length, 1)
})

test('replay of the same op returns zero rows and changes nothing', async () => {
  const { cloud } = setup()
  const op = live('t1', stamp(T0))
  await cloud.push([op])
  const before = cloud.getRow('u1', 'tasks', 't1')
  assert.deepEqual(await cloud.push([op]), [])
  assert.deepEqual(cloud.getRow('u1', 'tasks', 't1'), before, 'rev must not move on a replay')
})

test('stale hlc returns zero rows and the newer edit survives', async () => {
  const { cloud } = setup()
  await cloud.push([live('t1', stamp(T0 + 5), { title: 'newer' })])
  assert.deepEqual(await cloud.push([live('t1', stamp(T0 + 4), { title: 'stale' })]), [])
  // same ms, lower counter is also stale
  await cloud.push([live('t2', stamp(T0, 3))])
  assert.deepEqual(await cloud.push([live('t2', stamp(T0, 2), { title: 'stale' })]), [])
  assert.equal(cloud.getRow('u1', 'tasks', 't1').body.title, 'newer')
})

test('equal ms and counter is decided by node id (total order)', async () => {
  const { cloud } = setup()
  await cloud.push([live('t1', stamp(T0, 0, 'devbbbbb'), { title: 'b' })])
  assert.deepEqual(await cloud.push([live('t1', stamp(T0, 0, 'devaaaaa'), { title: 'a' })]), [])
  assert.equal((await cloud.push([live('t1', stamp(T0, 0, 'devccccc'), { title: 'c' })])).length, 1)
})

test('tombstone with a newer hlc applies; an older edit cannot resurrect it', async () => {
  const { cloud } = setup()
  await cloud.push([live('t1', stamp(T0))])
  const out = await cloud.push([dead('t1', stamp(T0 + 10))])
  assert.equal(out.length, 1)
  const row = cloud.getRow('u1', 'tasks', 't1')
  assert.equal(row.body, null)
  assert.ok(row.deleted_at)
  assert.deepEqual(await cloud.push([live('t1', stamp(T0 + 5), { title: 'late edit' })]), [])
  assert.equal(cloud.getRow('u1', 'tasks', 't1').body, null)
})

test('re-adding a tombstoned id with a newer hlc resurrects it (undo)', async () => {
  const { cloud } = setup()
  await cloud.push([live('t1', stamp(T0))])
  await cloud.push([dead('t1', stamp(T0 + 10))])
  assert.equal((await cloud.push([live('t1', stamp(T0 + 20), { title: 'back' })])).length, 1)
  const row = cloud.getRow('u1', 'tasks', 't1')
  assert.equal(row.body.title, 'back')
  assert.equal(row.deleted_at, null)
})

test('year-2100 hlc is rejected without an error and stores nothing', async () => {
  const { cloud } = setup()
  const y2100 = Date.UTC(2100, 0, 1)
  assert.deepEqual(await cloud.push([live('t1', stamp(y2100))]), [])
  assert.equal(cloud.allRows().length, 0)
  // a drifted row does not poison a batch: its neighbours still apply
  const out = await cloud.push([live('t2', stamp(y2100)), live('t3', stamp(T0))])
  assert.deepEqual(out.map((r) => r.out_id), ['t3'])
})

test('drift guard boundary: now+24h is accepted, now+24h+1ms is not', async () => {
  const { cloud } = setup()
  assert.equal((await cloud.push([live('ok', stamp(T0 + DAY))])).length, 1)
  assert.equal((await cloud.push([live('bad', stamp(T0 + DAY + 1))])).length, 0)
})

test('rev strictly increases on every applied write, updates and tombstones included', async () => {
  const { cloud } = setup()
  const revs = []
  const take = (out) => { assert.equal(out.length, 1); revs.push(out[0].out_rev) }
  take(await cloud.push([live('t1', stamp(T0, 0))]))      // insert
  take(await cloud.push([live('t1', stamp(T0, 1))]))      // update
  take(await cloud.push([live('t2', stamp(T0, 2))]))      // another insert
  take(await cloud.push([dead('t1', stamp(T0, 3))]))      // tombstone update
  take(await cloud.push([live('t1', stamp(T0, 4))]))      // resurrect
  for (let i = 1; i < revs.length; i++) assert.ok(revs[i] > revs[i - 1], `rev ${revs[i]} > ${revs[i - 1]}`)
  assert.equal(cloud.getRow('u1', 'tasks', 't1').rev, revs[4])
  assert.equal(cloud.lastRev, revs[4])
})

test('rev moves within a batch and not at all for a skipped row', async () => {
  const { cloud } = setup()
  await cloud.push([live('a', stamp(T0, 5))])
  const before = cloud.lastRev
  const out = await cloud.push([live('a', stamp(T0, 1)), live('b', stamp(T0, 1)), live('c', stamp(T0, 1))])
  assert.deepEqual(out.map((r) => r.out_id), ['b', 'c'])
  assert.ok(out[0].out_rev > before && out[1].out_rev > out[0].out_rev)
})

test('a second user sees zero rows and has an independent namespace', async () => {
  const { cloud } = setup()
  const bob = cloud.fork({ userId: 'u2' })
  await cloud.push([live('t1', stamp(T0, 5), { title: 'alice' })])
  assert.deepEqual(await bob.pull({ sinceRev: 0 }), [])
  // bob pushing the same key with an OLDER hlc still inserts: it is bob's own row
  assert.equal((await bob.push([live('t1', stamp(T0, 1), { title: 'bob' })])).length, 1)
  assert.equal(cloud.getRow('u1', 'tasks', 't1').body.title, 'alice')
  assert.equal(cloud.getRow('u2', 'tasks', 't1').body.title, 'bob')
  assert.equal((await cloud.pull()).length, 1)
  assert.equal((await bob.pull()).length, 1)
})

// ---- constraints and batch semantics ----

test('check constraints reject the whole batch atomically', async () => {
  const bad = {
    collection: [live('x', stamp(T0), { a: 1 }, { collection: '1bad' }), 'records_collection_chk'],
    id: [live('', stamp(T0)), 'records_id_chk'],
    longId: [live('x'.repeat(201), stamp(T0)), 'records_id_chk'],
    hlc: [live('x', '000000000000001-ZZZZ-dev'), 'records_hlc_chk'],
    bodySize: [live('x', stamp(T0), { blob: 'z'.repeat(262144) }), 'records_body_size_chk'],
    tombstoneNoDeletedAt: [{ ...dead('x', stamp(T0)), deleted_at: null }, 'records_tombstone_chk'],
    liveWithDeletedAt: [live('x', stamp(T0), { a: 1 }, { deleted_at: new Date(T0).toISOString() }), 'records_tombstone_chk'],
  }
  for (const [name, [row, constraint]] of Object.entries(bad)) {
    const { cloud } = setup()
    await assert.rejects(cloud.push([live('good', stamp(T0)), row]), (e) => {
      assert.equal(e.code, '23514', name)
      assert.match(e.message, new RegExp(constraint), name)
      return true
    })
    assert.equal(cloud.allRows().length, 0, `${name}: the good row in the batch must not be applied`)
  }
})

test('not-null columns and unparseable hlc prefix error out', async () => {
  const { cloud } = setup()
  await assert.rejects(cloud.push([{ ...live('x', stamp(T0)), device_id: null }]), { code: '23502' })
  await assert.rejects(cloud.push([{ ...live('x', stamp(T0)), id: null }]), { code: '23502' })
  await assert.rejects(cloud.push([live('x', 'not-a-number-hlc')]), { code: '22P02' })
  assert.equal(cloud.allRows().length, 0)
})

test('a row with a null hlc is silently dropped, like the SQL WHERE', async () => {
  const { cloud } = setup()
  assert.deepEqual(await cloud.push([{ ...live('x', stamp(T0)), hlc: null }]), [])
})

test('more than 500 rows drops the whole batch; exactly 500 applies', async () => {
  const { cloud } = setup()
  const mk = (n) => Array.from({ length: n }, (_, i) => live(`r${i}`, stamp(T0)))
  assert.deepEqual(await cloud.push(mk(MAX_PUSH_ROWS + 1)), [])
  assert.equal(cloud.allRows().length, 0)
  assert.equal((await cloud.push(mk(MAX_PUSH_ROWS))).length, MAX_PUSH_ROWS)
})

test('update overwrites pos and body with the incoming values, including null pos', async () => {
  const { cloud } = setup()
  await cloud.push([live('t1', stamp(T0), { v: 1 }, { pos: 5000 })])
  await cloud.push([live('t1', stamp(T0 + 1), { v: 2 }, { pos: null })])
  const row = cloud.getRow('u1', 'tasks', 't1')
  assert.equal(row.pos, null)
  assert.equal(row.body.v, 2)
})

test('flat-map bodies may be bare booleans and numbers', async () => {
  const { cloud } = setup()
  await cloud.push([
    { collection: 'puzzleProgress', id: 'p1', body: false, pos: null, hlc: stamp(T0), device_id: 'devaaaaa', deleted_at: null },
    { collection: 'budgets', id: 'food', body: 0, pos: null, hlc: stamp(T0), device_id: 'devaaaaa', deleted_at: null },
  ])
  assert.equal(cloud.getRow('u1', 'puzzleProgress', 'p1').body, false)
  assert.equal(cloud.getRow('u1', 'budgets', 'food').body, 0)
})

test('stored rows are copies: mutating the pushed body or a pulled row changes nothing', async () => {
  const { cloud } = setup()
  const body = { title: 'a' }
  await cloud.push([live('t1', stamp(T0), body)])
  body.title = 'mutated'
  const [pulled] = await cloud.pull()
  pulled.body.title = 'mutated too'
  assert.equal(cloud.getRow('u1', 'tasks', 't1').body.title, 'a')
})

// ---- delta pull by rev ----

test('delta pull returns only rows past the cursor, ascending, including tombstones', async () => {
  const { cloud } = setup()
  await cloud.push([live('a', stamp(T0, 0)), live('b', stamp(T0, 0))])
  const first = await cloud.pull({ sinceRev: 0 })
  assert.deepEqual(first.map((r) => r.id), ['a', 'b'])
  const cursor = first[first.length - 1].rev
  assert.deepEqual(await cloud.pull({ sinceRev: cursor }), [])

  await cloud.push([live('a', stamp(T0, 1), { title: 'edited' }), dead('b', stamp(T0, 1)), live('c', stamp(T0, 1))])
  const delta = await cloud.pull({ sinceRev: cursor })
  assert.deepEqual(delta.map((r) => r.id), ['a', 'b', 'c'])
  assert.ok(delta.every((r, i) => i === 0 || r.rev > delta[i - 1].rev))
  assert.equal(delta[1].body, null)
  assert.ok(delta[1].deleted_at)
})

test('a row updated after the cursor moves past it (the point of the rev trigger)', async () => {
  const { cloud } = setup()
  await cloud.push([live('a', stamp(T0, 0))])
  const cursor = cloud.lastRev
  await cloud.push([live('a', stamp(T0, 1), { title: 'v2' })])
  const delta = await cloud.pull({ sinceRev: cursor })
  assert.equal(delta.length, 1)
  assert.equal(delta[0].body.title, 'v2')
})

test('pull pages with limit and the last rev of a page is the next cursor', async () => {
  const { cloud } = setup()
  await cloud.push(Array.from({ length: 5 }, (_, i) => live(`r${i}`, stamp(T0))))
  const seen = []
  let cursor = 0
  for (;;) {
    const page = await cloud.pull({ sinceRev: cursor, limit: 2 })
    if (!page.length) break
    seen.push(...page.map((r) => r.id))
    cursor = page[page.length - 1].rev
  }
  assert.deepEqual(seen, ['r0', 'r1', 'r2', 'r3', 'r4'])
})

test('pull rows carry the full wire shape', async () => {
  const { cloud, clock } = setup()
  await cloud.push([live('t1', stamp(T0), { a: 1 }, { pos: 2500 })])
  const [row] = await cloud.pull()
  assert.deepEqual(Object.keys(row).sort(),
    ['body', 'collection', 'deleted_at', 'device_id', 'hlc', 'id', 'pos', 'rev', 'server_at', 'user_id'])
  assert.equal(row.server_at, new Date(clock.ms).toISOString())
})

// ---- failure injection ----

test('offline injection rejects with a status-0 network error and applies nothing', async () => {
  const { cloud } = setup()
  cloud.inject('offline')
  await assert.rejects(cloud.push([live('t1', stamp(T0))]), (e) => e.status === 0 && /Failed to fetch/.test(e.message))
  assert.equal(cloud.allRows().length, 0)
  // one-shot: the next call works
  assert.equal((await cloud.push([live('t1', stamp(T0))])).length, 1)
})

test('503 injection counts down and then clears', async () => {
  const { cloud } = setup()
  cloud.inject('503', { times: 2 })
  await assert.rejects(cloud.push([live('t1', stamp(T0))]), { status: 503 })
  await assert.rejects(cloud.pull(), { status: 503 })
  assert.equal((await cloud.push([live('t1', stamp(T0))])).length, 1)
  assert.equal(cloud.calls.push, 2)
  assert.equal(cloud.calls.pull, 1)
})

test('401 injection simulates an expired token, and a missing session is a 401 too', async () => {
  const { cloud } = setup()
  cloud.inject('401', { ops: ['push'] })
  await assert.rejects(cloud.push([live('t1', stamp(T0))]), { status: 401 })
  assert.equal((await cloud.push([live('t1', stamp(T0))])).length, 1)

  cloud.setSessionUserId(null)
  assert.equal((await cloud.getSession()).data.session, null)
  await assert.rejects(cloud.push([live('t2', stamp(T0))]), { status: 401 })
  await assert.rejects(cloud.pull(), { status: 401 })
  cloud.setSessionUserId('u1')
  assert.equal((await cloud.push([live('t2', stamp(T0))])).length, 1)
})

test('constraint injection rejects the whole batch with 23514; match targets one poison row', async () => {
  const { cloud } = setup()
  cloud.inject('constraint', { times: Infinity, match: (r) => r.id === 'poison' })
  const batch = [live('a', stamp(T0)), live('poison', stamp(T0)), live('b', stamp(T0))]
  await assert.rejects(cloud.push(batch), { code: '23514', status: 400 })
  assert.equal(cloud.allRows().length, 0, 'atomic: nothing applied')
  // bisecting the batch isolates the bad record
  assert.equal((await cloud.push([batch[0]])).length, 1)
  await assert.rejects(cloud.push([batch[1]]), { code: '23514' })
  assert.equal((await cloud.push([batch[2]])).length, 1)
  cloud.clearFailures()
  assert.equal((await cloud.push([batch[1]])).length, 1)
})

test('constraint injection never fires on pull', async () => {
  const { cloud } = setup()
  cloud.inject('constraint', { ops: ['push', 'pull'] })
  assert.deepEqual(await cloud.pull(), [])
})

test('persistent setOffline fails push and pull until restored', async () => {
  const { cloud } = setup()
  cloud.setOffline(true)
  await assert.rejects(cloud.push([live('t1', stamp(T0))]), { status: 0 })
  await assert.rejects(cloud.pull(), { status: 0 })
  assert.equal(cloud.allRows().length, 0)
  cloud.setOffline(false)
  assert.equal((await cloud.push([live('t1', stamp(T0))])).length, 1)
})

test('ackLost: the write is committed but the call rejects, and replay is a no-op', async () => {
  const { cloud } = setup()
  cloud.inject('503', { ackLost: true })
  const op = live('t1', stamp(T0))
  await assert.rejects(cloud.push([op]), { status: 503 })
  assert.equal(cloud.allRows().length, 1, 'committed despite the error')
  const rev = cloud.getRow('u1', 'tasks', 't1').rev
  assert.deepEqual(await cloud.push([op]), [], 'the client retry changes nothing')
  assert.equal(cloud.getRow('u1', 'tasks', 't1').rev, rev)
  assert.throws(() => cloud.inject('constraint', { ackLost: true }), /ackLost/)
})

test('the push log records every attempted batch, failed ones included', async () => {
  const { cloud } = setup()
  cloud.inject('offline')
  await assert.rejects(cloud.push([live('a', stamp(T0))]))
  await cloud.push([live('a', stamp(T0)), live('b', stamp(T0))])
  assert.deepEqual(cloud.pushed.map((b) => b.length), [1, 2])
})

test('failure state is per device: one phone offline, the laptop online', async () => {
  const { cloud } = setup()
  const phone = cloud.fork()
  phone.setOffline(true)
  await assert.rejects(phone.push([live('p', stamp(T0))]), { status: 0 })
  assert.equal((await cloud.push([live('l', stamp(T0))])).length, 1)
  phone.setOffline(false)
  const seen = await phone.pull()
  assert.deepEqual(seen.map((r) => r.id), ['l'], 'same user, same server')
})

// ---- realtime emitter ----

test('realtime emits INSERT then UPDATE (tombstones are UPDATEs) to the owner only', async () => {
  const { cloud } = setup()
  const bob = cloud.fork({ userId: 'u2' })
  const events = []
  const bobEvents = []
  cloud.subscribe((e) => events.push(e))
  bob.subscribe((e) => bobEvents.push(e))

  await cloud.push([live('t1', stamp(T0, 0))])
  await cloud.push([live('t1', stamp(T0, 1), { title: 'v2' })])
  await cloud.push([dead('t1', stamp(T0, 2))])
  await cloud.push([live('t1', stamp(T0, 0))]) // stale: no event

  assert.deepEqual(events.map((e) => e.eventType), ['INSERT', 'UPDATE', 'UPDATE'])
  assert.equal(events[0].table, 'records')
  assert.equal(events[0].new.user_id, 'u1')
  assert.deepEqual(events[1].old, { user_id: 'u1', collection: 'tasks', id: 't1' })
  assert.equal(events[2].new.body, null)
  assert.ok(events[2].new.deleted_at)
  assert.ok(events[1].new.rev > events[0].new.rev)
  assert.deepEqual(bobEvents, [])
})

test('realtime delivers a change made by another device of the same user, and echoes own writes', async () => {
  const { cloud } = setup()
  const phone = cloud.fork()
  const got = []
  cloud.subscribe((e) => got.push(e.new.id))
  await phone.push([live('from-phone', stamp(T0))])
  await cloud.push([live('own', stamp(T0))])
  assert.deepEqual(got, ['from-phone', 'own'])
})

test('realtime events carry copies, and a throwing listener does not break the push', async () => {
  const { cloud } = setup()
  cloud.subscribe((e) => { e.new.body.title = 'tampered'; throw new Error('listener bug') })
  await cloud.push([live('t1', stamp(T0))])
  assert.equal(cloud.getRow('u1', 'tasks', 't1').body.title, 't1')
})

test('unsubscribe stops delivery', async () => {
  const { cloud } = setup()
  const got = []
  const sub = cloud.subscribe((e) => got.push(e.new.id))
  assert.equal(cloud.subscriberCount, 1)
  sub.unsubscribe()
  assert.equal(cloud.subscriberCount, 0)
  await cloud.push([live('t1', stamp(T0))])
  assert.deepEqual(got, [])
})

test('a realtime outage loses events, reports status, and a delta pull recovers them', async () => {
  const { cloud } = setup()
  const phone = cloud.fork()
  const statuses = []
  const got = []
  phone.subscribe((e) => got.push(e.new.id), { onStatus: (s) => statuses.push(s) })
  assert.deepEqual(statuses, ['SUBSCRIBED'])

  await cloud.push([live('before', stamp(T0))])
  const cursor = (await phone.pull()).at(-1).rev

  phone.setRealtimeUp(false)
  assert.deepEqual(statuses, ['SUBSCRIBED', 'CHANNEL_ERROR'])
  await cloud.push([live('missed', stamp(T0))])
  phone.setRealtimeUp(true)
  assert.deepEqual(statuses, ['SUBSCRIBED', 'CHANNEL_ERROR', 'SUBSCRIBED'])

  assert.deepEqual(got, ['before'], 'the event during the outage is gone')
  const delta = await phone.pull({ sinceRev: cursor })
  assert.deepEqual(delta.map((r) => r.id), ['missed'])
  await cloud.push([live('after', stamp(T0))])
  assert.deepEqual(got, ['before', 'after'])
})

test('setOffline also drops and restores the realtime link; statuses fire only on change', async () => {
  const { cloud } = setup()
  const statuses = []
  cloud.subscribe(() => {}, { onStatus: (s) => statuses.push(s) })
  cloud.setOffline(true)
  cloud.setOffline(true)
  cloud.setRealtimeUp(false)
  cloud.setOffline(false) // realtime itself still down: no status yet
  cloud.setRealtimeUp(true)
  assert.deepEqual(statuses, ['SUBSCRIBED', 'CHANNEL_ERROR', 'SUBSCRIBED'])
})

test('subscribing while offline reports CHANNEL_ERROR, then SUBSCRIBED when back', () => {
  const { cloud } = setup()
  cloud.setOffline(true)
  const statuses = []
  cloud.subscribe(() => {}, { onStatus: (s) => statuses.push(s) })
  cloud.setOffline(false)
  assert.deepEqual(statuses, ['CHANNEL_ERROR', 'SUBSCRIBED'])
})

test('subscribing without a session throws a 401', () => {
  const { cloud } = setup({ userId: null })
  assert.throws(() => cloud.subscribe(() => {}), { status: 401 })
})

// ---- two devices and tombstone GC ----

test('two devices editing one record converge on the higher hlc regardless of arrival order', async () => {
  for (const order of [['a', 'b'], ['b', 'a']]) {
    const { cloud } = setup()
    const dev = { a: cloud, b: cloud.fork() }
    const ops = {
      a: live('t1', stamp(T0, 0, 'devaaaaa'), { title: 'from a' }),
      b: live('t1', stamp(T0 + 1, 0, 'devbbbbb'), { title: 'from b' }),
    }
    for (const who of order) await dev[who].push([ops[who]])
    assert.equal(cloud.getRow('u1', 'tasks', 't1').body.title, 'from b', `order ${order}`)
  }
})

test('gcTombstones removes only tombstones older than the retention window', async () => {
  const { cloud, clock } = setup()
  await cloud.push([live('keep', stamp(T0)), live('old', stamp(T0)), live('recent', stamp(T0))])
  await cloud.push([
    { ...dead('old', stamp(T0, 1)), deleted_at: new Date(T0 - 100 * DAY).toISOString() },
    { ...dead('recent', stamp(T0, 1)), deleted_at: new Date(T0 - 10 * DAY).toISOString() },
  ])
  assert.equal(cloud.gcTombstones(), 1)
  assert.equal(cloud.getRow('u1', 'tasks', 'old'), null)
  assert.ok(cloud.getRow('u1', 'tasks', 'recent'))
  assert.ok(cloud.getRow('u1', 'tasks', 'keep'))
  clock.ms += 100 * DAY
  assert.equal(cloud.gcTombstones(), 1)
})

test('the fake clock drives the drift guard and server_at', async () => {
  const { cloud, clock } = setup()
  const future = stamp(T0 + 2 * DAY)
  assert.deepEqual(await cloud.push([live('t1', future)]), [])
  clock.ms = T0 + 2 * DAY // the server clock catches up
  assert.equal((await cloud.push([live('t1', future)])).length, 1)
  assert.equal(cloud.getRow('u1', 'tasks', 't1').server_at, new Date(clock.ms).toISOString())
})

// ---- fakeDb ----

test('fakeDb behaves like localforage: null for missing, setItem resolves the value, keys and clear', async () => {
  const db = createFakeDb({ a: 1 })
  assert.equal(await db.getItem('missing'), null)
  assert.equal(await db.getItem('a'), 1)
  assert.deepEqual(await db.setItem('b', { x: 1 }), { x: 1 })
  assert.deepEqual(await db.keys(), ['a', 'b'])
  assert.equal(await db.length(), 2)
  await db.removeItem('a')
  assert.equal(await db.getItem('a'), null)
  await db.clear()
  assert.deepEqual(await db.keys(), [])
  assert.equal(makeFakeDb, createFakeDb)
})

test('fakeDb clones on the way in and out like IndexedDB', async () => {
  const db = createFakeDb()
  const v = { list: [1] }
  await db.setItem('k', v)
  v.list.push(2)
  const out = await db.getItem('k')
  assert.deepEqual(out, { list: [1] })
  out.list.push(3)
  assert.deepEqual(await db.getItem('k'), { list: [1] })

  const shared = createFakeDb({}, { clone: false })
  await shared.setItem('k', v)
  assert.equal(await shared.getItem('k'), v)
})

test('fakeDb failure injection: per op, per key, counted, clearable', async () => {
  const db = createFakeDb({ keep: 1 })
  db.failOn('setItem', { key: 'notes', error: new Error('quota exceeded') })
  await db.setItem('other', 1) // other keys unaffected
  await assert.rejects(db.setItem('notes', 'A'), /quota exceeded/)
  assert.equal(await db.getItem('notes'), null, 'a failed write stores nothing')
  await db.setItem('notes', 'A') // one-shot
  assert.equal(await db.getItem('notes'), 'A')

  db.failOn('getItem', { times: 2 })
  await assert.rejects(db.getItem('keep'))
  await assert.rejects(db.getItem('keep'))
  assert.equal(await db.getItem('keep'), 1)

  db.failOn('clear', { times: Infinity })
  await assert.rejects(db.clear())
  db.clearFailures()
  await db.clear()
  assert.throws(() => db.failOn('nope'), /unknown op/)
})

test('fakeDb counts calls and exposes a snapshot', async () => {
  const db = createFakeDb({ a: { n: 1 } })
  await db.getItem('a')
  await db.setItem('b', 2)
  assert.equal(db.calls.getItem, 1)
  assert.equal(db.calls.setItem, 1)
  assert.deepEqual(db.snapshot(), { a: { n: 1 }, b: 2 })
  assert.equal(db.has('b'), true)
})
