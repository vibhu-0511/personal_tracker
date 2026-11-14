// Sync v2 engine, local half: a record store over the localforage-style db,
// get/save/update with materialisation back to the v1 blob shape, subscribe,
// and a cross-tab write guard. NOT wired into src/store.js or the running app:
// v1 (engine.js) stays the only active engine. The network half (drain, delta
// pull, realtime) is R6-08 and builds on what this returns (outbox, clock).
//
// Local layout (docs/plan/research/R6-report.md):
//   r2:<collection>  { recs: { [id]: { b: body, h: hlc, d: deletedAt, p: pos } } }
//   r2:outbox        outbox.snapshot(): dirty (collection, id, hlc) only, no payloads
//   r2:meta          { cursor, userId, deviceId, lastPullAt }
// A record's deviceId is the node part of its hlc (hlc node = deviceId), so it
// is not stored twice.
//
// API (same signatures as createSyncEngine for get/save, mutate is `update`):
//   get(key, fallback)        blob in the v1 shape (adapters.fromEntries)
//   save(key, next)           diff against the served snapshot, write only the
//                             changed records plus their dirty marks, then resolve
//   update(key, fn, fallback) serialised read-modify-write per key
//   subscribe(key, fn)        fn(blob) once per change, always a new reference
//
// THE SERVED-SNAPSHOT RULE (src/sync/diff.js): the diff base is what the caller
// was last handed, not the current store. So the per-key served snapshot is
// replaced after EVERY get, every save (with the array that save accepted) and
// every subscriber emission (which hands out a blob). Records that arrive by
// pull after the caller's last get are therefore never tombstoned by a stale save.
//
// Concurrency:
//  - per key, get/save/update run through one promise queue, so two concurrent
//    update() calls on a key both survive;
//  - every write (and update's whole read-modify-write) runs inside the injected
//    `lock(name, fn)` (Web Locks in the app), re-reading records and the outbox
//    from the db first, so a second tab's write is merged, not overwritten. This
//    also makes the hlc strictly increase across tabs of one device (they share
//    a node id): the clock observes every stored hlc it loads;
//  - after persisting, the write is announced on the injected `bus`
//    (BroadcastChannel); other engines drop their cache for those collections,
//    reload, and notify their subscribers.
//  - update(fn) holds the lock while fn runs; fn must not call back into the
//    engine for the same key (it would wait on its own queue).
//
// Write failures (db.setItem rejects) mirror v1: save/update still resolve, the
// key is marked failed, onLocalWriteError(key, err) is called, and the edit stays
// in memory. The affected collections are re-persisted whole on the next write.

import { createOutbox } from './outbox.js'
import { createClock } from './hlc.js'
import { diffList } from './diff.js'
import { isLive, isHlcFormat } from './records.js'
import { adapterFor, COLLECTION_TO_KEY } from './adapters.js'

export const LOCK_NAME = 'forge-r2-write'
export const BUS_TYPE = 'r2:write'
export const META_KEY = 'r2:meta'
export const OUTBOX_KEY = 'r2:outbox'
export const collectionKey = (collection) => `r2:${collection}`

// hlc = '<15 digits>-<4 hex>-<node>'; the node starts at index 21.
const nodeOf = (hlc) => hlc.slice(21)

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
const clone = (v) => (v === undefined ? v : structuredClone(v))

function fromStored(collection, id, s) {
  return {
    collection,
    id,
    body: s.b ?? null,
    pos: Number.isFinite(s.p) ? s.p : null,
    hlc: s.h,
    deviceId: nodeOf(s.h),
    deletedAt: s.d ?? null,
  }
}

function toStored(rec) {
  return { b: rec.body ?? null, h: rec.hlc, d: rec.deletedAt ?? null, p: rec.pos ?? null }
}

