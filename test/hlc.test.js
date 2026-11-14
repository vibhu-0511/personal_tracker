import test from 'node:test'
import assert from 'node:assert/strict'
import {
  create, send, receive, compare, serialize, parse, isValid, createClock,
  COUNTER_MAX, DEFAULT_MAX_DRIFT_MS,
} from '../src/sync/hlc.js'

const T0 = 1_700_000_000_000
const MIN = 60 * 1000

test('send: first tick takes the wall time with counter 0', () => {
  const s = send(create('dev-a'), T0)
  assert.deepEqual(s, { ms: T0, counter: 0, node: 'dev-a' })
})

test('send: wall time advancing resets the counter', () => {
  let s = send(create('a'), T0)
  s = send(s, T0)
  assert.equal(s.counter, 1)
  s = send(s, T0 + 5)
  assert.deepEqual(s, { ms: T0 + 5, counter: 0, node: 'a' })
})

test('send: stalled wall time still ticks strictly upward via the counter', () => {
  let s = create('a')
  const seen = []
  for (let i = 0; i < 5; i++) { s = send(s, T0); seen.push(serialize(s)) }
  assert.deepEqual(seen.map((x) => parse(x).counter), [0, 1, 2, 3, 4])
  for (let i = 1; i < seen.length; i++) assert.ok(seen[i] > seen[i - 1])
})

test('send: wall time going backwards never moves the clock back', () => {
  let s = send(create('a'), T0)
  const before = s
  s = send(s, T0 - 30_000)
  assert.equal(s.ms, T0)
  assert.equal(s.counter, 1)
  assert.equal(compare(s, before), 1)
  s = send(s, T0 - 90_000)
  assert.equal(s.ms, T0)
  assert.equal(s.counter, 2)
})

test('send: does not mutate its input', () => {
  const s0 = Object.freeze({ ms: T0, counter: 3, node: 'a' })
  assert.deepEqual(send(s0, T0), { ms: T0, counter: 4, node: 'a' })
  assert.deepEqual(s0, { ms: T0, counter: 3, node: 'a' })
})

test('send: counter overflow rolls into the next millisecond and stays strict', () => {
  const full = { ms: T0, counter: COUNTER_MAX, node: 'a' }
  const next = send(full, T0)
  assert.deepEqual(next, { ms: T0 + 1, counter: 0, node: 'a' })
  assert.equal(compare(next, full), 1)
})

test('receive: remote 10 minutes ahead is adopted and local ticks stay above it', () => {
  const local = send(create('phone'), T0)
  const remote = { ms: T0 + 10 * MIN, counter: 7, node: 'laptop' }
  const merged = receive(local, remote, T0 + 1000)
  assert.deepEqual(merged, { ms: T0 + 10 * MIN, counter: 8, node: 'phone' })
  assert.equal(compare(merged, remote), 1)
  assert.equal(compare(merged, local), 1)
  // wall clock still 10 minutes behind: the next local write is above the remote
  const after = send(merged, T0 + 2000)
  assert.equal(after.ms, T0 + 10 * MIN)
  assert.equal(after.counter, 9)
  assert.equal(compare(after, remote), 1)
})

test('receive: accepts a serialised remote stamp', () => {
  const remote = serialize({ ms: T0 + 10 * MIN, counter: 1, node: 'laptop' })
  const merged = receive(create('phone'), remote, T0)
  assert.deepEqual(merged, { ms: T0 + 10 * MIN, counter: 2, node: 'phone' })
})

test('receive: all three physical times equal takes max counter plus one', () => {
  const local = { ms: T0, counter: 4, node: 'a' }
  assert.equal(receive(local, { ms: T0, counter: 9, node: 'b' }, T0).counter, 10)
  assert.equal(receive(local, { ms: T0, counter: 2, node: 'b' }, T0).counter, 5)
})

test('receive: local ahead of remote and wall bumps the local counter', () => {
  const local = { ms: T0 + 5000, counter: 3, node: 'a' }
  const merged = receive(local, { ms: T0, counter: 50, node: 'b' }, T0 + 10)
  assert.deepEqual(merged, { ms: T0 + 5000, counter: 4, node: 'a' })
})

