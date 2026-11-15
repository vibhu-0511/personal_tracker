import test from 'node:test'
import assert from 'node:assert/strict'
import { diffList, materialize, deepEqual, POS_STEP } from '../src/sync/diff.js'
import { createClock } from '../src/sync/hlc.js'
import { isHlcFormat, isTombstone, shouldApply } from '../src/sync/records.js'
import { placeItem } from '../src/dnd/logic.js'

const COL = 'tasks'
const DEV = 'dev-a'

function clockAt(start = 2_000_000_000_000) {
  let t = start
  const clock = createClock({ node: 'devA', now: () => t })
  return () => clock.send()
}

function rec(id, body, pos, hlc) {
  return { collection: COL, id: String(id), body, pos, hlc, deviceId: 'dev-b', deletedAt: null }
}

const H0 = '001900000000000-0000-seed'

function store(...records) {
  return new Map(records.map((r) => [r.id, r]))
}

function run(opts) {
  return diffList({ collection: COL, deviceId: DEV, ordered: true, stamp: clockAt(), ...opts })
}

// a(1) b(2) c(3) as served to the caller
function fixture() {
  const current = store(
    rec('a', { id: 'a', title: 'A' }, 1, H0),
    rec('b', { id: 'b', title: 'B' }, 2, H0),
    rec('c', { id: 'c', title: 'C' }, 3, H0),
  )
  return { current, served: materialize(current.values()) }
}

test('materialize: sorted by pos, __v holds the hlc and survives spread', () => {
  const { current, served } = fixture()
  assert.deepEqual(served.map((i) => i.id), ['a', 'b', 'c'])
  assert.equal(served[0].__v, H0)
  assert.equal({ ...served[0], title: 'x' }.__v, H0)
  assert.equal(Object.keys(served[0]).includes('__v'), true)
  current.set('b', { ...current.get('b'), body: null, deletedAt: '2026-01-01T00:00:00.000Z' })
  assert.deepEqual(materialize(current.values()).map((i) => i.id), ['a', 'c'])
})

test('unchanged items emit no op (also through a spread copy)', () => {
  const { current, served } = fixture()
  const { ops, renumbered } = run({ next: served.map((i) => ({ ...i })), current, served })
  assert.deepEqual(ops, [])
  assert.equal(renumbered, false)
})

test('edit emits exactly one upsert with the fresh hlc and unchanged pos', () => {
  const { current, served } = fixture()
  const next = served.map((i) => (i.id === 'b' ? { ...i, title: 'B!' } : i))
  const { ops } = run({ next, current, served })
  assert.equal(ops.length, 1)
  const [op] = ops
  assert.equal(op.id, 'b')
  assert.deepEqual(op.body, { id: 'b', title: 'B!' }) // no __v in the stored body
  assert.equal(op.pos, 2)
  assert.equal(op.deletedAt, null)
  assert.equal(op.collection, COL)
  assert.equal(op.deviceId, DEV)
  assert.ok(isHlcFormat(op.hlc))
  assert.ok(op.hlc > H0)
  assert.equal(shouldApply(current.get('b'), op), true)
})

test('removal emits one tombstone, only for ids that were served', () => {
  const { current, served } = fixture()
  const next = served.filter((i) => i.id !== 'b')
  const { ops } = run({ next, current, served })
  assert.equal(ops.length, 1)
  assert.equal(ops[0].id, 'b')
  assert.equal(isTombstone(ops[0]), true)
  assert.equal(ops[0].body, null)
  assert.ok(ops[0].hlc > H0)
  assert.equal(shouldApply(current.get('b'), ops[0]), true)
})

test('a record that arrived by pull after the last get() is never tombstoned by a stale save', () => {
  const { current, served } = fixture()
  // pull brings d and a remote edit of c after the caller's get()
  current.set('d', rec('d', { id: 'd', title: 'D' }, 4, '001900000000001-0000-seed'))
  current.set('c', rec('c', { id: 'c', title: 'C remote' }, 3, '001900000000002-0000-seed'))
  // the stale caller saves its old array with only `a` edited
  const next = served.map((i) => (i.id === 'a' ? { ...i, title: 'A!' } : i))
  const { ops } = run({ next, current, served })
  assert.deepEqual(ops.map((o) => o.id), ['a']) // not d (never served), not c (unchanged vs served base)
  assert.equal(ops.some(isTombstone), false)
  // even an explicit removal of everything served leaves d alone
  const wipe = run({ next: [], current, served })
  assert.deepEqual(wipe.ops.map((o) => o.id).sort(), ['a', 'b', 'c'])
  assert.equal(wipe.ops.every(isTombstone), true)
})

