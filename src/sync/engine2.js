// Sync v2 engine, local half: a record store over the localforage-style db,
// get/save/update with materialisation back to the v1 blob shape, subscribe,
// and a cross-tab write guard, plus (R6-08) the network half: outbox drain,
// delta pull, realtime apply and the long-offline resync. NOT wired into
// src/store.js or the running app: v1 (engine.js) stays the only active engine.
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
// Network half (cloud = createCloudV2(supabase), injected; never constructed here):
//  - ONE DRAIN OWNER. Only the tab that holds the injected lock DRAIN_LOCK_NAME
//    (startSync() queues for it and holds it until stopSync()/close()) talks to the
//    network: drain, delta pull, realtime, retry timers. Other tabs only write
//    records and dirty marks locally and announce them on the bus; the owner merges
//    the shared outbox from the db (dirty AND quarantined entries, so a quarantine
//    made by the owner survives another tab's write) and drains. When the owner
//    goes away the next queued tab takes over and drains what it finds in the db.
//  - drain: 700 ms trailing debounce after a local write, then one batch of <= 200
//    records read fresh from the db at send time (outbox.js keeps no payloads).
//    Retry with backoff (outbox.js); `online`, `visibilitychange`, auth change,
//    realtime reconnect and flush() reset the backoff and drain at once.
//  - pull: `rev > cursor - 50` (the overlap window), looping pages until a short
//    page (cloudV2.pull), de-duped by hlc through the same merge rule as realtime.
//    The cursor and lastPullAt only advance after the records are persisted.
//  - realtime: the payload is applied directly, no refetch. It never moves the
//    cursor (events can arrive out of rev order); the next delta pull covers it.
//    An own echo has an equal hlc, so it is a no-op.
//  - after more than 60 days since the last pull the pull is a FULL pull and local
//    records that are absent from the cloud, older than the pull start and neither
//    dirty nor quarantined are dropped (the server GC'd their tombstone at 90 days).
//  - claimOwner(userId): a different user wipes records, outbox and cursor together
//    (the deviceId is kept, it is the hlc node of this device).
//
// Write failures (db.setItem rejects) mirror v1: save/update still resolve, the
// key is marked failed, onLocalWriteError(key, err) is called, and the edit stays
// in memory. The affected collections are re-persisted whole on the next write.

import { createOutbox, backoffDelay, classifyError } from './outbox.js'
import { createClock, isValid as isValidHlc } from './hlc.js'
import { diffList } from './diff.js'
import { isLive, isHlcFormat, isDrifted, shouldApply, hlcPhysicalMs } from './records.js'
import { adapterFor, COLLECTION_TO_KEY } from './adapters.js'

