import test, { mock, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { createEngine2, DEBOUNCE_MS } from '../src/sync/engine2.js'
import { createCloudV2 } from '../src/sync/cloudV2.js'
import { createFakeCloudV2 } from './helpers/fakeCloudV2.js'
import { createFakeDb } from './helpers/fakeDb.js'

// Two-device simulation: two engine2 instances, each with its OWN fakeDb, lock and
// bus (two physical devices), sharing ONE fake cloud (one server, two sessions of
// the same user). Offline is simulated per device with client.setOffline. Wall time
// is one injected clock (setTimeout is mocked and never fires on its own), so the
// order of "edited last" is explicit. Nothing touches IndexedDB, the network or a
// real service.
//
// Part 1 reproduces blueprint Lab 1 (docs/forge-blueprint.html:1167-1226): phone
// edits {rename "Pay rent" (pr), delete "Gym 6pm" (pd)}, laptop edits {change
// "Gym 6pm" to 7pm (le), add "Call bank" (la)}: 2^4 = 16 combinations, times
// "who edited last" (phone or laptop), under the strategy 'per record + tombstone'.
// Delete-vs-edit of the same task (pd and le) is the one true conflict in the
// lab: one side must lose and the later edit wins. Every other edit must survive.

afterEach(() => mock.timers.reset())

const T0 = 1_700_000_000_000
const DAY = 86_400_000
const HOUR = 3_600_000

const settle = async () => { for (let i = 0; i < 25; i++) await new Promise((r) => setImmediate(r)) }

// supabase-js shaped client (rpc, from().select().gt().order().limit(),
// channel().on().subscribe(), removeChannel) over one client of the v2 fake.
function makeFakeSupabase(cloud) {
  const fail = (e) => ({ data: null, error: { message: e.message, code: e.code }, status: e.status ?? 400 })
  return {
    auth: { getSession: () => cloud.getSession() },
    async rpc(_fn, args) {
      try { return { data: await cloud.push(args.rows), error: null, status: 200 } } catch (e) { return fail(e) }
    },
    from() {
      const q = { gt: null, limit: undefined }
      const b = {
        select() { return b },
        gt(_col, v) { q.gt = v; return b },
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
      ch.on = (_type, _filter, cb) => { ch.bindings.push(cb); return ch }
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

// Web Locks semantics: requests for one name run one at a time, FIFO.
function createFakeLock() {
  const tails = new Map()
  return (name, fn) => {
    const prev = tails.get(name) || Promise.resolve()
    const run = prev.then(() => fn())
    tails.set(name, run.then(() => undefined, () => undefined))
    return run
  }
}

// One world = one server + one wall clock. device(name, { skewMs }) adds a device
// whose own wall clock is the shared one plus skewMs (a wrong clock).
function createWorld({ t = T0 } = {}) {
  mock.timers.enable({ apis: ['setTimeout'] })
  let ms = t
  const clock = { now: () => ms, set: (v) => { ms = v }, advance: (d) => { ms += d; mock.timers.tick(d) } }
  const server = createFakeCloudV2({ userId: 'u1', now: clock.now })
  const devices = []
  function device(name, { skewMs = 0 } = {}) {
    const client = server.fork()
    const engine = createEngine2({
      db: createFakeDb(),
      lock: createFakeLock(),
      bus: null,
      cloud: createCloudV2(makeFakeSupabase(client)),
      now: () => ms + skewMs,
      newId: () => `${name}001`,
      random: () => 0,
      win: new EventTarget(),
      doc: Object.assign(new EventTarget(), { visibilityState: 'visible' }),
    })
    const d = {
      name,
      engine,
      client,
      get: (key = 'tasks') => engine.get(key, []),
      // read the latest served list, hand the edited list back (the app's whole-array save)
      async edit(fn, key = 'tasks') {
        const cur = await engine.get(key, [])
        await engine.save(key, fn(cur))
      },
    }
    devices.push(d)
    return d
  }
  // Push everything, pull everything, twice, so realtime echoes and order cannot matter.
  async function converge(order = devices) {
    for (let round = 0; round < 2; round++) {
      for (const d of order) await d.engine.flush()
      for (const d of order) await d.engine.pull()
      await settle()
    }
    for (const d of devices) await d.engine.whenIdle()
  }
  const closeAll = () => devices.forEach((d) => d.engine.close())
  return { clock, server, device, converge, closeAll }
}

const view = (list) => list.map(({ id, title }) => ({ id, title }))

const BASE = [
  { id: 1, title: 'Pay rent' },
  { id: 2, title: 'Gym 6pm' },
  { id: 3, title: 'Read ch. 4' },
]

// ---- Lab 1: 16 combinations x 2 "edited last" settings ---------------------------------

// Independent oracle for 'per record + tombstone': per record, the later edit wins;
// a record only one device touched keeps that device's edit.
function expectedLab1({ pr, pd, le, la, later }) {
  const out = []
  out.push({ id: 1, title: pr ? 'Pay rent ₹18k' : 'Pay rent' })
  if (pd && le) {
    if (later === 'laptop') out.push({ id: 2, title: 'Gym 7pm' }) // laptop edit is later than the phone delete
    // else the phone delete is later: the task stays deleted
  } else if (pd) {
    // deleted, nothing else touched it
  } else {
    out.push({ id: 2, title: le ? 'Gym 7pm' : 'Gym 6pm' })
  }
  out.push({ id: 3, title: 'Read ch. 4' })
  if (la) out.push({ id: 4, title: 'Call bank' })
  return out
}

// The lab's verdict: which of the ticked edits survived.
function labChecks(res, { pr, pd, le, la }) {
  const has = (id, title) => res.some((x) => x.id === id && (title === undefined || x.title === title))
  const checks = []
  if (pr) checks.push(['phone renamed rent', has(1, 'Pay rent ₹18k')])
  if (pd) checks.push(['phone deleted gym', !has(2)])
  if (le) checks.push(['laptop moved gym to 7pm', has(2, 'Gym 7pm')])
  if (la) checks.push(['laptop added Call bank', has(4)])
  return checks
}

async function runLab1(combo, order) {
  const w = createWorld()
  const phone = w.device('phone')
  const laptop = w.device('laptop')
  try {
    await phone.engine.startSync()
    await laptop.engine.startSync()

    // both devices start from the same synced list
    await phone.engine.save('tasks', BASE.map((x) => ({ ...x })))
    await w.converge()
    assert.deepEqual(view(await laptop.get()), BASE, 'laptop starts from the same list')

    // both go offline and edit; the device that edited last has the later clock
    phone.client.setOffline(true)
    laptop.client.setOffline(true)
    const phoneEdits = async () => {
      await phone.edit((list) => {
        let next = list.map((x) => ({ ...x }))
        if (combo.pr) next = next.map((x) => (x.id === 1 ? { ...x, title: 'Pay rent ₹18k' } : x))
        if (combo.pd) next = next.filter((x) => x.id !== 2)
        return next
      })
    }
    const laptopEdits = async () => {
      await laptop.edit((list) => {
        let next = list.map((x) => ({ ...x }))
        if (combo.le) next = next.map((x) => (x.id === 2 ? { ...x, title: 'Gym 7pm' } : x))
        if (combo.la) next = [...next, { id: 4, title: 'Call bank' }]
        return next
      })
    }
    const firstAt = T0 + HOUR
    const lastAt = T0 + 2 * HOUR
    if (combo.later === 'phone') {
      w.clock.set(firstAt); await laptopEdits()
      w.clock.set(lastAt); await phoneEdits()
    } else {
      w.clock.set(firstAt); await phoneEdits()
      w.clock.set(lastAt); await laptopEdits()
    }

    // reconnect both
    w.clock.set(T0 + 3 * HOUR)
    phone.client.setOffline(false)
    laptop.client.setOffline(false)
    await w.converge(order === 'phone-first' ? [phone, laptop] : [laptop, phone])

    const want = expectedLab1(combo)
    const gotPhone = view(await phone.get())
    const gotLaptop = view(await laptop.get())
    assert.deepEqual(gotPhone, want, 'phone')
    assert.deepEqual(gotLaptop, want, 'laptop')
    const cloudLive = w.server.allRows().filter((r) => r.deleted_at === null).sort((a, b) => a.pos - b.pos)
    assert.deepEqual(cloudLive.map((r) => ({ id: r.body.id, title: r.body.title })), want, 'cloud')

    // zero lost edits: the only loser allowed is delete-vs-edit of the same task
    const lost = labChecks(gotLaptop, combo).filter(([, ok]) => !ok)
    const conflict = combo.pd && combo.le
    assert.equal(lost.length, conflict ? 1 : 0, `lost edits: ${lost.map(([n]) => n).join(', ') || 'none'}`)
    if (conflict) {
      const winner = combo.later === 'laptop' ? 'phone deleted gym' : 'laptop moved gym to 7pm'
      assert.deepEqual(lost.map(([n]) => n), [winner], 'the earlier edit of the conflict loses')
    }

    // the delete is a versioned record, not an absence
    if (combo.pd) {
      const row = w.server.getRow('u1', 'tasks', '2')
      assert.ok(row, 'the gym task has a cloud row')
      assert.equal(row.deleted_at === null, !!(combo.le && combo.later === 'laptop'))
    }
  } finally {
    w.closeAll()
    mock.timers.reset()
  }
}

for (const later of ['phone', 'laptop']) {
  for (let bits = 0; bits < 16; bits++) {
    const combo = { pr: !!(bits & 1), pd: !!(bits & 2), le: !!(bits & 4), la: !!(bits & 8), later }
    const label = ['pr', 'pd', 'le', 'la'].filter((k) => combo[k]).join('+') || 'no edits'
    test(`Lab 1, per record + tombstone, ${later} edited last: ${label}`, async () => {
      // reconnect order must not change the result either
      await runLab1(combo, 'phone-first')
      await runLab1(combo, 'laptop-first')
    })
  }
}

// ---- online: realtime carries edits between devices without a manual pull -------------------

test('online devices see each other edits through realtime and a delete as a tombstone', async () => {
  const w = createWorld()
  const phone = w.device('phone')
  const laptop = w.device('laptop')
  try {
    await phone.engine.startSync()
    await laptop.engine.startSync()
    await phone.engine.save('tasks', BASE.map((x) => ({ ...x })))
    w.clock.advance(DEBOUNCE_MS)
    await phone.engine.whenIdle()
    await settle()
    assert.deepEqual(view(await laptop.get()), BASE)

    w.clock.set(T0 + HOUR)
    await laptop.edit((l) => l.filter((x) => x.id !== 3))
    w.clock.advance(DEBOUNCE_MS)
    await laptop.engine.whenIdle()
    await settle()
    assert.deepEqual(view(await phone.get()), BASE.slice(0, 2), 'delete reached the phone')
    const tomb = w.server.getRow('u1', 'tasks', '3')
    assert.equal(tomb.body, null)
    assert.ok(tomb.deleted_at)
  } finally {
    w.closeAll()
  }
})

// ---- wrong clock ---------------------------------------------------------------------------

test('a wrong-clock phone (+1 year) does not win: its stamp never reaches the cloud or the laptop', async () => {
  const w = createWorld()
  const laptop = w.device('laptop')
  const phone = w.device('phone', { skewMs: 365 * DAY })
  try {
    await laptop.engine.startSync()
    await phone.engine.startSync()
    await laptop.engine.save('tasks', [{ id: 1, title: 'base' }])
    await w.converge()
    assert.deepEqual(view(await phone.get()), [{ id: 1, title: 'base' }])
    const sane = w.server.getRow('u1', 'tasks', '1').hlc

    // the phone edits with its clock a year ahead
    await phone.edit((l) => l.map((x) => ({ ...x, title: 'phone, wrong clock' })))
    const phoneStamp = phone.engine.clock.peek()
    assert.ok(Number(phoneStamp.slice(0, 15)) - w.clock.now() > 300 * DAY, 'the phone stamped a year ahead')
    await phone.engine.flush()
    assert.ok(phone.client.pushed.some((b) => b.some((r) => r.hlc === phoneStamp)), 'the phone did try to push it')

    // forge_push refuses a stamp more than 24 h ahead: the cloud still holds the base row
    assert.equal(w.server.getRow('u1', 'tasks', '1').hlc, sane)
    assert.equal(w.server.getRow('u1', 'tasks', '1').body.title, 'base')

    // the laptop never saw that stamp: its clock was not dragged a year forward
    await laptop.engine.pull()
    await settle()
    assert.deepEqual(view(await laptop.get()), [{ id: 1, title: 'base' }])
    assert.ok(Number(laptop.engine.clock.peek().slice(0, 15)) - w.clock.now() < DAY, 'laptop clock stays sane')

    // the laptop edits later in real time: that edit is what the cloud and the laptop hold
    w.clock.advance(HOUR)
    await laptop.edit((l) => l.map((x) => ({ ...x, title: 'laptop, later' })))
    await laptop.engine.flush()
    await laptop.engine.pull()
    await settle()
    assert.deepEqual(view(await laptop.get()), [{ id: 1, title: 'laptop, later' }])
    const row = w.server.getRow('u1', 'tasks', '1')
    assert.equal(row.body.title, 'laptop, later')
    assert.ok(Number(row.hlc.slice(0, 15)) - w.clock.now() <= DAY, 'the stored stamp is within the drift guard')

    // the phone's dropped edit is not acked as synced: it reconciles to the cloud and converges
    await w.converge()
    assert.deepEqual(view(await phone.get()), [{ id: 1, title: 'laptop, later' }])
    assert.deepEqual(view(await laptop.get()), [{ id: 1, title: 'laptop, later' }])
    assert.equal(w.server.getRow('u1', 'tasks', '1').body.title, 'laptop, later')
    assert.equal(phone.engine.syncStatus().pending, 0)
    assert.equal(phone.engine.syncStatus().quarantined, 0)
  } finally {
    w.closeAll()
  }
})

// ---- habit check-ins on different days ------------------------------------------------------

test('two devices checking in a habit on different days both keep their check-in', async () => {
  const w = createWorld()
  const phone = w.device('phone')
  const laptop = w.device('laptop')
  try {
    await phone.engine.startSync()
    await laptop.engine.startSync()
    await phone.engine.save('habits', [{ id: 'h1', name: 'Run', checkins: ['2026-05-01'] }])
    await w.converge()
    assert.deepEqual((await laptop.get('habits'))[0].checkins, ['2026-05-01'])

    phone.client.setOffline(true)
    laptop.client.setOffline(true)
    w.clock.set(T0 + HOUR)
    await phone.edit((hs) => hs.map((h) => ({ ...h, checkins: [...h.checkins, '2026-05-02'] })), 'habits')
    w.clock.set(T0 + 2 * HOUR)
    await laptop.edit((hs) => hs.map((h) => ({ ...h, checkins: [...h.checkins, '2026-05-03'] })), 'habits')

    w.clock.set(T0 + 3 * HOUR)
    phone.client.setOffline(false)
    laptop.client.setOffline(false)
    await w.converge()

    const want = ['2026-05-01', '2026-05-02', '2026-05-03']
    for (const d of [phone, laptop]) {
      const habits = await d.get('habits')
      assert.equal(habits.length, 1, `${d.name}: one habit`)
      assert.deepEqual([...habits[0].checkins].sort(), want, `${d.name}: all three check-ins`)
    }
    const cloudCheckins = w.server.allRows().filter((r) => r.collection === 'habitCheckins' && r.deleted_at === null)
    assert.deepEqual(cloudCheckins.map((r) => r.id).sort(), ['h1:2026-05-01', 'h1:2026-05-02', 'h1:2026-05-03'])
  } finally {
    w.closeAll()
  }
})

test('the same day checked in on both devices stays one check-in; an uncheck on one device wins only if later', async () => {
  const w = createWorld()
  const phone = w.device('phone')
  const laptop = w.device('laptop')
  try {
    await phone.engine.startSync()
    await laptop.engine.startSync()
    await phone.engine.save('habits', [{ id: 'h1', name: 'Run', checkins: [] }])
    await w.converge()

    phone.client.setOffline(true)
    laptop.client.setOffline(true)
    w.clock.set(T0 + HOUR)
    await phone.edit((hs) => hs.map((h) => ({ ...h, checkins: ['2026-05-02'] })), 'habits')
    w.clock.set(T0 + 2 * HOUR)
    await laptop.edit((hs) => hs.map((h) => ({ ...h, checkins: ['2026-05-02'] })), 'habits')
    phone.client.setOffline(false)
    laptop.client.setOffline(false)
    await w.converge()
    for (const d of [phone, laptop]) assert.deepEqual((await d.get('habits'))[0].checkins, ['2026-05-02'])

    // phone unchecks later than the laptop's check-in: the tombstone wins everywhere
    phone.client.setOffline(true)
    laptop.client.setOffline(true)
    w.clock.set(T0 + 3 * HOUR)
    await laptop.edit((hs) => hs.map((h) => ({ ...h, checkins: ['2026-05-02', '2026-05-04'] })), 'habits')
    w.clock.set(T0 + 4 * HOUR)
    await phone.edit((hs) => hs.map((h) => ({ ...h, checkins: [] })), 'habits')
    phone.client.setOffline(false)
    laptop.client.setOffline(false)
    await w.converge()
    for (const d of [phone, laptop]) {
      assert.deepEqual((await d.get('habits'))[0].checkins, ['2026-05-04'], `${d.name}: 05-02 unchecked, 05-04 kept`)
    }
  } finally {
    w.closeAll()
  }
})
