// Pure hybrid logical clock (HLC). No I/O, no globals: the wall clock is always
// passed in, so every branch is unit testable. Wiring into the sync engine
// belongs to the sync tasks, not this module.
//
// A stamp is { ms, counter, node }. Serialised form (pinned by the SQL CHECK
// records_hlc_chk in docs/plan/research/R6-sync-v2.sql):
//
//   '<ms: 15 digits>-<counter: 4 lowercase hex>-<node: 1-32 chars>'
//
// ms and counter are fixed width, so plain string comparison (SQL collate "C",
// JS < >) equals causal order, and substr(hlc,1,15) is the physical part.
// Ties on ms fall to counter, then to node id, so ordering is total and
// deterministic across devices.

export const MS_DIGITS = 15
export const COUNTER_MAX = 0xffff
export const MAX_MS = 10 ** MS_DIGITS - 1
export const NODE_MAX_LENGTH = 32
// A remote stamp further ahead of local wall time than this is refused on receive.
export const DEFAULT_MAX_DRIFT_MS = 24 * 60 * 60 * 1000

const HLC_RE = /^([0-9]{15})-([0-9a-f]{4})-(.{1,32})$/

function assertMs(ms, label) {
  if (!Number.isInteger(ms) || ms < 0 || ms > MAX_MS) {
    throw new RangeError(`hlc: ${label} must be an integer in 0..${MAX_MS}, got ${ms}`)
  }
}

function assertNode(node) {
  if (typeof node !== 'string' || node.length < 1 || node.length > NODE_MAX_LENGTH) {
    throw new TypeError(`hlc: node must be a string of 1..${NODE_MAX_LENGTH} chars`)
  }
}

// Fresh clock state for a device. ms 0 means "has not ticked yet".
export function create(node) {
  assertNode(node)
  return { ms: 0, counter: 0, node }
}

// Advance one step for a local event or outgoing write. Returns a new state;
// the input is never mutated. Strictly greater than the input even when wall
// time stalls or goes backwards. If the counter would overflow 4 hex digits,
// ms moves forward by 1 and the counter resets, which keeps the order strict.
export function send(state, wallMs) {
  assertMs(wallMs, 'wallMs')
  const { ms, counter, node } = state
  if (wallMs > ms) return { ms: wallMs, counter: 0, node }
  if (counter >= COUNTER_MAX) return { ms: ms + 1, counter: 0, node }
  return { ms, counter: counter + 1, node }
}

// Merge a remote stamp (object or serialised string) into local state. The
// result is strictly greater than both the local state and the remote stamp.
// Throws a RangeError (code 'HLC_DRIFT') when remote.ms is more than maxDriftMs
// ahead of wallMs, so one wrong-clock device cannot drag every other clock
// forward. Pass maxDriftMs: Infinity to disable the check.
export function receive(state, remote, wallMs, { maxDriftMs = DEFAULT_MAX_DRIFT_MS } = {}) {
  assertMs(wallMs, 'wallMs')
  const r = typeof remote === 'string' ? parse(remote) : remote
  assertMs(r.ms, 'remote.ms')
  if (!Number.isInteger(r.counter) || r.counter < 0 || r.counter > COUNTER_MAX) {
    throw new RangeError(`hlc: remote.counter must be an integer in 0..${COUNTER_MAX}`)
  }
  if (r.ms - wallMs > maxDriftMs) {
    const err = new RangeError(`hlc: remote clock is ${r.ms - wallMs}ms ahead (max ${maxDriftMs}ms)`)
    err.code = 'HLC_DRIFT'
    throw err
  }
  const { node } = state
  const ms = Math.max(state.ms, r.ms, wallMs)
  let counter
  if (ms === state.ms && ms === r.ms) counter = Math.max(state.counter, r.counter) + 1
  else if (ms === state.ms) counter = state.counter + 1
  else if (ms === r.ms) counter = r.counter + 1
  else counter = 0
  if (counter > COUNTER_MAX) return { ms: ms + 1, counter: 0, node }
  return { ms, counter, node }
}

// Total order: ms, then counter, then node id (code unit order, matching
// collate "C" for ASCII node ids). Works on stamp objects or serialised strings.
export function compare(a, b) {
  const x = typeof a === 'string' ? parse(a) : a
  const y = typeof b === 'string' ? parse(b) : b
  if (x.ms !== y.ms) return x.ms < y.ms ? -1 : 1
  if (x.counter !== y.counter) return x.counter < y.counter ? -1 : 1
  if (x.node === y.node) return 0
  return x.node < y.node ? -1 : 1
}

export function serialize({ ms, counter, node }) {
  assertMs(ms, 'ms')
  if (!Number.isInteger(counter) || counter < 0 || counter > COUNTER_MAX) {
    throw new RangeError(`hlc: counter must be an integer in 0..${COUNTER_MAX}, got ${counter}`)
  }
  assertNode(node)
  return `${String(ms).padStart(MS_DIGITS, '0')}-${counter.toString(16).padStart(4, '0')}-${node}`
}

// Inverse of serialize. Throws a TypeError on anything that does not match the
// pinned format, so a corrupt value never silently enters the clock.
export function parse(str) {
  const m = typeof str === 'string' ? HLC_RE.exec(str) : null
  if (!m) throw new TypeError(`hlc: invalid stamp ${JSON.stringify(str)}`)
  return { ms: Number(m[1]), counter: parseInt(m[2], 16), node: m[3] }
}

export function isValid(str) {
  return typeof str === 'string' && HLC_RE.test(str)
}

// Small stateful convenience over the pure functions. now is injectable.
// Optionally resume from a persisted stamp string via `from`.
export function createClock({ node, now = Date.now, from = null } = {}) {
  let state = create(node)
  if (from != null) state = { ...parse(from), node }
  return {
    get state() { return state },
    send() { state = send(state, now()); return serialize(state) },
    receive(remote, opts) { state = receive(state, remote, now(), opts); return serialize(state) },
    peek() { return serialize(state) },
  }
}