export const LOCK_NAME = 'forge-r2-write'
export const BUS_TYPE = 'r2:write'
export const META_KEY = 'r2:meta'
export const OUTBOX_KEY = 'r2:outbox'
export const DRAIN_LOCK_NAME = 'forge-r2-drain' // held for life by the one tab that talks to the network
export const BUS_OWNER_TYPE = 'r2:owner' // another user took over this device: reload everything
export const DEBOUNCE_MS = 700
export const PULL_OVERLAP = 50
export const LONG_OFFLINE_MS = 60 * 24 * 60 * 60 * 1000
// Quarantine reason of an entry the server accepted without applying (forge_push
// silently drops a stamp more than 24 h ahead, and ignores a stale or replayed row).
export const REJECTED_REASON = 'rejected: not applied by the server'
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
  cloud = null, // createCloudV2(supabase); needed by the network half only
  now = () => Date.now(),
  lock = defaultLock(),
  bus = defaultBus(),
  onLocalWriteError,
  random = Math.random,
  newId = defaultId,
  outboxOptions = {},
  refreshSession, // () => Promise, called once per drain on a 401
  onSyncError, // ({ op: 'push' | 'pull', kind, error }) on every failed network attempt
  win = globalThis.window, // 'online' source
  doc = globalThis.document, // 'visibilitychange' source
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

  // network half state
  let syncOwner = false // this engine holds DRAIN_LOCK_NAME and talks to the network
  let syncP = null
  let releaseOwner = null
  let resolveSync = null
  let epoch = 0 // bumped when local state is wiped or reloaded under a running pull
  let pushTimer = null
  let retryTimer = null
  let pullRetryTimer = null
  let pullAttempts = 0
  let drainP = null
  let drainAgain = false
  let resetNext = false
  let pullP = null
  let pullAgain = false
  let fullSeen = null // keys applied by realtime while a full pull is in flight
  let rt = null // { userId, sub }
  let rtQueue = Promise.resolve()
  let lastError = null
  let rejectedTotal = 0 // entries quarantined as rejected since start
  const reviewed = new Set() // rejected entries a from-scratch pull already looked at (pair + hlc)
  const sentLog = new Map() // pair -> hlc of every entry handed to send() since the last persist
  const setT = (fn, ms) => globalThis.setTimeout(fn, ms)
  const clearT = (h) => globalThis.clearTimeout(h)

  function track(p) {
    const q = p.catch(() => undefined).finally(() => inflight.delete(q))
    inflight.add(q)
    return p
  }

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
  // A version the server refused (REJECTED_REASON) is never observed: its stamp
  // may be a wrong clock's, and observing it would drag every later edit there.
  function observe(map) {
    const refused = rejectedVersions()
    let max = null
    for (const rec of map.values()) {
      if (refused.get(pairKey(rec.collection, rec.id)) === rec.hlc) continue
      if (max === null || rec.hlc > max) max = rec.hlc
    }
    if (max !== null && max > clock.peek()) {
      try {
        clock.receive(max, { maxDriftMs: Infinity })
      } catch { /* an unusable stamp cannot be observed */ }
    }
  }

  // pair -> hlc of every quarantined entry the server rejected.
  function rejectedVersions() {
    const out = new Map()
    for (const q of outbox?.quarantinedEntries() ?? []) {
      if (q.reason === REJECTED_REASON) out.set(pairKey(q.collection, q.id), q.hlc)
    }
    return out
  }

  // Fresh clock that has observed the loaded records (less the refused versions):
  // drops a stamp the in-memory clock took from a record the server rejected.
  function resetClock() {
    clock = createClock({ node: meta.deviceId, now })
    for (const map of cache.values()) observe(map)
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

  // Fold what other tabs persisted into the in-memory outbox: dirty entries that
  // are absent or older here, and quarantined entries (only the drain owner makes
  // them, but any tab persists the snapshot, so they must not be lost).
  // Entries this tab pushed and acked (or quarantined) are still in the db snapshot
  // until persistOutbox() rewrites it; sentLog keeps them from coming back.
  async function mergeOutboxFromDb() {
    const raw = await readOutboxSnapshot()
    for (const [collection, id, hlc] of raw?.dirty ?? []) {
      if ((sentLog.get(`${collection}\u0000${id}`) ?? '') >= hlc && !outbox.has(collection, id)) continue
      if (!outbox.has(collection, id) || outbox.hlcOf(collection, id) < hlc) outbox.mark(collection, id, hlc)
    }
    const inQuarantine = new Map(outbox.quarantinedEntries().map((q) => [`${q.collection}\u0000${q.id}`, q.hlc]))
    for (const [collection, id, hlc, reason] of raw?.quarantined ?? []) {
      if ((inQuarantine.get(`${collection}\u0000${id}`) ?? '') >= hlc) continue
      if (outbox.has(collection, id) && outbox.hlcOf(collection, id) > hlc) continue // a newer edit supersedes it
      outbox.mark(collection, id, hlc)
      outbox.quarantine({ collection, id: String(id), hlc }, reason)
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
      schedulePush()
      return true
    }

    emit(key)
    try {
      bus?.postMessage({ type: BUS_TYPE, from: tabId, collections: [...touched] })
    } catch { /* other tabs reload on their next write or start */ }
    schedulePush()
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

  // ---- network half: owner, meta, claimOwner -------------------------------------

  const pairKey = (collection, id) => `${collection}\u0000${id}`

  // Must be called with the write lock held. Re-reads meta first so a patch from
  // another tab (userId, cursor) is not overwritten; the deviceId stays ours.
  async function writeMetaLocked(patch) {
    const stored = await db.getItem(META_KEY)
    const next = {
      cursor: null, userId: null, lastPullAt: null,
      ...(isObj(stored) ? stored : {}),
      ...patch,
      deviceId: meta.deviceId,
    }
    await db.setItem(META_KEY, next)
    meta = next
  }

  // Must be called with the write lock held: drop every in-memory copy and read
  // meta and the outbox back from the db (after a wipe, or another tab's wipe).
  async function reloadStateLocked() {
    const stored = await db.getItem(META_KEY)
    meta = { cursor: null, userId: null, lastPullAt: null, ...(isObj(stored) ? stored : {}), deviceId: meta.deviceId }
    outbox = createOutbox({ now, random, ...outboxOptions, initial: await readOutboxSnapshot() })
    cache.clear()
    unpersisted.clear()
    served.clear()
    for (const k of [...failed]) setKeyFailed(k, false)
    epoch += 1
  }

  async function wipeLocked() {
    const known = [...Object.keys(COLLECTION_TO_KEY).map(collectionKey), OUTBOX_KEY]
    const present = typeof db.keys === 'function' ? await db.keys() : []
    const targets = new Set([...known, ...present.filter((k) => typeof k === 'string' && k.startsWith('r2:'))])
    targets.delete(META_KEY)
    for (const k of targets) await db.removeItem(k)
  }

  // v1 `claimOwner`, for engine2: a different user on this device wipes the records,
  // the outbox and the cursor together (the unsynced outbox of the previous user is
  // lost, same as v1). The same user, or the first one, keeps everything. Resolves
  // true when it wiped. The meta is written last, so a crash half way leaves the old
  // userId and the next call wipes again.
  async function claimOwner(userId) {
    if (!userId) return false
    await init()
    const wiped = await lock(LOCK_NAME, async () => {
      const stored = await db.getItem(META_KEY)
      const prev = isObj(stored) ? stored.userId ?? null : null
      if (prev !== null && prev !== userId) {
        await wipeLocked()
        await db.setItem(META_KEY, { cursor: null, lastPullAt: null, userId, deviceId: meta.deviceId })
        await reloadStateLocked()
        return true
      }
      if (prev === null) await writeMetaLocked({ userId })
      else meta = { ...meta, ...stored, deviceId: meta.deviceId }
      return false
    })
    if (wiped) {
      for (const key of [...subs.keys()]) emit(key)
      try {
        bus?.postMessage({ type: BUS_OWNER_TYPE, from: tabId })
      } catch { /* other tabs reload on their next start */ }
      afterOwnerChange()
    }
    return wiped
  }

  // Another tab claimed a different user: nothing in memory is valid any more.
  async function reloadAfterOwnerChange() {
    await lock(LOCK_NAME, () => reloadStateLocked())
    for (const key of [...subs.keys()]) emit(key)
    afterOwnerChange()
  }

  // Timers and the realtime channel belong to the previous user.
  function afterOwnerChange() {
    if (!syncOwner) return
    clearT(pushTimer); clearT(retryTimer); clearT(pullRetryTimer)
    pushTimer = retryTimer = pullRetryTimer = null
    disconnectRealtime()
    track(onAuthChange())
  }

  async function sessionUserId() {
    try {
      const { data } = await cloud.getSession()
      return data?.session?.user?.id ?? null
    } catch {
      return null
    }
  }

  // A push or pull for `userId` may only run if the local data belongs to that user.
  // A device with no owner yet adopts the session user; a different owner needs
  // claimOwner(userId) (which wipes) first.
  async function ensureOwner(userId) {
    if (meta.userId === userId) return true
    if (meta.userId !== null) return false
    await lock(LOCK_NAME, async () => {
      const stored = await db.getItem(META_KEY)
      if (isObj(stored) && stored.userId != null) meta = { ...meta, ...stored, deviceId: meta.deviceId }
      else await writeMetaLocked({ userId })
    })
    return meta.userId === userId
  }

  // ---- drain -----------------------------------------------------------------------

  function schedulePush() {
    if (!syncOwner) return
    clearT(pushTimer)
    pushTimer = setT(() => {
      pushTimer = null
      requestDrain()
    }, DEBOUNCE_MS)
  }

  // The outbox has no public backoff reset; a fresh one built from its own snapshot
  // starts with no backoff window. Only when no drain holds the old one.
  function resetBackoff() {
    outbox = createOutbox({ now, random, ...outboxOptions, initial: outbox.snapshot() })
  }

  // Reads the current record of every entry from the db at send time, then pushes.
  // Resolves the entries to ack: an entry is acked by its own hlc, and one
  // re-marked meanwhile (a newer edit) stays dirty. An entry whose record is gone
  // has nothing to send and is dropped. forge_push returns only the rows it
  // APPLIED; a pushed row that is missing from that answer (clock-drift drop, or a
  // stale replay) is NOT acked: it is quarantined as rejected, and the next pull
  // reconciles the local record to the server (see applyRemote).
  async function sendBatch(entries) {
    const recs = await lock(LOCK_NAME, async () => {
      const out = []
      for (const e of entries) {
        const rec = (await loadCollection(e.collection, { fresh: true })).get(e.id)
        if (rec) out.push(rec)
      }
      return out
    })
    for (const e of entries) sentLog.set(pairKey(e.collection, e.id), e.hlc)
    if (recs.length === 0) return entries
    const applied = new Set((await cloud.push(recs)).map((a) => pairKey(a.collection, String(a.id))))
    const pushed = new Set(recs.map((r) => pairKey(r.collection, r.id)))
    const acked = []
    for (const e of entries) {
      const k = pairKey(e.collection, e.id)
      if (!pushed.has(k) || applied.has(k)) acked.push(e)
      else if (outbox.quarantine(e, REJECTED_REASON)) rejectedTotal += 1
    }
    return acked
  }

  async function persistOutbox() {
    try {
      await lock(LOCK_NAME, async () => {
        await mergeOutboxFromDb()
        await db.setItem(OUTBOX_KEY, outbox.snapshot())
      })
      sentLog.clear() // the db no longer lists what was acked
      setKeyFailed(OUTBOX_KEY, false)
    } catch (err) {
      setKeyFailed(OUTBOX_KEY, true)
      onLocalWriteError?.(OUTBOX_KEY, err)
    }
  }

  function reportError(op, kind, error) {
    lastError = { op, kind, message: error?.message ?? String(error) }
    try {
      onSyncError?.({ op, kind, error })
    } catch { /* a throwing listener must not break the engine */ }
  }

  async function doDrain() {
    if (!cloud) return { status: 'no-cloud' }
    if (outbox.size() === 0) return { status: 'idle', sent: 0, quarantined: [], remaining: 0 }
    const userId = await sessionUserId()
    if (!userId) return { status: 'no-session' }
    if (!(await ensureOwner(userId))) return { status: 'owner-mismatch' }
    let sent = 0
    const bad = []
    const rejectedBefore = rejectedTotal
    for (;;) {
      const mark = rejectedTotal
      const r = await outbox.drainOnce({ send: sendBatch, refreshSession })
      sent += r.sent
      bad.push(...r.quarantined)
      const progress = r.sent > 0 || r.quarantined.length > 0 || rejectedTotal > mark
      if (progress) await persistOutbox()
      if (r.status === 'sent' && outbox.size() > 0 && progress) continue
      // The server dropped something: reconcile it from the server's rows now.
      if (rejectedTotal > rejectedBefore) await requestPull()
      return { ...r, status: r.status === 'sent' ? 'idle' : r.status, sent, quarantined: bad, rejected: rejectedTotal - rejectedBefore }
    }
  }

  // One drain at a time; a request made while one runs makes it run once more.
  function requestDrain({ reset = false } = {}) {
    if (!syncOwner) return Promise.resolve({ status: 'not-owner' })
    if (reset) resetNext = true
    if (drainP) {
      drainAgain = true
      return drainP
    }
    drainP = (async () => {
      try {
        let r
        do {
          drainAgain = false
          if (resetNext) {
            resetNext = false
            resetBackoff()
          }
          clearT(retryTimer)
          retryTimer = null
          r = await doDrain()
          if (r.status === 'retry' || r.status === 'blocked') reportError('push', r.kind, r.error)
          if (syncOwner && (r.status === 'retry' || r.status === 'blocked' || r.status === 'waiting')) {
            retryTimer = setT(() => {
              retryTimer = null
              requestDrain()
            }, Math.max(r.delayMs ?? 0, 0))
          }
        } while (drainAgain && syncOwner)
        return r
      } finally {
        drainP = null
      }
    })()
    return track(drainP)
  }

  // Push now: cancels the debounce and ignores the backoff window. Only the drain
  // owner can push; in another tab the write is already persisted and announced,
  // and the owner drains it.
  function flush() {
    clearT(pushTimer)
    pushTimer = null
    return requestDrain({ reset: true })
  }

  // ---- pull + realtime apply -----------------------------------------------------------

  // Is `incoming` a row this device should store over `local`?
  function accepts(adapter, local, incoming, wall) {
    if (!incoming || !isHlcFormat(incoming.hlc) || !isValidHlc(incoming.hlc)) return false
    if ((incoming.deletedAt == null) === (incoming.body == null)) return false // tombstone rule
    if (adapter.resolve) {
      if (isDrifted(incoming.hlc, wall)) return false
      return adapter.resolve(local, incoming) === incoming
    }
    return shouldApply(local, incoming, { wallMs: wall })
  }

  // Applies cloud rows (pull page set or one realtime row) under the write lock:
  // per-record merge by hlc, persist, then (pull only) advance the cursor, drop
  // GC'd records on a full pull, notify subscribers and other tabs.
  //
  // Reconciling rejected entries (REJECTED_REASON): the server refused that local
  // version, so any server row for the record replaces it whatever the hlc order
  // (this is what lets a phone with a wrong clock converge: its far-future stamp
  // would otherwise beat every remote update). When the pull started from rev 0
  // (`reconcile`) and the server has no row at all, a local stamp that is out of
  // drift range of this device's own clock (the clock was fixed since) is
  // re-stamped and queued again; otherwise the record stays quarantined.
  async function applyRemote(rows, { cursor = null, pullStart = null, full = false, reconcile = false, epoch: ep = epoch, userId = null } = {}) {
    return lock(LOCK_NAME, async () => {
      if (ep !== epoch || (userId !== null && meta.userId !== userId)) return { applied: 0, dropped: 0, stale: true }
      await mergeOutboxFromDb()
      const wall = now()
      const byCollection = new Map()
      for (const row of rows) {
        if (!row || typeof row.collection !== 'string' || !Object.hasOwn(COLLECTION_TO_KEY, row.collection) || row.id == null) continue
        if (!byCollection.has(row.collection)) byCollection.set(row.collection, [])
        byCollection.get(row.collection).push(row)
        if (!full && fullSeen) fullSeen.add(pairKey(row.collection, String(row.id)))
      }
      const touched = new Set()
      const refused = rejectedVersions()
      let applied = 0
      let dropped = 0
      let reconciled = 0
      let restamped = 0
      for (const [c, list] of byCollection) {
        const adapter = adapterFor(COLLECTION_TO_KEY[c])
        const map = await loadCollection(c, { fresh: true })
        for (const row of list) {
          const id = String(row.id)
          const local = map.get(id)
          const supersede = local != null && refused.get(pairKey(c, id)) === local.hlc
          if (!accepts(adapter, supersede ? null : local, row, wall)) continue
          if (supersede) {
            outbox.discardQuarantined(c, id, local.hlc)
            reconciled += 1
          }
          map.set(id, {
            collection: c, id, body: row.body ?? null, pos: row.pos ?? null,
            hlc: row.hlc, deviceId: nodeOf(row.hlc), deletedAt: row.deletedAt ?? null,
          })
          // A newer remote version supersedes a pending local edit of that record.
          const pending = outbox.hlcOf(c, id)
          if (pending !== undefined && pending < row.hlc) outbox.ack([{ collection: c, id, hlc: pending }])
          touched.add(c)
          applied += 1
        }
        observe(map)
      }

      if (reconcile) {
        const inCloud = new Set(rows.map((r) => pairKey(r.collection, String(r.id))))
        const stamps = []
        for (const q of outbox.quarantinedEntries()) {
          if (q.reason !== REJECTED_REASON) continue
          const k = pairKey(q.collection, q.id)
          const rec = inCloud.has(k) ? null : (await loadCollection(q.collection, { fresh: true })).get(q.id)
          if (rec && rec.hlc === q.hlc && isDrifted(rec.hlc, wall)) stamps.push(rec)
          else reviewed.add(`${k}\u0000${q.hlc}`)
        }
        if (stamps.length > 0) {
          resetClock() // the in-memory clock may have followed the refused stamp
          for (const rec of stamps) {
            const hlc = clock.send()
            cache.get(rec.collection).set(rec.id, {
              ...rec, hlc, deviceId: nodeOf(hlc),
              deletedAt: rec.deletedAt == null ? null : new Date(hlcPhysicalMs(hlc)).toISOString(),
            })
            outbox.mark(rec.collection, rec.id, hlc) // a newer hlc leaves quarantine
            touched.add(rec.collection)
            restamped += 1
          }
        }
      }
      if (reconciled > 0 && restamped === 0) resetClock()

      if (full) {
        // Offline for more than 60 days: the server may have GC'd tombstones, so a
        // record the cloud no longer has, that predates this pull and was never
        // queued for push, is a deleted record. Drop it instead of resurrecting it.
        const inCloud = new Set(rows.map((r) => pairKey(r.collection, String(r.id))))
        const quarantined = new Set(outbox.quarantinedEntries().map((q) => pairKey(q.collection, q.id)))
        for (const c of Object.keys(COLLECTION_TO_KEY)) {
          const map = await loadCollection(c, { fresh: true })
          for (const [id, rec] of [...map]) {
            const k = pairKey(c, id)
            if (inCloud.has(k) || fullSeen?.has(k) || outbox.has(c, id) || quarantined.has(k)) continue
            if (hlcPhysicalMs(rec.hlc) >= pullStart) continue
            map.delete(id)
            touched.add(c)
            dropped += 1
          }
        }
      }

      const toWrite = new Set([...touched, ...unpersisted])
      try {
        for (const c of toWrite) {
          const recs = {}
          for (const [id, rec] of cache.get(c)) recs[id] = toStored(rec)
          await db.setItem(collectionKey(c), { recs })
        }
        if (touched.size > 0) await db.setItem(OUTBOX_KEY, outbox.snapshot())
        unpersisted.clear()
        if (cursor !== null) {
          await writeMetaLocked({ cursor: full ? cursor : Math.max(meta.cursor ?? 0, cursor), lastPullAt: pullStart })
        }
        setKeyFailed('r2:pull', false)
      } catch (err) {
        for (const c of touched) unpersisted.add(c)
        setKeyFailed('r2:pull', true)
        onLocalWriteError?.('r2:pull', err)
      }

      const keys = new Set([...touched].map((c) => COLLECTION_TO_KEY[c]))
      for (const key of keys) emit(key)
      if (touched.size > 0) {
        try {
          bus?.postMessage({ type: BUS_TYPE, from: tabId, collections: [...touched] })
        } catch { /* other tabs reload on their next write or start */ }
      }
      if (restamped > 0) schedulePush()
      return { applied, dropped, stale: false }
    })
  }

  async function doPull({ full = false } = {}) {
    if (!cloud) return { status: 'no-cloud' }
    const userId = await sessionUserId()
    if (!userId) return { status: 'no-session' }
    if (!(await ensureOwner(userId))) return { status: 'owner-mismatch' }
    const ep = epoch
    const pullStart = now()
    const isFull = full || (meta.lastPullAt != null && pullStart - meta.lastPullAt > LONG_OFFLINE_MS)
    // A rejected local version hides the server's row from a delta pull (the row's
    // rev is below the cursor), so while one is unreviewed the pull starts at 0.
    const wantsRejected = outbox.quarantinedEntries().some((q) => q.reason === REJECTED_REASON && !reviewed.has(`${pairKey(q.collection, q.id)}\u0000${q.hlc}`))
    const sinceRev = isFull || wantsRejected || meta.cursor == null ? 0 : Math.max(0, meta.cursor - PULL_OVERLAP)
    fullSeen = isFull ? new Set() : null
    try {
      const res = await cloud.pull({ sinceRev })
      const out = await applyRemote(res.rows, { cursor: res.cursor, pullStart, full: isFull, reconcile: sinceRev === 0, epoch: ep, userId })
      pullAttempts = 0
      return { status: 'ok', full: isFull, rows: res.rows.length, applied: out.applied, dropped: out.dropped }
    } catch (err) {
      const kind = classifyError(err)
      reportError('pull', kind, err)
      return { status: 'retry', kind, error: err, delayMs: backoffDelay(pullAttempts++, { random }) }
    } finally {
      fullSeen = null
    }
  }

  function requestPull() {
    if (!syncOwner) return Promise.resolve({ status: 'not-owner' })
    if (pullP) {
      pullAgain = true
      return pullP
    }
    pullP = (async () => {
      try {
        let r
        do {
          pullAgain = false
          clearT(pullRetryTimer)
          pullRetryTimer = null
          r = await doPull()
          if (r.status === 'retry' && syncOwner) {
            pullRetryTimer = setT(() => {
              pullRetryTimer = null
              requestPull()
            }, r.delayMs)
          }
        } while (pullAgain && syncOwner)
        return r
      } finally {
        pullP = null
      }
    })()
    return track(pullP)
  }

  // ---- realtime ----------------------------------------------------------------------------

  function onRealtime(evt) {
    const rec = evt?.record
    if (!rec || !syncOwner || (rec.userId != null && rec.userId !== rt?.userId)) return
    const ep = epoch
    rtQueue = rtQueue.then(() => applyRemote([rec], { epoch: ep, userId: rt?.userId ?? null })).catch(() => undefined)
    track(rtQueue)
  }

  function disconnectRealtime() {
    const cur = rt
    rt = null
    try {
      cur?.sub?.unsubscribe?.()
    } catch { /* already closed */ }
  }

  // Joins the channel for the session user (once). The first SUBSCRIBED is covered
  // by the explicit pull; every later one (a reconnect) means events were missed.
  async function connect() {
    const userId = await sessionUserId()
    if (!userId || !(await ensureOwner(userId))) {
      disconnectRealtime()
      return null
    }
    if (rt?.userId !== userId) {
      disconnectRealtime()
      let joining = true
      try {
        const sub = cloud.subscribe(userId, onRealtime, {
          onStatus: (status) => {
            if (status === 'SUBSCRIBED' && !joining) {
              requestPull()
              requestDrain({ reset: true })
            }
          },
        })
        rt = { userId, sub }
      } catch (err) {
        reportError('pull', classifyError(err), err)
      }
      joining = false
    }
    return userId
  }

  // ---- start / stop -------------------------------------------------------------------------

  function onOnline() {
    requestPull()
    requestDrain({ reset: true })
  }

  function onVisibility() {
    if (doc?.visibilityState === 'hidden') return
    onOnline()
  }

  // The session changed (sign in, sign out, token refresh by a different user).
  async function onAuthChange() {
    if (!syncOwner || !cloud) return
    await connect()
    await requestPull()
    await requestDrain({ reset: true })
  }

  async function setupOwner() {
    syncOwner = true
    win?.addEventListener?.('online', onOnline)
    doc?.addEventListener?.('visibilitychange', onVisibility)
    // The outbox loaded at init may predate other tabs' writes.
    await lock(LOCK_NAME, () => mergeOutboxFromDb())
    if (!cloud) return
    await connect()
    await requestPull() // merge first, then push
    await requestDrain({ reset: true })
  }

  // Queue for the one drain-owner lock. Resolves true once this engine became the
  // owner and its first pull and drain finished, false if stopSync() came first.
  // A tab that is not the owner stays pending (and drains nothing) until the owner
  // goes away.
  function startSync() {
    if (syncP) return syncP
    const mine = (async () => {
      await init()
      return new Promise((resolve) => {
        resolveSync = resolve
        Promise.resolve(lock(DRAIN_LOCK_NAME, () => new Promise((release) => {
          if (syncP !== mine) {
            release()
            resolve(false)
            return
          }
          releaseOwner = release
          setupOwner().then(() => resolve(true), (err) => {
            reportError('pull', classifyError(err), err)
            resolve(true)
          })
        }))).catch(() => resolve(false))
      })
    })()
    syncP = mine
    return mine
  }

  function stopSync() {
    syncOwner = false
    syncP = null
    clearT(pushTimer); clearT(retryTimer); clearT(pullRetryTimer)
    pushTimer = retryTimer = pullRetryTimer = null
    disconnectRealtime()
    win?.removeEventListener?.('online', onOnline)
    doc?.removeEventListener?.('visibilitychange', onVisibility)
    const release = releaseOwner
    const resolve = resolveSync
    releaseOwner = null
    resolveSync = null
    release?.()
    resolve?.(false)
  }

  function syncStatus() {
    return {
      owner: syncOwner,
      pending: outbox ? outbox.size() : 0,
      quarantined: outbox ? outbox.quarantinedEntries().length : 0,
      lastSyncedAt: meta?.lastPullAt ?? null,
      lastError,
    }
  }

  // ---- other tabs ----------------------------------------------------------------

  function onBusMessage(event) {
    const msg = event?.data
    if (msg?.type === BUS_OWNER_TYPE && msg.from !== tabId) {
      track(reloadAfterOwnerChange())
      return
    }
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
    // Another tab wrote records and dirty marks: the drain owner picks them up.
    if (syncOwner) {
      track(lock(LOCK_NAME, () => mergeOutboxFromDb()).then(() => schedulePush()))
    }
  }

  // Resolves when bus-triggered reloads have finished (tests, shutdown).
  async function whenIdle() {
    while (inflight.size) await Promise.all([...inflight])
    await Promise.all([...queues.values()])
  }

  function close() {
    stopSync()
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
    // network half (R6-08): startSync() queues for the one drain-owner lock
    startSync,
    stopSync,
    claimOwner,
    onAuthChange,
    flush,
    pull: requestPull,
    drain: requestDrain,
    syncStatus,
    // for tests
    ready: init,
    get outbox() { return outbox },
    get clock() { return clock },
    get meta() { return meta ? { ...meta } : null },
    get failed() { return failed.size > 0 },
    cloud,
  }
}
