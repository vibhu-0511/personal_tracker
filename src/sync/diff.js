// Pure list diff for sync v2: turn "the caller saved this whole array" into the
// minimal set of record ops. No I/O, no globals: the clock is injected (`stamp`).
// Not wired into the live sync path (engine.js); engine2 will call it.
//
// The bridge rules from docs/plan/research/R6-report.md, enforced here:
//  (a) an op is emitted only for items changed against the version the caller
//      was served; unchanged items emit nothing (stamping untouched records is
//      exactly the whole-key failure of sync v1);
//  (b) only ids that were served to the caller can be tombstoned, so a record
//      that arrived by pull after the caller's last get() survives a stale save;
//  (c) order changes become fractional `pos` changes (midpoint between the
//      neighbours, renumber when the gap is exhausted);
//  (d) an id that is tombstoned but absent from `served` (undo re-add) upserts
//      with a fresh hlc and resurrects.
//
// Items served to the UI carry an enumerable `__v` holding the hlc they were
// read at (it survives {...spread}). `__v` is never part of a stored body.
//
// Contract of diffList's inputs:
//  - next:    the array the caller wants saved (UI shape, ids may be numbers)
//  - current: the record store for the collection, as a Map<id, record> or any
//             iterable of records (live and tombstones)
//  - served:  the items last returned by get() or accepted by the last save
//             (the engine replaces it after each). The diff base is this
//             snapshot, not the current record.

import { isLive, isHlcFormat, tombstone } from './records.js'

// Gap used for appended/prepended items, and for renumbering.
export const POS_STEP = 1024
// A midpoint gap below this counts as exhausted (doubles near POS_STEP have
// ulp ~2e-13, so this leaves a wide safety margin).
export const MIN_POS_GAP = 1e-6

const VERSION_KEY = '__v'

export function stripVersion(item) {
  const { [VERSION_KEY]: _v, ...body } = item
  return body
}

export function deepEqual(a, b) {
  if (Object.is(a, b)) return true
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false
  if (Array.isArray(a) !== Array.isArray(b)) return false
  if (Array.isArray(a)) {
    if (a.length !== b.length) return false
    for (let i = 0; i < a.length; i++) if (!deepEqual(a[i], b[i])) return false
    return true
  }
  const ka = Object.keys(a)
  if (ka.length !== Object.keys(b).length) return false
  for (const k of ka) {
    if (!Object.prototype.hasOwnProperty.call(b, k) || !deepEqual(a[k], b[k])) return false
  }
  return true
}

function cmpRecords(a, b) {
  const pa = Number.isFinite(a.pos) ? a.pos : null
  const pb = Number.isFinite(b.pos) ? b.pos : null
  if (pa !== pb) {
    if (pa == null) return 1
    if (pb == null) return -1
    return pa - pb
  }
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

// Live records as UI items: sorted by (pos, id), body spread, `__v` = hlc read at.
export function materialize(records) {
  return [...records]
    .filter(isLive)
    .sort(cmpRecords)
    .map((r) => ({ ...r.body, [VERSION_KEY]: r.hlc }))
}

function toMap(current) {
  if (current instanceof Map) return current
  const m = new Map()
  for (const r of current ?? []) m.set(String(r.id), r)
  return m
}

// Ids of the longest strictly increasing run of `pos` values over `items`
// ({id, pos}, in list order). Those items keep their position; the rest move.
function longestIncreasing(items) {
  const tails = [] // tails[k] = index into items of the smallest tail of a run of length k+1
  const prev = new Array(items.length).fill(-1)
  for (let i = 0; i < items.length; i++) {
    let lo = 0
    let hi = tails.length
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (items[tails[mid]].pos < items[i].pos) lo = mid + 1
      else hi = mid
    }
    if (lo > 0) prev[i] = tails[lo - 1]
    tails[lo] = i
  }
  const keep = new Set()
  for (let i = tails.length ? tails[tails.length - 1] : -1; i >= 0; i = prev[i]) keep.add(items[i].id)
  return keep
}

// Give every id in `place` a pos between its kept neighbours. `seq` holds ids in
// list order: each is either in `place` or has an entry in `anchorPos`. Returns
// Map<id,pos>, or null when a midpoint is exhausted (caller renumbers).
function assignPositions(seq, anchorPos, place) {
  const out = new Map()
  let L = null
  let i = 0
  while (i < seq.length) {
    if (!place.has(seq[i])) {
      L = anchorPos.get(seq[i])
      i++
      continue
    }
    let j = i
    while (j < seq.length && place.has(seq[j])) j++
    const R = j < seq.length ? anchorPos.get(seq[j]) : null
    const k = j - i
    if (L != null && R != null && !((R - L) / (k + 1) >= MIN_POS_GAP)) return null
    let last = L
    for (let n = 0; n < k; n++) {
      let p
      if (L != null && R != null) p = L + ((R - L) / (k + 1)) * (n + 1)
      else if (L != null) p = L + POS_STEP * (n + 1)
      else if (R != null) p = R - POS_STEP * (k - n)
      else p = POS_STEP * (n + 1)
      if (!Number.isFinite(p) || (last != null && !(p > last)) || (R != null && !(p < R))) return null
      out.set(seq[i + n], p)
      last = p
    }
    i = j
  }
  return out
}