test('a stale unchanged copy does not resurrect a record deleted remotely', () => {
  const { current, served } = fixture()
  current.set('b', { ...current.get('b'), body: null, deletedAt: '2026-01-01T00:00:00.000Z', hlc: '001900000000003-0000-seed' })
  const { ops } = run({ next: served, current, served })
  assert.deepEqual(ops, [])
})

test('placeItem() reorder emits one pos change, keeping the stored body', () => {
  const { current, served } = fixture()
  const next = placeItem(served, 'a', 'c', { after: true }) // b c a
  assert.deepEqual(next.map((i) => i.id), ['b', 'c', 'a'])
  const { ops, renumbered } = run({ next, current, served })
  assert.equal(renumbered, false)
  assert.equal(ops.length, 1)
  assert.equal(ops[0].id, 'a')
  assert.ok(ops[0].pos > 3)
  assert.deepEqual(ops[0].body, { id: 'a', title: 'A' })

  const mid = placeItem(served, 'c', 'b') // a c b
  const r2 = run({ next: mid, current, served })
  assert.equal(r2.ops.length, 1)
  assert.equal(r2.ops[0].id, 'c')
  assert.ok(r2.ops[0].pos > 1 && r2.ops[0].pos < 2)
})

test('a pos-only change does not revert a remote edit of that record', () => {
  const { current, served } = fixture()
  current.set('a', rec('a', { id: 'a', title: 'A remote' }, 1, '001900000000002-0000-seed'))
  const next = placeItem(served, 'a', 'c', { after: true })
  const { ops } = run({ next, current, served })
  assert.equal(ops.length, 1)
  assert.deepEqual(ops[0].body, { id: 'a', title: 'A remote' })
})

test('prepend emits one pos change: new item and moved existing item', () => {
  const { current, served } = fixture()
  const added = run({ next: [{ id: 'n', title: 'N' }, ...served], current, served })
  assert.equal(added.ops.length, 1)
  assert.equal(added.ops[0].id, 'n')
  assert.deepEqual(added.ops[0].body, { id: 'n', title: 'N' })
  assert.ok(added.ops[0].pos < 1)

  const moved = run({ next: placeItem(served, 'c', 'a'), current, served }) // c a b
  assert.equal(moved.ops.length, 1)
  assert.equal(moved.ops[0].id, 'c')
  assert.ok(moved.ops[0].pos < 1)
})

test('append and insert between get midpoint positions; empty store starts at the step', () => {
  const { current, served } = fixture()
  const between = run({ next: [served[0], { id: 'n', title: 'N' }, ...served.slice(1)], current, served })
  assert.equal(between.ops.length, 1)
  assert.equal(between.ops[0].pos, 1.5)
  const end = run({ next: [...served, { id: 'z' }], current, served })
  assert.equal(end.ops.length, 1)
  assert.equal(end.ops[0].pos, 3 + POS_STEP)
  const first = run({ next: [{ id: 'x' }, { id: 'y' }], current: store(), served: [] })
  assert.deepEqual(first.ops.map((o) => o.pos), [POS_STEP, 2 * POS_STEP])
})

test('undo re-add emits an upsert that resurrects the tombstone', () => {
  const { current, served } = fixture()
  const item = served[1] // b, read at H0
  // delete: save without b, then the engine applies the tombstone and refreshes `served`
  const stamp = clockAt()
  const del = run({ next: served.filter((i) => i.id !== 'b'), current, served, stamp })
  assert.equal(del.ops.length, 1)
  const tomb = del.ops[0]
  current.set('b', tomb)
  const served2 = materialize(current.values())
  assert.deepEqual(served2.map((i) => i.id), ['a', 'c'])
  // undo: persist([item, ...latest]), the item still carries its old __v
  const { ops } = run({ next: [item, ...served2], current, served: served2, stamp })
  assert.equal(ops.length, 1)
  const [op] = ops
  assert.equal(op.id, 'b')
  assert.equal(isTombstone(op), false)
  assert.equal(op.deletedAt, null)
  assert.deepEqual(op.body, { id: 'b', title: 'B' })
  assert.ok(op.pos < 1) // prepended, not the old tombstone pos
  assert.ok(op.hlc > tomb.hlc)
  assert.equal(shouldApply(current.get('b'), op), true)
})

