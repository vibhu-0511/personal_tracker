import test, { mock, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { createEngine2, OUTBOX_KEY, META_KEY, DEBOUNCE_MS, LONG_OFFLINE_MS } from '../src/sync/engine2.js'
import { createCloudV2 } from '../src/sync/cloudV2.js'
import { serialize } from '../src/sync/hlc.js'
import { createFakeCloudV2 } from './helpers/fakeCloudV2.js'
import { createFakeDb } from './helpers/fakeDb.js'

// Everything runs against in-memory fakes: fakeDb, fakeCloudV2 behind a
// supabase-js shaped client + createCloudV2, a Web Locks style mutex, a bus and
// fake window/document events. setTimeout is mocked (node:test mock.timers); the
// wall clock is the injected `now`, advanced together with the timers.

const T0 = 1_700_000_000_000
const DAY = 86_400_000

afterEach(() => mock.timers.reset())

// supabase-js shaped client (rpc, from().select().gt().order().limit(),
// channel().on().subscribe(), removeChannel) over the v2 fake; resolves { data, error }.
function makeFakeSupabase(cloud) {
  const log = { rpc: [], queries: [], removed: [] }
  const fail = (e) => ({ data: null, error: { message: e.message, code: e.code }, status: e.status ?? 400 })
  return {
    log,
    auth: { getSession: () => cloud.getSession() },
    async rpc(fn, args) {
      log.rpc.push({ fn, rows: args.rows.length })
      try { return { data: await cloud.push(args.rows), error: null, status: 200 } } catch (e) { return fail(e) }
    },
    from() {
      const q = { gt: null }
      log.queries.push(q)
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
    channel(name) {
      const ch = { name, bindings: [] }
      ch.on = (type, filter, cb) => { ch.bindings.push(cb); return ch }
      ch.subscribe = (statusCb) => {
        const sub = cloud.subscribe((evt) => ch.bindings[0](evt), { onStatus: (s) => statusCb(s) })
        ch.unsub = () => sub.unsubscribe()
        return ch
      }
      return ch
    },
    removeChannel(ch) { log.removed.push(ch.name); ch.unsub?.(); return Promise.resolve('ok') },
  }
}

// Web Locks semantics: requests for one name run one at a time, FIFO.
function createFakeLock() {
  const tails = new Map()
  const names = []
  const lock = (name, fn) => {
    names.push(name)
    const prev = tails.get(name) || Promise.resolve()
    const run = prev.then(() => fn())
    tails.set(name, run.then(() => undefined, () => undefined))
    return run
  }
  lock.names = names
  return lock
}

function createFakeBusGroup() {
  const members = new Set()
  return {
    make() {
      const listeners = new Set()
      const member = {
        postMessage(data) {
          const copy = structuredClone(data)
          for (const m of members) if (m !== member) queueMicrotask(() => m.listeners.forEach((h) => h({ data: copy })))
        },
        listeners,
        addEventListener(type, h) { if (type === 'message') listeners.add(h) },
        removeEventListener(type, h) { if (type === 'message') listeners.delete(h) },
        close() { members.delete(member) },
      }
      members.add(member)
      return member
    },
  }
}

const settle = async () => { for (let i = 0; i < 25; i++) await new Promise((r) => setImmediate(r)) }

function setup(opts = {}) {
  mock.timers.enable({ apis: ['setTimeout'] })
  let t = opts.t ?? T0
  const clock = { now: () => t, advance: (ms) => { t += ms; mock.timers.tick(ms) }, set: (v) => { t = v } }
  const db = opts.db ?? createFakeDb()
  const lock = opts.lock ?? createFakeLock()
  const group = opts.group ?? createFakeBusGroup()
  const server = opts.cloud ?? createFakeCloudV2({ userId: 'u1', now: clock.now })
  const winEvents = new EventTarget()
  const docEvents = Object.assign(new EventTarget(), { visibilityState: 'visible' })
  let n = 0
  const make = (name = 'a', extra = {}) => {
    const client = extra.client ?? server.fork()
    const supabase = makeFakeSupabase(client)
    const cloud = createCloudV2(supabase, { pullPageSize: extra.pullPageSize ?? 1000 })
    const engine = createEngine2({
      db: extra.db ?? db,
      lock,
      bus: group.make(),
      cloud,
      now: clock.now,
      newId: () => `${name}${String(++n).padStart(3, '0')}`,
      random: () => 0,
      win: winEvents,
      doc: docEvents,
      onSyncError: extra.onSyncError,
    })
    return { engine, client, supabase }
  }
  return { clock, db, lock, group, server, make, winEvents, docEvents }
}

// A record written by "another device" straight into the fake cloud.
let seq = 0
const remoteTask = (client, id, title, ms, node = 'phone001') =>
  client.push([{
    collection: 'tasks', id, body: { id, title }, pos: ++seq * 1000,
    hlc: serialize({ ms, counter: 0, node }), device_id: node, deleted_at: null,
  }])

const titles = async (engine) => (await engine.get('tasks', [])).map((x) => x.title)

test('writes are debounced 700ms, then drain as one forge_push batch', async () => {
  const { clock, db, make } = setup()
  const { engine, client, supabase } = make()
  await engine.startSync()
  const base = client.calls.push

  await engine.save('tasks', [{ id: 't1', title: 'one' }])
  clock.advance(300)
  await engine.save('tasks', [{ id: 't1', title: 'one' }, { id: 't2', title: 'two' }])
  clock.advance(300)
  await engine.save('tasks', [{ id: 't1', title: 'one' }, { id: 't2', title: 'two' }, { id: 't3', title: 'three' }])
  await settle()
  clock.advance(DEBOUNCE_MS - 1) // 699ms after the last write: still waiting
  await settle()
  assert.equal(client.calls.push, base)

  clock.advance(1)
  await engine.whenIdle()
  assert.equal(client.calls.push, base + 1, 'one batch')
  assert.deepEqual(supabase.log.rpc.map((c) => [c.fn, c.rows]), [['forge_push', 3]])
  assert.equal(engine.outbox.size(), 0)
  assert.deepEqual(db.snapshot()[OUTBOX_KEY].dirty, [], 'acked entries are persisted')
  assert.deepEqual(client.allRows().map((r) => r.id).sort(), ['t1', 't2', 't3'])
  engine.close()
})

test('offline: the push fails and retries with backoff; the online event drains at once', async () => {
  const errors = []
  const { clock, winEvents, make } = setup()
  const { engine, client } = make('a', { onSyncError: (e) => errors.push(e.kind) })
  await engine.startSync()
  client.setOffline(true)
  await engine.save('tasks', [{ id: 't1', title: 'offline' }])
  clock.advance(DEBOUNCE_MS)
  await engine.whenIdle()
  assert.equal(engine.outbox.size(), 1, 'kept in the outbox')
  assert.ok(errors.includes('network'))
  const afterFail = client.calls.push
  assert.ok(afterFail >= 1)

  // back online: the event drains immediately, without waiting for the 1s backoff
  client.setOffline(false)
  winEvents.dispatchEvent(new Event('online'))
  await engine.whenIdle()
  assert.equal(client.calls.push, afterFail + 1)
  assert.equal(engine.outbox.size(), 0)
  assert.equal(client.getRow('u1', 'tasks', 't1')?.body.title, 'offline')
  engine.close()
})

test('offline: the backoff timer retries on its own once the network is back', async () => {
  const { clock, make } = setup()
  const { engine, client } = make()
  await engine.startSync()
  client.inject('503', { times: 1, ops: ['push'] })
  await engine.save('tasks', [{ id: 't1', title: 'x' }])
  clock.advance(DEBOUNCE_MS)
  await engine.whenIdle()
  assert.equal(engine.outbox.size(), 1)
  clock.advance(1000) // base backoff, random() = 0 so no jitter
  await engine.whenIdle()
  assert.equal(engine.outbox.size(), 0)
  assert.equal(client.calls.push, 2)
  engine.close()
})

test('flush() pushes immediately and cancels the debounce', async () => {
  const { clock, make } = setup()
  const { engine, client } = make()
  await engine.startSync()
  await engine.save('tasks', [{ id: 't1', title: 'now' }])
  assert.equal(client.calls.push, 0)
  const r = await engine.flush()
  assert.equal(r.status, 'idle')
  assert.equal(client.calls.push, 1)
  assert.equal(client.getRow('u1', 'tasks', 't1')?.body.title, 'now')
  clock.advance(DEBOUNCE_MS * 2)
  await engine.whenIdle()
  assert.equal(client.calls.push, 1, 'the debounce timer was cancelled')
  engine.close()
})

test("pull asks for 'rev > cursor - 50' and loops pages until a short page", async () => {
  const { clock, make } = setup()
  const other = make('b').client
  for (let i = 1; i <= 60; i++) await remoteTask(other, `t${i}`, `task ${i}`, T0 - 1000 + i)
  const { engine, client, supabase } = make('a', { pullPageSize: 25 })
  await engine.startSync()
  assert.deepEqual(supabase.log.queries.map((q) => q.gt), [0, 25, 50], '25 + 25 + 10 rows: stops at the short page')
  assert.equal(client.calls.pull, 3)
  assert.equal((await engine.get('tasks', [])).length, 60)
  assert.equal(engine.meta.cursor, 60)

  await remoteTask(other, 't61', 'task 61', T0)
  supabase.log.queries.length = 0
  await engine.pull()
  // cursor 60 - 50 = 10; rows 11..61 are 51 rows: pages of 25, 25, 1
  assert.deepEqual(supabase.log.queries.map((q) => q.gt), [10, 35, 60])
  assert.equal((await engine.get('tasks', [])).length, 61, 'overlap rows are de-duped by hlc')
  assert.equal(engine.meta.cursor, 61)
  assert.equal(clock.now(), T0)
  engine.close()
})

test('a realtime payload is applied without refetching, and does not move the cursor', async () => {
  const { make } = setup()
  const { engine, client } = make('a')
  const other = make('b').client
  await engine.startSync()
  const seen = []
  engine.subscribe('tasks', (blob) => seen.push(blob.map((x) => x.title)))
  const pulls = client.calls.pull
  const cursor = engine.meta.cursor

  await remoteTask(other, 't9', 'live', T0 + 5)
  await engine.whenIdle()
  assert.equal(client.calls.pull, pulls, 'no refetch')
  assert.deepEqual(seen, [['live']])
  assert.deepEqual(await titles(engine), ['live'])
  assert.equal(engine.meta.cursor, cursor)
  engine.close()
})

test('an own echo is a no-op: no write, no notification', async () => {
  const { clock, db, make } = setup()
  const { engine, client } = make('a')
  await engine.startSync()
  const seen = []
  engine.subscribe('tasks', (blob) => seen.push(blob))
  await engine.save('tasks', [{ id: 't1', title: 'mine' }])
  seen.length = 0
  const writes = db.calls.setItem
  clock.advance(DEBOUNCE_MS)
  await engine.whenIdle()
  await settle()
  // the push came back as a realtime event with the same hlc: nothing to store
  assert.equal(client.calls.push, 1)
  assert.equal(seen.length, 0, 'subscribers are not notified of their own echo')
  assert.equal(db.calls.setItem, writes + 1, 'only the acked outbox was persisted')
  // a delta pull returns the same row again: also a no-op
  const before = db.calls.setItem
  await engine.pull()
  const after = db.snapshot()
  assert.equal(seen.length, 0)
  assert.equal(db.calls.setItem - before, 1, 'pull persisted only the meta cursor')
  assert.equal(after[META_KEY].cursor, 1)
  engine.close()
})

test('a pending local edit is superseded by a newer remote version of the record', async () => {
  const { clock, make } = setup()
  const { engine, client } = make('a')
  const other = make('b').client
  await engine.startSync()
  client.setOffline(true)
  await engine.save('tasks', [{ id: 't1', title: 'local' }])
  await engine.whenIdle()
  assert.equal(engine.outbox.size(), 1)
  await remoteTask(other, 't1', 'remote wins', T0 + 10_000)
  client.setOffline(false)
  await engine.pull()
  assert.deepEqual(await titles(engine), ['remote wins'])
  assert.equal(engine.outbox.size(), 0)
  clock.advance(0)
  engine.close()
})

test('after more than 60 days offline a full pull drops GC-d records but keeps outbox records', async () => {
  const { clock, db, make } = setup()
  const first = make('a')
  const other = make('b').client
  await remoteTask(other, 'gone', 'deleted elsewhere', T0 - 1000)
  await remoteTask(other, 'kept', 'still in the cloud', T0 - 999)
  await first.engine.startSync()
  assert.deepEqual((await titles(first.engine)).sort(), ['deleted elsewhere', 'still in the cloud'])
  first.engine.close()

  // another device deletes 'gone'; its tombstone is GC'd from the cloud after 90 days
  clock.set(T0 + 61 * DAY)
  other.setSessionUserId('u1')
  await other.push([{ collection: 'tasks', id: 'gone', body: null, pos: 1, hlc: serialize({ ms: T0 + 1000, counter: 0, node: 'phone001' }), device_id: 'phone001', deleted_at: new Date(T0 + 1000).toISOString() }])
  assert.equal(other.gcTombstones({ retainMs: 60 * DAY }), 1)
  assert.equal(other.getRow('u1', 'tasks', 'gone'), null, 'absent from the cloud')

  // this device made an edit offline that was never pushed (dirty), then reopens
  const second = make('a', { client: first.client })
  await second.engine.ready()
  clock.set(T0 + 100 * DAY)
  const e = second.engine
  const list = await e.get('tasks', [])
  await e.save('tasks', [...list, { id: 'offline-new', title: 'written offline' }])
  // a record stamped after the pull will start (clock skew) is never "older than the pull start"
  const snap = db.snapshot()['r2:tasks']
  snap.recs.future = { b: { id: 'future', title: 'newer than the pull' }, h: serialize({ ms: T0 + 101 * DAY + 3_600_000, counter: 0, node: 'a001' }), d: null, p: 9000 }
  await db.setItem('r2:tasks', snap)
  clock.set(T0 + 101 * DAY) // the pull starts a day after the edit, so the edit is older than the pull start
  const lastPullAt = e.meta.lastPullAt
  assert.ok(clock.now() - lastPullAt > LONG_OFFLINE_MS)
  assert.equal(e.outbox.size(), 1)

  const queriesBefore = second.supabase.log.queries.length
  await e.startSync() // first pull is a full pull, before the push
  assert.equal(second.supabase.log.queries[queriesBefore].gt, 0, 'full pull from rev 0')
  const local = (await e.get('tasks', [])).map((x) => x.id).sort()
  assert.deepEqual(local, ['future', 'kept', 'offline-new'], "'gone' is dropped, the outbox and newer records are kept")
  const stored = db.snapshot()['r2:tasks'].recs
  assert.deepEqual(Object.keys(stored).sort(), ['future', 'kept', 'offline-new'])
  // ...and the kept outbox record reaches the cloud afterwards
  assert.equal(first.client.getRow('u1', 'tasks', 'offline-new')?.body.title, 'written offline')
  e.close()
})

test('under 60 days offline a missing record is kept (delta pull, no GC)', async () => {
  const { clock, make } = setup()
  const other = make('b').client
  await remoteTask(other, 'x', 'x', T0 - 1000)
  const a = make('a')
  await a.engine.startSync()
  a.engine.close()
  clock.set(T0 + 30 * DAY)
  other.gcTombstones({ retainMs: 0 })
  await other.push([{ collection: 'tasks', id: 'x', body: null, pos: 1, hlc: serialize({ ms: T0, counter: 0, node: 'phone001' }), device_id: 'phone001', deleted_at: new Date(T0).toISOString() }])
  other.gcTombstones({ retainMs: 0 })
  const again = make('a', { client: a.client })
  await again.engine.startSync()
  assert.deepEqual(await titles(again.engine), ['x'], 'not resynced fully, so not dropped')
  again.engine.close()
})

test('claimOwner for a new user wipes records, outbox and cursor together', async () => {
  const { db, make } = setup()
  const { engine, client } = make('a')
  const other = make('b').client
  await remoteTask(other, 'r1', 'remote', T0 - 100)
  await engine.startSync()
  await engine.claimOwner('u1')
  client.setOffline(true)
  await engine.save('tasks', [...(await engine.get('tasks', [])), { id: 'l1', title: 'unsynced' }])
  assert.equal(engine.outbox.size(), 1)
  assert.ok(engine.meta.cursor > 0)
  const deviceId = engine.meta.deviceId
  const seen = []
  engine.subscribe('tasks', (blob) => seen.push(blob))

  assert.equal(await engine.claimOwner('u1'), false, 'the same user keeps everything')
  assert.equal((await engine.get('tasks', [])).length, 2)

  assert.equal(await engine.claimOwner('u2'), true)
  const snap = db.snapshot()
  assert.equal(snap['r2:tasks'], undefined, 'records are gone')
  assert.deepEqual(snap[OUTBOX_KEY] ?? { dirty: [], quarantined: [] }, { dirty: [], quarantined: [] }, 'outbox is gone')
  assert.equal(snap[META_KEY].cursor, null, 'cursor is gone')
  assert.equal(snap[META_KEY].lastPullAt, null)
  assert.equal(snap[META_KEY].userId, 'u2')
  assert.equal(snap[META_KEY].deviceId, deviceId, 'the hlc node of this device is kept')
  assert.equal(engine.outbox.size(), 0)
  assert.deepEqual(await engine.get('tasks', []), [])
  assert.deepEqual(seen.at(-1), [], 'subscribers see the empty state')

  // the session still belongs to u1: nothing may be pushed or pulled for it
  client.setOffline(false)
  const r = await engine.pull()
  assert.equal(r.status, 'owner-mismatch')
  engine.close()
})

test('only one tab drains: others write locally, the owner pushes for everyone', async () => {
  const { clock, db, make } = setup()
  const A = make('a')
  const B = make('b')
  const ownerA = A.engine.startSync()
  await ownerA
  let bOwner = false
  B.engine.startSync().then((v) => { bOwner = v })
  await settle()
  assert.equal(bOwner, false, 'B is queued behind A for the drain lock')

  await B.engine.save('tasks', [{ id: 'fromB', title: 'written in tab B' }])
  await settle()
  clock.advance(DEBOUNCE_MS)
  await A.engine.whenIdle()
  await settle()
  assert.equal(B.client.calls.push, 0, 'tab B never talks to the network')
  assert.equal(A.client.calls.push, 1)
  assert.equal(A.client.getRow('u1', 'tasks', 'fromB')?.body.title, 'written in tab B')
  assert.deepEqual(db.snapshot()[OUTBOX_KEY].dirty, [])

  // B's flush does not push; the owner is the only drain
  assert.equal((await B.engine.flush()).status, 'not-owner')

  // the owner goes away: B takes over and drains what is in the db
  A.engine.stopSync()
  await B.engine.save('tasks', [...(await B.engine.get('tasks', [])), { id: 'later', title: 'after the handover' }])
  await settle()
  assert.equal(bOwner, true)
  clock.advance(DEBOUNCE_MS)
  await B.engine.whenIdle()
  assert.equal(B.client.getRow('u1', 'tasks', 'later')?.body.title, 'after the handover')
  A.engine.close()
  B.engine.close()
})

test('a record quarantined by the owner survives another tab writing', async () => {
  const { clock, db, make } = setup()
  const A = make('a')
  const B = make('b')
  await A.engine.startSync()
  A.client.inject('constraint', { times: Infinity, match: (r) => r.id === 'poison' })
  await A.engine.save('tasks', [{ id: 'good', title: 'ok' }, { id: 'poison', title: 'bad' }])
  clock.advance(DEBOUNCE_MS)
  await A.engine.whenIdle()
  assert.equal(A.client.getRow('u1', 'tasks', 'good')?.body.title, 'ok')
  assert.equal(A.engine.syncStatus().quarantined, 1)
  assert.equal(db.snapshot()[OUTBOX_KEY].quarantined.length, 1)

  await B.engine.ready()
  await B.engine.save('tasks', [{ id: 'good', title: 'ok' }, { id: 'poison', title: 'bad' }, { id: 'more', title: 'm' }])
  assert.equal(db.snapshot()[OUTBOX_KEY].quarantined.length, 1, "B's snapshot kept the owner's quarantine")
  A.engine.close()
  B.engine.close()
})

test('a realtime reconnect delta-pulls what was missed while the channel was down', async () => {
  const { make } = setup()
  const { engine, client } = make('a')
  const other = make('b').client
  await engine.startSync()
  client.setRealtimeUp(false)
  await remoteTask(other, 'm1', 'missed', T0 + 1)
  await settle()
  assert.deepEqual(await titles(engine), [], 'the event was lost')
  client.setRealtimeUp(true) // SUBSCRIBED again
  await engine.whenIdle()
  assert.deepEqual(await titles(engine), ['missed'])
  engine.close()
})

test('v2 stays off: the engine does nothing on the network until startSync()', async () => {
  const { clock, make } = setup()
  const { engine, client } = make()
  await engine.save('tasks', [{ id: 't1', title: 'local only' }])
  clock.advance(DEBOUNCE_MS * 3)
  await settle()
  assert.deepEqual(client.calls, { push: 0, pull: 0 })
  assert.equal((await engine.flush()).status, 'not-owner')
  assert.equal(engine.syncStatus().owner, false)
  engine.close()
})