test('receive: wall time ahead of both resets the counter to 0', () => {
  const local = { ms: T0, counter: 4, node: 'a' }
  const merged = receive(local, { ms: T0 - 1, counter: 9, node: 'b' }, T0 + 100)
  assert.deepEqual(merged, { ms: T0 + 100, counter: 0, node: 'a' })
})

test('receive: counter overflow rolls into the next millisecond', () => {
  const local = { ms: T0, counter: 1, node: 'a' }
  const merged = receive(local, { ms: T0, counter: COUNTER_MAX, node: 'b' }, T0)
  assert.deepEqual(merged, { ms: T0 + 1, counter: 0, node: 'a' })
})

test('receive: rejects a remote more than 24h ahead, tolerates up to the limit', () => {
  const local = send(create('a'), T0)
  const wild = { ms: T0 + DEFAULT_MAX_DRIFT_MS + 1, counter: 0, node: 'phone' }
  assert.throws(() => receive(local, wild, T0), (e) => e instanceof RangeError && e.code === 'HLC_DRIFT')
  const edge = { ms: T0 + DEFAULT_MAX_DRIFT_MS, counter: 0, node: 'phone' }
  assert.equal(receive(local, edge, T0).ms, T0 + DEFAULT_MAX_DRIFT_MS)
  assert.equal(receive(local, wild, T0, { maxDriftMs: Infinity }).ms, wild.ms)
  assert.throws(() => receive(local, { ms: T0 + 11 * MIN, counter: 0, node: 'x' }, T0, { maxDriftMs: 10 * MIN }), /ahead/)
})

test('receive: rejects malformed remotes', () => {
  const local = create('a')
  assert.throws(() => receive(local, 'nope', T0), TypeError)
  assert.throws(() => receive(local, { ms: -1, counter: 0, node: 'b' }, T0), RangeError)
  assert.throws(() => receive(local, { ms: T0, counter: 0x10000, node: 'b' }, T0), RangeError)
})

test('compare: physical time dominates', () => {
  assert.equal(compare({ ms: 1, counter: 9, node: 'z' }, { ms: 2, counter: 0, node: 'a' }), -1)
  assert.equal(compare({ ms: 2, counter: 0, node: 'a' }, { ms: 1, counter: 9, node: 'z' }), 1)
})

test('compare: equal physical time falls to counter, then node id', () => {
  assert.equal(compare({ ms: T0, counter: 1, node: 'z' }, { ms: T0, counter: 2, node: 'a' }), -1)
  assert.equal(compare({ ms: T0, counter: 10, node: 'a' }, { ms: T0, counter: 2, node: 'z' }), 1)
  assert.equal(compare({ ms: T0, counter: 3, node: 'alpha' }, { ms: T0, counter: 3, node: 'beta' }), -1)
  assert.equal(compare({ ms: T0, counter: 3, node: 'beta' }, { ms: T0, counter: 3, node: 'alpha' }), 1)
  assert.equal(compare({ ms: T0, counter: 3, node: 'a' }, { ms: T0, counter: 3, node: 'a' }), 0)
})

test('compare: antisymmetric and agrees on strings and objects', () => {
  const x = { ms: T0, counter: 255, node: 'dev-1' }
  const y = { ms: T0, counter: 256, node: 'dev-1' }
  assert.equal(compare(x, y), -compare(y, x))
  assert.equal(compare(serialize(x), serialize(y)), compare(x, y))
  assert.equal(compare(x, serialize(y)), -1)
})

test('serialize: pinned format 15 digits, 4 hex, node', () => {
  assert.equal(serialize({ ms: 1700000000000, counter: 255, node: 'dev-a' }), '001700000000000-00ff-dev-a')
  assert.equal(serialize({ ms: 0, counter: 0, node: 'x' }), '000000000000000-0000-x')
  assert.match(serialize({ ms: T0, counter: 0xabcd, node: 'n' }), /^[0-9]{15}-[0-9a-f]{4}-.{1,32}$/)
})