test('midpoint exhaustion triggers renumbering of the whole list', () => {
  const current = store(
    rec('a', { id: 'a' }, 1, H0),
    rec('b', { id: 'b' }, 1 + 1e-7, H0),
    rec('s', { id: 's' }, 5, H0), // pulled, never served
  )
  const served = materialize([current.get('a'), current.get('b')])
  const { ops, renumbered } = run({ next: [served[0], { id: 'n' }, served[1]], current, served })
  assert.equal(renumbered, true)
  const pos = Object.fromEntries(ops.map((o) => [o.id, o.pos]))
  assert.ok(pos.a < pos.n && pos.n < pos.b)
  assert.ok(pos.b < pos.s) // the unserved record stays after b
  assert.equal(ops.find((o) => o.id === 's').body.id, 's')
  assert.ok(ops.every((o) => o.pos % 1 === 0))
})

test('repeated inserts at the same spot eventually renumber and keep the order', () => {
  let current = store(rec('a', { id: 'a' }, 1, H0), rec('z', { id: 'z' }, 2, H0))
  let sawRenumber = false
  const stamp = clockAt()
  for (let n = 0; n < 60; n++) {
    const served = materialize(current.values())
    const next = [served[0], { id: `n${n}` }, ...served.slice(1)]
    const r = diffList({ collection: COL, deviceId: DEV, ordered: true, stamp, next, current, served })
    sawRenumber ||= r.renumbered
    for (const op of r.ops) current.set(op.id, op)
    const got = materialize(current.values()).map((i) => i.id)
    assert.equal(got[0], 'a')
    assert.equal(got[1], `n${n}`)
    assert.equal(got.at(-1), 'z')
    assert.equal(got.length, n + 3)
  }
  assert.equal(sawRenumber, true)
})

test('numeric legacy ids are stringified for the record id but kept in the body', () => {
  const current = store(rec('1700000000001', { id: 1700000000001, text: 'old' }, 1, H0))
  const served = materialize(current.values())
  assert.equal(served[0].id, 1700000000001)
  // unchanged: no op
  assert.deepEqual(run({ next: served, current, served }).ops, [])
  // edit + new numeric id + removal
  const next = [{ ...served[0], text: 'new' }, { id: 1700000000002, text: 'x' }]
  const { ops } = run({ next, current, served })
  assert.deepEqual(ops.map((o) => o.id), ['1700000000001', '1700000000002'])
  assert.equal(typeof ops[0].id, 'string')
  assert.equal(ops[0].body.id, 1700000000001)
  assert.equal(ops[1].body.id, 1700000000002)
  const del = run({ next: [], current, served })
  assert.equal(del.ops.length, 1)
  assert.equal(del.ops[0].id, '1700000000001')
  assert.equal(isTombstone(del.ops[0]), true)
})

test('unordered collections leave pos untouched; duplicates collapse; bad input throws', () => {
  const current = store(rec('a', { id: 'a', n: 1 }, null, H0), rec('b', { id: 'b', n: 2 }, null, H0))
  const served = materialize(current.values())
  const swapped = diffList({ collection: COL, deviceId: DEV, stamp: clockAt(), next: [served[1], served[0]], current, served })
  assert.deepEqual(swapped.ops, [])
  const dup = diffList({
    collection: COL, deviceId: DEV, stamp: clockAt(), current, served,
    next: [{ ...served[0], n: 9 }, { ...served[0], n: 10 }, served[1]],
  })
  assert.equal(dup.ops.length, 1)
  assert.equal(dup.ops[0].body.n, 9)
  assert.equal(dup.ops[0].pos, null)
  assert.throws(() => diffList({ collection: COL, next: [{ id: 'q' }], current, stamp: () => 'bad' }), /invalid hlc/)
  assert.throws(() => diffList({ collection: COL, next: [{ title: 'no id' }], current, stamp: clockAt() }), /without id/)
  assert.throws(() => diffList({ collection: COL, next: [], current }), /stamp/)
})

test('deepEqual ignores key order and compares nested values', () => {
  assert.equal(deepEqual({ a: 1, b: [1, { c: 2 }] }, { b: [1, { c: 2 }], a: 1 }), true)
  assert.equal(deepEqual({ a: 1 }, { a: 1, b: undefined }), false)
  assert.equal(deepEqual([1, 2], [1, 3]), false)
  assert.equal(deepEqual(null, {}), false)
})
