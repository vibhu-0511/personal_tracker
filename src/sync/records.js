// Pure record-level merge primitives for sync v2. No I/O, no globals: wall time
// is always passed in. Not wired into the live sync path (engine.js); the sync
// tasks that follow will call these.
//
// A record is { collection, id, body, pos, hlc, deviceId, deletedAt }, the
// camelCase mirror of a row in public.records (docs/plan/research/R6-sync-v2.sql).
// A tombstone is a record with body null and deletedAt set; the SQL CHECK
// records_tombstone_chk enforces (deleted_at is null) = (body is not null).
//
// The hlc string format is pinned by the SQL CHECK records_hlc_chk and is
// produced by serialize() in ./hlc.js:
//
//   '<ms: 15 digits>-<counter: 4 lowercase hex>-<node: 1-32 chars>'
//
// so SQL substr(hlc,1,15) and the client agree on the physical part.

import { compare, isValid, parse, MS_DIGITS, DEFAULT_MAX_DRIFT_MS } from './hlc.js'

export { DEFAULT_MAX_DRIFT_MS }

// Same pattern as records_hlc_chk in the SQL.
export const HLC_FORMAT_RE = /^[0-9]{15}-[0-9a-f]{4}-.{1,32}$/

export function isHlcFormat(str) {
  return typeof str === 'string' && HLC_FORMAT_RE.test(str)
}

// Physical part of a stamp, exactly substr(hlc, 1, 15)::bigint in SQL.
export function hlcPhysicalMs(hlc) {
  if (!isHlcFormat(hlc)) throw new TypeError(`records: invalid hlc ${JSON.stringify(hlc)}`)
  return Number(hlc.slice(0, MS_DIGITS))
}

// True when hlc is more than maxDriftMs ahead of wallMs (the forge_push rule:
// physical part <= now + 24h). Invalid stamps count as drifted.
export function isDrifted(hlc, wallMs, maxDriftMs = DEFAULT_MAX_DRIFT_MS) {
  if (!isHlcFormat(hlc)) return true
  return hlcPhysicalMs(hlc) - wallMs > maxDriftMs
}

export function isTombstone(rec) {
  return rec != null && rec.body == null && rec.deletedAt != null
}

// A record that exists and is not deleted.
export function isLive(rec) {
  return rec != null && !isTombstone(rec)
}

// Build a tombstone from a record (or { collection, id }) at a fresh hlc.
// deletedAt is derived from the hlc's physical part, so the call is pure.
export function tombstone(rec, hlc, deviceId = rec && rec.deviceId) {
  if (!isValid(hlc)) throw new TypeError(`records: invalid hlc ${JSON.stringify(hlc)}`)
  if (rec == null || rec.collection == null || rec.id == null) {
    throw new TypeError('records: tombstone needs collection and id')
  }
  return {
    collection: rec.collection,
    id: String(rec.id),
    body: null,
    pos: rec.pos ?? null,
    hlc,
    deviceId,
    deletedAt: new Date(hlcPhysicalMs(hlc)).toISOString(),
  }
}

// Per-record merge decision for a pull or realtime event: apply iff
// incoming.hlc > local.hlc under the total order (ms, counter, node).
//  - no local record: apply (a tombstone is stored too, so an older edit that
//    arrives later cannot resurrect the record)
//  - equal hlc: no-op (own echoes cost nothing)
//  - incoming stamp malformed, or more than maxDriftMs ahead of wallMs: reject
// Pass wallMs: null to skip the drift check. A tombstone is an ordinary record
// here, so it beats an older edit and loses to a newer one.
export function shouldApply(local, incoming, { wallMs = null, maxDriftMs = DEFAULT_MAX_DRIFT_MS } = {}) {
  if (incoming == null || !isHlcFormat(incoming.hlc) || !isValid(incoming.hlc)) return false
  if (wallMs != null && isDrifted(incoming.hlc, wallMs, maxDriftMs)) return false
  if (local == null) return true
  return compare(parse(incoming.hlc), parse(local.hlc)) > 0
}

// Returns the record that should be stored: incoming when shouldApply, else local.
export function merge(local, incoming, opts) {
  return shouldApply(local, incoming, opts) ? incoming : (local ?? null)
}