// diffList's body is the item itself, which cannot hold a bare false/0 map value
// or the id-less habit check-in body. Items are wrapped as { id, w: body } on the
// way in and the ops unwrapped on the way out; the stored body is never wrapped.
const wrapRec = (rec) => (isLive(rec) ? { ...rec, body: { id: rec.id, w: rec.body } } : rec)
const unwrapOp = (op) => ({ ...op, body: op.body == null ? null : op.body.w })

function defaultLock() {
  const locks = globalThis.navigator?.locks
  if (locks && typeof locks.request === 'function') return (name, fn) => locks.request(name, fn)
  return (_name, fn) => fn()
}

function defaultBus() {
  return typeof globalThis.BroadcastChannel === 'function' ? new globalThis.BroadcastChannel('forge-r2') : null
}

function defaultId() {
  // 32 hex chars: valid as an hlc node (1..32 chars).
  return globalThis.crypto.randomUUID().replaceAll('-', '')
}

export function createEngine2({
  db,
  cloud = null, // used by the network half (R6-08); unused here
  now = Date.now,
  lock = defaultLock(),
  bus = defaultBus(),
  onLocalWriteError,
  random = Math.random,
  newId = defaultId,
  outboxOptions = {},
} = {}) {
  if (!db) throw new TypeError('engine2: db required')

  let meta = null
  let clock = null
  let outbox = null
  let initP = null
  const tabId = newId()

  const cache = new Map() // collection -> Map<id, record>
  const unpersisted = new Set() // collections whose memory state is ahead of the db
  const served = new Map() // key -> blob last handed to the caller
  const queues = new Map() // key -> tail promise
  const subs = new Map() // key -> Set<fn>
  const failed = new Set()
  const statusListeners = new Set()
  const inflight = new Set()

  // ---- status ----------------------------------------------------------------

  function setKeyFailed(key, isFailed) {
    const had = failed.size > 0
    if (isFailed) failed.add(key)
    else failed.delete(key)
    const has = failed.size > 0
    if (had !== has) statusListeners.forEach((fn) => fn(has))
  }

  function onStatusChange(fn) {
    statusListeners.add(fn)
    fn(failed.size > 0)
    return () => statusListeners.delete(fn)
  }

  // ---- init: meta, clock, outbox ----------------------------------------------

  async function readOutboxSnapshot() {
    const raw = await db.getItem(OUTBOX_KEY)
    return raw && typeof raw === 'object' ? raw : null
  }

  function init() {
    if (!initP) {
      initP = (async () => {
        // Under the lock so two tabs starting together agree on one deviceId.
        await lock(LOCK_NAME, async () => {
          const stored = await db.getItem(META_KEY)
          meta = {
            cursor: null, userId: null, lastPullAt: null,
            ...(isObj(stored) ? stored : {}),
          }
          if (typeof meta.deviceId !== 'string' || !meta.deviceId) {
            meta.deviceId = newId()
            try {
              await db.setItem(META_KEY, meta)
            } catch (err) {
              setKeyFailed(META_KEY, true)
              onLocalWriteError?.(META_KEY, err)
            }
          }
        })
        clock = createClock({ node: meta.deviceId, now })
        outbox = createOutbox({ now, random, ...outboxOptions, initial: await readOutboxSnapshot() })
        bus?.addEventListener?.('message', onBusMessage)
      })()
      initP.catch(() => { initP = null }) // a failed init may be retried
    }
    return initP
  }

  // ---- record store ------------------------------------------------------------

  // Make the clock exceed every stored stamp it loads, so a device clock that
  // went backwards (or another tab's stamp) cannot make a new edit lose.
  function observe(map) {
    let max = null
    for (const rec of map.values()) if (max === null || rec.hlc > max) max = rec.hlc
    if (max !== null && max > clock.peek()) {
      try {
        clock.receive(max, { maxDriftMs: Infinity })
      } catch { /* an unusable stamp cannot be observed */ }
    }
  }

  async function readCollection(collection) {
    const raw = await db.getItem(collectionKey(collection))
    const map = new Map()
    const recs = raw && isObj(raw.recs) ? raw.recs : {}
    for (const [id, s] of Object.entries(recs)) {
      if (!isObj(s) || !isHlcFormat(s.h)) continue // malformed row: treat as absent
      map.set(id, fromStored(collection, id, s))
    }
    return map
  }

  // fresh: re-read from the db (inside the write lock). A collection whose last
  // persist failed keeps its memory state, which is ahead of the db.
  async function loadCollection(collection, { fresh = false } = {}) {
    const have = cache.get(collection)
    if (have && (!fresh || unpersisted.has(collection))) return have
    const map = await readCollection(collection)
    observe(map)
    cache.set(collection, map)
    return map
  }

  async function mergeOutboxFromDb() {
    const raw = await readOutboxSnapshot()
    for (const [collection, id, hlc] of raw?.dirty ?? []) {
      if (!outbox.has(collection, id) || outbox.hlcOf(collection, id) < hlc) outbox.mark(collection, id, hlc)
    }
  }

  function blobFromCache(key, fallback) {
    const adapter = adapterFor(key)
    const recs = adapter.collections.flatMap((c) => [...(cache.get(c)?.values() ?? [])])
    if (recs.length === 0) return fallback
    return clone(adapter.fromEntries(recs))
  }

  async function materialise(key, fallback, { fresh = false } = {}) {
    for (const c of adapterFor(key).collections) await loadCollection(c, { fresh })
    return blobFromCache(key, fallback)
  }

  // ---- subscribe ---------------------------------------------------------------

  function subscribe(key, fn) {
    adapterFor(key)
    if (typeof fn !== 'function') throw new TypeError('engine2: subscribe needs a function')
    let set = subs.get(key)
    if (!set) subs.set(key, (set = new Set()))
    set.add(fn)
    return () => set.delete(fn)
  }

  // Hand the current blob to subscribers. A blob handed out is a served blob.
  function emit(key) {
    const set = subs.get(key)
    if (!set || set.size === 0) return
    const blob = blobFromCache(key, adapterFor(key).empty())
    served.set(key, clone(blob))
    for (const fn of [...set]) {
      try {
        fn(blob)
      } catch { /* a throwing subscriber must not break the others */ }
    }
  }

  // ---- write path --------------------------------------------------------------

  function assertShape(key, next) {
    const ok = Array.isArray(adapterFor(key).empty()) ? Array.isArray(next) : isObj(next)
    if (!ok) throw new TypeError(`engine2: save(${JSON.stringify(key)}) got the wrong shape`)
  }

  // Must be called with the write lock held and init done.
  async function writeLocked(key, next) {
    assertShape(key, next)
    const adapter = adapterFor(key)
    await mergeOutboxFromDb()
    const maps = new Map()
    for (const c of adapter.collections) maps.set(c, await loadCollection(c, { fresh: true }))

    const nextEntries = adapter.toEntries(next)
    const servedEntries = adapter.toEntries(served.get(key) ?? adapter.empty())
    const ops = []
    for (const c of adapter.collections) {
      const items = (entries) => entries.filter((e) => e.collection === c).map((e) => ({ id: e.id, w: e.body }))
      const servedItems = items(servedEntries)
      const nextItems = items(nextEntries)
      const current = new Map([...maps.get(c)].map(([id, rec]) => [id, wrapRec(rec)]))
      const ordered = [...nextEntries, ...servedEntries].some((e) => e.collection === c && e.pos != null)
      const { ops: collOps } = diffList({
        collection: c,
        next: nextItems,
        served: servedItems,
        current,
        stamp: () => clock.send(),
        deviceId: meta.deviceId,
        ordered,
      })
      for (const op of collOps) ops.push(unwrapOp(op))
    }

    // The caller's array is now the served base, whether or not anything changed.
    served.set(key, clone(next))
    if (ops.length === 0) return false

    const touched = new Set()
    for (const op of ops) {
      maps.get(op.collection).set(op.id, { ...op })
      outbox.mark(op.collection, op.id, op.hlc)
      touched.add(op.collection)
    }

    // Anything a failed earlier write left only in memory is persisted with this one.
    const toWrite = new Set([...touched, ...unpersisted])
    try {
      for (const c of toWrite) {
        const recs = {}
        for (const [id, rec] of cache.get(c)) recs[id] = toStored(rec)
        await db.setItem(collectionKey(c), { recs })
      }
      await db.setItem(OUTBOX_KEY, outbox.snapshot())
      unpersisted.clear()
      setKeyFailed(key, false)
    } catch (err) {
      for (const c of touched) unpersisted.add(c)
      setKeyFailed(key, true)
      onLocalWriteError?.(key, err)
      emit(key)
      return true
    }

    emit(key)
    try {
      bus?.postMessage({ type: BUS_TYPE, from: tabId, collections: [...touched] })
    } catch { /* other tabs reload on their next write or start */ }
    return true
  }

  function enqueue(key, task) {
    const prev = queues.get(key) || Promise.resolve()
    const run = prev.then(task)
    queues.set(key, run.then(() => undefined, () => undefined))
    return run
  }

  async function get(key, fallback) {
    adapterFor(key)
    return enqueue(key, async () => {
      await init()
      const blob = await materialise(key, fallback)
      // Served snapshot is replaced after every get (diff.js contract).
      served.set(key, clone(blob === fallback ? adapterFor(key).empty() : blob))
      return blob
    })
  }

  async function save(key, next) {
    adapterFor(key)
    return enqueue(key, async () => {
      await init()
      await lock(LOCK_NAME, () => writeLocked(key, next))
    })
  }

  // Serialised read-modify-write. The read is fresh from the db inside the lock,
  // so another tab's committed write is part of what fn sees.
  async function update(key, fn, fallback) {
    adapterFor(key)
    if (typeof fn !== 'function') throw new TypeError('engine2: update needs a function')
    return enqueue(key, async () => {
      await init()
      return lock(LOCK_NAME, async () => {
        const blob = await materialise(key, fallback, { fresh: true })
        served.set(key, clone(blob === fallback ? adapterFor(key).empty() : blob))
        const updated = await fn(blob)
        await writeLocked(key, updated)
        return updated
      })
    })
  }

  // ---- other tabs ----------------------------------------------------------------

  function onBusMessage(event) {
    const msg = event?.data
    if (!msg || msg.type !== BUS_TYPE || msg.from === tabId || !Array.isArray(msg.collections)) return
    const keys = new Set()
    for (const c of msg.collections) {
      if (typeof c !== 'string') continue
      const owner = Object.hasOwn(COLLECTION_TO_KEY, c) ? COLLECTION_TO_KEY[c] : null
      if (!owner) continue
      keys.add(owner)
      if (!unpersisted.has(c)) cache.delete(c) // reload on next read
    }
    for (const key of keys) {
      const p = enqueue(key, async () => {
        await materialise(key, undefined, { fresh: true })
        emit(key)
      }).catch(() => undefined).finally(() => inflight.delete(p))
      inflight.add(p)
    }
  }

  // Resolves when bus-triggered reloads have finished (tests, shutdown).
  async function whenIdle() {
    while (inflight.size) await Promise.all([...inflight])
    await Promise.all([...queues.values()])
  }

  function close() {
    bus?.removeEventListener?.('message', onBusMessage)
    bus?.close?.()
    subs.clear()
  }

  return {
    get,
    save,
    update,
    mutate: update, // v1 name
    subscribe,
    onStatusChange,
    whenIdle,
    close,
    // for the network half (R6-08) and tests
    ready: init,
    get outbox() { return outbox },
    get clock() { return clock },
    get meta() { return meta ? { ...meta } : null },
    get failed() { return failed.size > 0 },
    cloud,
  }
}