test('serialize: rejects out-of-range fields', () => {
  assert.throws(() => serialize({ ms: -1, counter: 0, node: 'a' }), RangeError)
  assert.throws(() => serialize({ ms: 1e15, counter: 0, node: 'a' }), RangeError)
  assert.throws(() => serialize({ ms: 1.5, counter: 0, node: 'a' }), RangeError)
  assert.throws(() => serialize({ ms: T0, counter: -1, node: 'a' }), RangeError)
  assert.throws(() => serialize({ ms: T0, counter: 0x10000, node: 'a' }), RangeError)
  assert.throws(() => serialize({ ms: T0, counter: 0, node: '' }), TypeError)
  assert.throws(() => serialize({ ms: T0, counter: 0, node: 'x'.repeat(33) }), TypeError)
})

test('parse: round-trips, including node ids that contain dashes', () => {
  for (const s of [
    { ms: T0, counter: 0, node: 'dev' },
    { ms: T0, counter: COUNTER_MAX, node: 'my-phone-01' },
    { ms: 0, counter: 0, node: 'backfill' },
    { ms: 999999999999999, counter: 1, node: 'x'.repeat(32) },
  ]) {
    assert.deepEqual(parse(serialize(s)), s)
  }
})

test('parse: rejects malformed input; isValid mirrors it', () => {
  for (const bad of ['', 'abc', '1700000000000-0000-a', '001700000000000-00FF-a', '001700000000000-000-a',
    '001700000000000-0000-', `001700000000000-0000-${'x'.repeat(33)}`, null, undefined, 42]) {
    assert.throws(() => parse(bad), TypeError)
    assert.equal(isValid(bad), false)
  }
  assert.equal(isValid('001700000000000-0000-a'), true)
})

test('string round-trip sorting: lexicographic order equals compare order', () => {
  const stamps = []
  for (const ms of [0, 9, 10, T0 - 1, T0, T0 + 1, T0 + 10 * MIN]) {
    for (const counter of [0, 1, 9, 10, 15, 16, 255, 256, COUNTER_MAX]) {
      for (const node of ['a', 'b', 'backfill', 'dev-1', 'dev-10', 'dev-2']) stamps.push({ ms, counter, node })
    }
  }
  // deterministic shuffle
  let seed = 12345
  const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff
  const shuffled = [...stamps].sort(() => rnd() - 0.5)
  const byString = shuffled.map(serialize).sort().map(parse)
  const byCompare = [...shuffled].sort(compare)
  assert.deepEqual(byString, byCompare)
  assert.equal(new Set(stamps.map(serialize)).size, stamps.length)
})

test('physical part is the first 15 characters (SQL substr(hlc,1,15))', () => {
  const s = serialize({ ms: T0, counter: 3, node: 'dev' })
  assert.equal(Number(s.slice(0, 15)), T0)
})

test('two devices: wrong-clock phone stamps are bounded once the laptop has seen them', () => {
  let laptop = create('laptop')
  let phone = create('phone')
  const phoneStamp = send(phone, T0 + 10 * MIN) // phone clock 10 minutes fast
  laptop = receive(laptop, phoneStamp, T0)
  const laptopEdit = send(laptop, T0 + 1000)
  assert.equal(compare(laptopEdit, phoneStamp), 1) // laptop's later edit wins
})

test('createClock: stateful wrapper emits strictly increasing strings and merges remotes', () => {
  let wall = T0
  const c = createClock({ node: 'dev', now: () => wall })
  const a = c.send()
  const b = c.send() // stalled
  wall -= 5000 // backwards
  const d = c.send()
  assert.ok(a < b && b < d)
  const e = c.receive(serialize({ ms: T0 + 10 * MIN, counter: 0, node: 'other' }))
  assert.ok(e > d)
  assert.equal(c.peek(), e)
  assert.ok(c.send() > e)
})

test('createClock: can resume from a persisted stamp', () => {
  const c = createClock({ node: 'dev', now: () => T0, from: serialize({ ms: T0 + 50, counter: 2, node: 'dev' }) })
  assert.equal(c.send(), serialize({ ms: T0 + 50, counter: 3, node: 'dev' }))
})
