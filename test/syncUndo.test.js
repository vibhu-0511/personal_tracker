import test, { mock, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { createEngine2, collectionKey } from '../src/sync/engine2.js'
import { createCloudV2 } from '../src/sync/cloudV2.js'
import { deleteWithUndo } from '../src/undo.js'
import { onToastsChange } from '../src/toast.js'
import { createFakeCloudV2 } from './helpers/fakeCloudV2.js'
import { createFakeDb } from './helpers/fakeDb.js'

// Undo against sync v2: delete through deleteWithUndo (src/undo.js, unchanged) is a
// tombstone record; undo is an upsert of the same id with a NEWER hlc, so it
// resurrects the record everywhere. A concurrent edit of the same record from
// another device is overwritten only when the undo is the later write (hlc order).
// Everything runs on engine2 with fakeDb and fakeCloudV2; setTimeout is mocked and
// the wall clock is one injected value, so "later" is explicit.

afterEach(() => mock.timers.reset())

const T0 = 1_700_000_000_000
const HOUR = 3_600_000

const settle = async () => { for (let i = 0; i < 25; i++) await new Promise((r) => setImmediate(r)) }

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

function createFakeLock() {
  const tails = new Map()
  return (name, fn) => {
    const prev = tails.get(name) || Promise.resolve()
    const run = prev.then(() => fn())
    tails.set(name, run.then(() => undefined, () => undefined))
    return run
  }
}

function createWorld() {
  mock.timers.enable({ apis: ['setTimeout'] })
  let ms = T0
  const clock = { now: () => ms, set: (v) => { ms = v } }
  const server = createFakeCloudV2({ userId: 'u1', now: clock.now })
  const devices = []
  function device(name) {
    const client = server.fork()
    const db = createFakeDb()
    const engine = createEngine2({
      db,
      lock: createFakeLock(),
      bus: null,
      cloud: createCloudV2(makeFakeSupabase(client)),
      now: () => ms,
      newId: () => `${name}001`,
      random: () => 0,
      win: new EventTarget(),
      doc: Object.assign(new EventTarget(), { visibilityState: 'visible' }),
    })
    const d = {
      name,
      engine,
      client,
      db,
      get: () => engine.get('tasks', []),
      // the stored record (hlc, tombstone mark) straight from this device's fakeDb
      rec: (id) => db.snapshot()[collectionKey('tasks')]?.recs?.[id] ?? null,
      async edit(fn) {
        const cur = await engine.get('tasks', [])
        await engine.save('tasks', fn(cur))
      },
    }
    devices.push(d)
    return d
  }
  async function converge(order = devices) {
    for (let round = 0; round < 2; round++) {
      for (const d of order) await d.engine.flush()
      for (const d of order) await d.engine.pull()
      await settle()
    }
    for (const d of devices) await d.engine.whenIdle()
  }
  return { clock, server, device, converge, closeAll: () => devices.forEach((d) => d.engine.close()) }
}

// UI-side wiring of deleteWithUndo to an engine: a useLatest ref over the list and a
// persist that updates it and saves through the engine (persist is fire-and-forget in
// the app, so the engine's per-key queue is awaited with whenIdle()).
function wireUndo(device, initial) {
  const ref = { current: initial }
  let toasts = []
  const off = onToastsChange((t) => { toasts = t })
  const persist = (next) => {
    ref.current = next
    device.engine.save('tasks', next)
  }
  return {
    ref,
    del: async (id) => {
      deleteWithUndo({ list: ref.current, id, persist, label: (x) => `deleted ${x.title}`, ref })
      await device.engine.whenIdle()
    },
    undo: async () => {
      toasts[toasts.length - 1].undo()
      await device.engine.whenIdle()
    },
    off,
  }
}

const view = (list) => list.map(({ id, title }) => ({ id, title }))
// deleteWithUndo puts the restored item first, so order-insensitive where position is not the point
const byId = (list) => view(list).sort((a, b) => a.id - b.id)
const BASE = [
  { id: 1, title: 'Pay rent' },
  { id: 2, title: 'Gym 6pm' },
  { id: 3, title: 'Read ch. 4' },
]

async function twoDevices() {
  const w = createWorld()
  const phone = w.device('phone')
  const laptop = w.device('laptop')
  await phone.engine.startSync()
  await laptop.engine.startSync()
  await phone.engine.save('tasks', BASE.map((x) => ({ ...x })))
  await w.converge()
  assert.deepEqual(view(await laptop.get()), BASE)
  return { w, phone, laptop }
}

test('delete then undo through deleteWithUndo resurrects the record with a newer hlc', async () => {
  const { w, phone, laptop } = await twoDevices()
  const u = wireUndo(phone, await phone.get())
  try {
    const before = phone.rec('2')
    assert.equal(before.d, null)

    w.clock.set(T0 + HOUR)
    await u.del(2)
    const tomb = phone.rec('2')
    assert.deepEqual(view(await phone.get()), [BASE[0], BASE[2]])
    assert.equal(tomb.b, null, 'the delete is a tombstone record, not an absence')
    assert.ok(tomb.d, 'tombstone has deleted_at')
    assert.ok(tomb.h > before.h, 'tombstone hlc is newer than the original')

    w.clock.set(T0 + 2 * HOUR)
    await u.undo()
    const back = phone.rec('2')
    assert.deepEqual(view(await phone.get()).map((x) => x.id).sort(), [1, 2, 3])
    assert.deepEqual(back.b, { id: 2, title: 'Gym 6pm' }, 'the original body is back')
    assert.equal(back.d, null, 'no longer a tombstone')
    assert.ok(back.h > tomb.h, 'undo hlc is newer than the tombstone')
    assert.ok(back.h > before.h)

    // the other device and the cloud end up with the resurrected record
    await w.converge()
    assert.deepEqual((await laptop.get()).map((x) => x.id).sort(), [1, 2, 3])
    assert.equal(laptop.rec('2').h, back.h, 'same hlc on the laptop')
    const row = w.server.getRow('u1', 'tasks', '2')
    assert.equal(row.deleted_at, null)
    assert.deepEqual(row.body, { id: 2, title: 'Gym 6pm' })
    assert.equal(row.hlc, back.h)
  } finally {
    u.off()
    w.closeAll()
  }
})

test('a tombstone that reached the cloud and the other device is superseded by the undo', async () => {
  const { w, phone, laptop } = await twoDevices()
  const u = wireUndo(phone, await phone.get())
  try {
    w.clock.set(T0 + HOUR)
    await u.del(2)
    await w.converge()
    assert.deepEqual(view(await laptop.get()), [BASE[0], BASE[2]], 'the delete reached the laptop')
    assert.ok(w.server.getRow('u1', 'tasks', '2').deleted_at)
    const tombHlc = laptop.rec('2').h

    w.clock.set(T0 + 2 * HOUR)
    await u.undo()
    await w.converge()
    assert.deepEqual((await laptop.get()).map((x) => x.id).sort(), [1, 2, 3])
    assert.ok(laptop.rec('2').h > tombHlc)
    assert.equal(w.server.getRow('u1', 'tasks', '2').deleted_at, null)
  } finally {
    u.off()
    w.closeAll()
  }
})

test('undo restores into the list as it stands at undo time, and only the undone record changes', async () => {
  const { w, phone, laptop } = await twoDevices()
  const u = wireUndo(phone, await phone.get())
  try {
    w.clock.set(T0 + HOUR)
    await u.del(1)
    // something is added after the delete and before the undo is clicked
    w.clock.set(T0 + 90 * 60_000)
    u.ref.current = [...u.ref.current, { id: 4, title: 'Call bank' }]
    await phone.engine.save('tasks', u.ref.current)
    const untouched = phone.rec('3').h

    w.clock.set(T0 + 2 * HOUR)
    await u.undo()
    assert.deepEqual((await phone.get()).map((x) => x.id).sort(), [1, 2, 3, 4])
    assert.equal(phone.rec('3').h, untouched, 'an unrelated record was not re-stamped by the undo')
    await w.converge()
    assert.deepEqual((await laptop.get()).map((x) => x.id).sort(), [1, 2, 3, 4])
  } finally {
    u.off()
    w.closeAll()
  }
})

// ---- concurrent remote edit ----------------------------------------------------------------

// Phone: delete at DELETE_AT, undo at UNDO_AT. Laptop (offline meanwhile): edit the same
// task at EDIT_AT. Then both reconnect.
async function undoVsRemoteEdit({ editAt, order }) {
  const { w, phone, laptop } = await twoDevices()
  const u = wireUndo(phone, await phone.get())
  try {
    phone.client.setOffline(true)
    laptop.client.setOffline(true)

    const steps = [
      [T0 + 1 * HOUR, () => u.del(2)],
      [T0 + 2 * HOUR, () => u.undo()],
      [editAt, () => laptop.edit((l) => l.map((x) => (x.id === 2 ? { ...x, title: 'Gym 7pm (laptop)' } : x)))],
    ].sort((a, b) => a[0] - b[0])
    for (const [at, run] of steps) {
      w.clock.set(at)
      await run()
    }
    const undoHlc = phone.rec('2').h
    const editHlc = laptop.rec('2').h

    w.clock.set(T0 + 10 * HOUR)
    phone.client.setOffline(false)
    laptop.client.setOffline(false)
    await w.converge(order === 'phone-first' ? [phone, laptop] : [laptop, phone])
    return { w, phone, laptop, undoHlc, editHlc }
  } catch (e) {
    u.off(); w.closeAll()
    throw e
  } finally {
    u.off()
  }
}

for (const order of ['phone-first', 'laptop-first']) {
  test(`remote edit made BEFORE the undo is overwritten by it (${order})`, async () => {
    // the laptop edit lands between the delete and the undo
    const { w, phone, laptop, undoHlc, editHlc } = await undoVsRemoteEdit({ editAt: T0 + 90 * 60_000, order })
    try {
      assert.ok(undoHlc > editHlc, 'the undo is the later write')
      for (const d of [phone, laptop]) {
        assert.deepEqual(byId(await d.get()), BASE, `${d.name}: the undone record is back, unedited`)
        assert.equal(d.rec('2').h, undoHlc)
      }
      assert.deepEqual(w.server.getRow('u1', 'tasks', '2').body, { id: 2, title: 'Gym 6pm' })
    } finally { w.closeAll() }
  })

  test(`remote edit made AFTER the undo overwrites it (${order})`, async () => {
    const { w, phone, laptop, undoHlc, editHlc } = await undoVsRemoteEdit({ editAt: T0 + 3 * HOUR, order })
    try {
      assert.ok(editHlc > undoHlc, 'the remote edit is the later write')
      const want = [BASE[0], { id: 2, title: 'Gym 7pm (laptop)' }, BASE[2]]
      for (const d of [phone, laptop]) {
        assert.deepEqual(byId(await d.get()), want, `${d.name}: the later edit survives the undo`)
        assert.equal(d.rec('2').h, editHlc)
      }
      assert.equal(w.server.getRow('u1', 'tasks', '2').body.title, 'Gym 7pm (laptop)')
    } finally { w.closeAll() }
  })
}

test('a remote edit made before the delete is also overwritten by the later undo (original body returns)', async () => {
  const { w, phone, laptop, undoHlc, editHlc } = await undoVsRemoteEdit({ editAt: T0 + 30 * 60_000, order: 'laptop-first' })
  try {
    assert.ok(undoHlc > editHlc)
    for (const d of [phone, laptop]) assert.deepEqual(byId(await d.get()), BASE, d.name)
  } finally { w.closeAll() }
})