// Renumber the whole list: the caller's order, with live records the caller was
// never served (arrived by pull) kept right after the record that preceded them.
function renumber(seq, current, entryIds, servedIds) {
  const final = [...seq]
  const inFinal = new Set(final)
  const strangers = [...current.values()]
    .filter((r) => isLive(r) && !entryIds.has(r.id) && !servedIds.has(r.id))
    .sort(cmpRecords)
  const byPos = [...current.values()].filter(isLive).sort(cmpRecords)
  for (const s of strangers) {
    let at = -1
    for (const r of byPos) {
      if (r.id === s.id) break
      if (inFinal.has(r.id)) at = final.indexOf(r.id)
    }
    final.splice(at + 1, 0, s.id)
    inFinal.add(s.id)
  }
  const out = new Map()
  final.forEach((id, i) => out.set(id, POS_STEP * (i + 1)))
  return out
}

// Diff a whole-array save into record ops. Returns { ops, renumbered }.
// Each op is a full record { collection, id, body, pos, hlc, deviceId, deletedAt }:
// an upsert has deletedAt null, a tombstone has body null.
//  - ordered: array order is meaningful and is stored as fractional `pos`
//  - idOf:    id accessor (default item.id); the record id is String(id), the
//             body keeps the original value (numeric legacy ids stay numbers)
//  - stamp:   () => fresh hlc string, called once per op
// Duplicate ids inside `next` collapse to the first occurrence (a record store
// holds one row per id).
export function diffList({
  collection,
  next,
  current,
  served = [],
  stamp,
  deviceId,
  ordered = false,
  idOf = (item) => item.id,
}) {
  if (typeof collection !== 'string' || !collection) throw new TypeError('diff: collection required')
  if (typeof stamp !== 'function') throw new TypeError('diff: stamp function required')
  if (!Array.isArray(next)) throw new TypeError('diff: next must be an array')
  const fresh = () => {
    const h = stamp()
    if (!isHlcFormat(h)) throw new TypeError(`diff: stamp() returned invalid hlc ${JSON.stringify(h)}`)
    return h
  }
  const cur = toMap(current)

  const keyOf = (item) => {
    const raw = idOf(item)
    if (raw == null || raw === '') throw new TypeError('diff: item without id')
    return String(raw)
  }

  const servedBody = new Map()
  const servedOrder = []
  for (const item of served) {
    const id = keyOf(item)
    if (servedBody.has(id)) continue
    servedBody.set(id, stripVersion(item))
    servedOrder.push(id)
  }

  // 1. Classify each item of `next` against its served base.
  const entries = []
  const seen = new Set()
  for (const item of next) {
    const id = keyOf(item)
    if (seen.has(id)) continue
    seen.add(id)
    const body = stripVersion(item)
    const rec = cur.get(id)
    const live = isLive(rec)
    let write
    if (servedBody.has(id)) write = !deepEqual(body, servedBody.get(id))
    else if (live) write = !deepEqual(body, rec.body) // arrived by pull, caller supplied the same id
    else write = true // brand new, or undo re-add over a tombstone
    // Served, unchanged, and tombstoned remotely: a stale copy, not an edit. Leave the delete alone.
    if (!write && !live) continue
    entries.push({ id, body, rec, live, write })
  }
  const entryIds = new Set(entries.map((e) => e.id))
  const servedIds = new Set(servedOrder)

  // 2. Positions.
  let posMap = new Map()
  let renumbered = false
  if (ordered && entries.length) {
    const seqAll = entries.map((e) => e.id)
    const eligible = entries
      .filter((e) => e.live && Number.isFinite(e.rec.pos))
      .map((e) => ({ id: e.id, pos: e.rec.pos }))
    const keep = longestIncreasing(eligible)
    // Reorder intent: the served ids appear in a different relative order than they were served in.
    const servedNow = seqAll.filter((id) => servedIds.has(id))
    const servedThen = servedOrder.filter((id) => entryIds.has(id))
    const reordered = servedNow.some((id, i) => id !== servedThen[i])
    const anchorPos = new Map()
    const place = new Set()
    const seq = []
    for (const e of entries) {
      const isEligible = e.live && Number.isFinite(e.rec.pos)
      if (isEligible && keep.has(e.id)) {
        anchorPos.set(e.id, e.rec.pos)
        seq.push(e.id)
      } else if (!isEligible || reordered) {
        place.add(e.id)
        seq.push(e.id)
      } // else: out of order in the store because of a remote reorder; the caller did not move it
    }
    const assigned = assignPositions(seq, anchorPos, place)
    if (assigned) {
      posMap = assigned
    } else {
      renumbered = true
      posMap = renumber(seqAll, cur, entryIds, servedIds)
    }
  }

  // 3. Ops.
  const ops = []
  for (const e of entries) {
    const newPos = posMap.get(e.id)
    const posChanged = newPos !== undefined && !(e.live && e.rec.pos === newPos)
    if (!e.write && !posChanged) continue
    ops.push({
      collection,
      id: e.id,
      // A pos-only change keeps the stored body so it cannot revert a remote edit.
      body: e.write ? e.body : e.rec.body,
      pos: posChanged ? newPos : (e.rec?.pos ?? null),
      hlc: fresh(),
      deviceId: deviceId ?? e.rec?.deviceId,
      deletedAt: null,
    })
  }
  if (renumbered) {
    for (const [id, pos] of posMap) {
      if (entryIds.has(id)) continue
      const rec = cur.get(id)
      if (!isLive(rec) || rec.pos === pos) continue
      ops.push({ ...rec, pos, hlc: fresh(), deviceId: deviceId ?? rec.deviceId, deletedAt: null })
    }
  }

  // 4. Tombstones: only ids that were served to the caller and are now gone from `next`.
  for (const id of servedOrder) {
    if (seen.has(id)) continue
    const rec = cur.get(id)
    if (!isLive(rec)) continue
    ops.push(tombstone(rec, fresh(), deviceId ?? rec.deviceId))
  }

  return { ops, renumbered }
}
