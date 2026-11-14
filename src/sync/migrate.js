// Migration helpers for the kv_store -> sync v2 cutover (docs/plan/research/R6-report.md,
// "Design: migration from kv_store"). Helpers only: NOT wired into src/store.js or the
// running app, and nothing here switches a key to v2 by itself. Every flag defaults to
// OFF (v1); a key is on only when VITE_SYNC_V2_KEYS lists it or this device's
// localStorage override says so. The engine, db, cloud and kv clients are injected, so
// tests run on the in-memory fakes with no network.
//
//   createFlags({ env, storage })      per-key v2 flags: env list + per-device override
//   createBlobMirror({ engine, ... })  dual-write: every v2 change also rewrites the v1
//                                      shape { data, updatedAt } locally (db key = the
//                                      synced key, what v1 and backup.js read) and the
//                                      kv_store blob (debounced, default 5 s), so
//                                      flipping a flag off resumes v1 with current data
//   createMigrator({ engine, ... })    importBlob(key, blob)         additive: adds or updates
//                                                                    records, never tombstones
//                                      seedFromLocalBlob(key)        pushes local records that
//                                                                    are missing or newer in the
//                                                                    cloud, hlc from updatedAt
//                                      verify(key)                   deep-equals materialised
//                                                                    records against the blob
//   preCutoverBackup({ db })           the X1-07 export (src/backup/backup.js), reused as is
//
// Seeded stamps use the same shape and node as forge_backfill() in the SQL
// ('<ms of updatedAt>-0000-backfill'), so seeding a blob the cloud already holds from
// the backfill is a no-op and any real v2 edit (a later hlc) beats a seeded record.

import { adapterFor, ADAPTER_KEYS, emptyBlob } from './adapters.js'
import { readLocalShape } from './logic.js'
import { serialize, MAX_MS, DEFAULT_MAX_DRIFT_MS } from './hlc.js'
import { exportBackupJson } from '../backup/backup.js'

export const FLAGS_ENV_NAME = 'VITE_SYNC_V2_KEYS'
export const FLAGS_OVERRIDE_KEY = 'forge_sync_v2_keys' // localStorage: JSON { <key>: true | false }
export const MIRROR_DEBOUNCE_MS = 5000
export const MIRROR_RETRY_MAX_MS = 5 * 60 * 1000
export const SEED_NODE = 'backfill'

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
const clone = (v) => (v === undefined ? v : structuredClone(v))
const pair = (e) => `${e.collection}\u0000${e.id}`

function deepEqual(a, b) {
  if (Object.is(a, b)) return true
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false
  if (Array.isArray(a) !== Array.isArray(b)) return false
  const ka = Object.keys(a)
  const kb = Object.keys(b)
  if (ka.length !== kb.length) return false
  return ka.every((k) => Object.hasOwn(b, k) && deepEqual(a[k], b[k]))
}

// ---- flags -------------------------------------------------------------------

// 'puzzleProgress, notes,bogus' -> ['puzzleProgress', 'notes']. Unknown names are ignored,
// so a typo in the env var can never turn on a key that has no adapter.
export function parseKeyList(text) {
  if (typeof text !== 'string') return []
  const out = []
  for (const part of text.split(',')) {
    const name = part.trim()
    if (ADAPTER_KEYS.includes(name) && !out.includes(name)) out.push(name)
  }
  return out
}

function defaultEnv() {
  try {
    return import.meta.env?.VITE_SYNC_V2_KEYS ?? ''
  } catch {
    return ''
  }
}

function defaultStorage() {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

// The override is read on every call so a change made on this device takes effect
// without a reload. A missing, unreadable or malformed override is ignored.
export function createFlags({ env = defaultEnv(), storage = defaultStorage() } = {}) {
  const envKeys = parseKeyList(env)

  function readOverrides() {
    try {
      const raw = storage?.getItem(FLAGS_OVERRIDE_KEY)
      const parsed = raw ? JSON.parse(raw) : null
      return isObj(parsed) ? parsed : {}
    } catch {
      return {}
    }
  }

  function isV2(key) {
    if (!ADAPTER_KEYS.includes(key)) return false
    const override = readOverrides()[key]
    if (override === true || override === false) return override
    return envKeys.includes(key)
  }

  return {
    isV2,
    keys: () => ADAPTER_KEYS.filter(isV2),
    envKeys: () => [...envKeys],
    override: (key) => {
      const v = readOverrides()[key]
      return v === true || v === false ? v : null
    },
    // true / false forces the key on / off on this device; null removes the override.
    // Only ever called by a person or a caller that was told to; nothing here calls it.
    setOverride(key, value) {
      if (!ADAPTER_KEYS.includes(key)) throw new TypeError(`migrate: unknown synced key ${JSON.stringify(key)}`)
      if (value !== true && value !== false && value !== null) throw new TypeError('migrate: override must be true, false or null')
      if (!storage) return false
      const next = readOverrides()
      if (value === null) delete next[key]
      else next[key] = value
      try {
        storage.setItem(FLAGS_OVERRIDE_KEY, JSON.stringify(next))
        return true
      } catch {
        return false
      }
    },
  }
}

// ---- v1 blob mirror ----------------------------------------------------------

// engine: createEngine2 (subscribe, get). db: the same localforage instance (the v1
// shape lives under the plain synced key). cloudKv: createCloudKv (write). getUserId:
// async () => uid | null. The local v1 shape is rewritten on every change; the kv_store
// blob is written once the key has been quiet for debounceMs, from the same wrapped
// value, so local updatedAt and kv_store.updated_at agree and v1 sees "nothing to do".
// A failed or session-less kv write keeps the key dirty and retries with backoff; the
// failure goes to onError({ key, op, error }) and never throws into the engine.
export function createBlobMirror({
  engine,
  db,
  cloudKv,
  getUserId,
  now = () => Date.now(),
  debounceMs = MIRROR_DEBOUNCE_MS,
  onError,
  setTimer = (fn, ms) => globalThis.setTimeout(fn, ms),
  clearTimer = (h) => globalThis.clearTimeout(h),
} = {}) {
  if (!engine || !db) throw new TypeError('migrate: createBlobMirror needs engine and db')

  const unsubs = new Map() // key -> unsubscribe
  const dirty = new Map() // key -> wrapped value not yet in kv_store
  const retries = new Map() // key -> consecutive kv failures
  const timers = new Map()
  let chain = Promise.resolve() // serialises every write the mirror makes
  let lastStamp = 0

  const report = (key, op, error) => {
    try {
      onError?.({ key, op, error })
    } catch { /* a throwing reporter must not break the mirror */ }
  }

  // Strictly increasing per mirror, so two quick saves never share an updatedAt.
  const stamp = () => (lastStamp = Math.max(now(), lastStamp + 1))

  function queue(task) {
    const run = chain.then(task)
    chain = run.then(() => undefined, () => undefined)
    return run
  }

  function writeLocal(key, blob) {
    const wrapped = { data: clone(blob), updatedAt: stamp() }
    return queue(async () => {
      try {
        await db.setItem(key, wrapped)
      } catch (error) {
        report(key, 'local', error)
        return
      }
      dirty.set(key, wrapped)
      arm(key, debounceMs)
    })
  }

  function arm(key, ms) {
    clearTimer(timers.get(key))
    timers.set(key, setTimer(() => {
      timers.delete(key)
      queue(() => writeCloud(key)).catch(() => undefined)
    }, ms))
  }

  // Must run inside queue(). Resolves true when the key is clean afterwards.
  async function writeCloud(key) {
    const wrapped = dirty.get(key)
    if (!wrapped) return true
    try {
      const userId = await getUserId?.()
      if (!userId) throw new Error('migrate: no signed-in user for the kv_store mirror')
      await cloudKv.write(key, userId, wrapped)
    } catch (error) {
      report(key, 'kv', error)
      const n = (retries.get(key) ?? 0) + 1
      retries.set(key, n)
      arm(key, Math.min(debounceMs * 2 ** n, MIRROR_RETRY_MAX_MS))
      return false
    }
    // A newer change may have replaced the dirty value while this write was in flight.
    if (dirty.get(key) === wrapped) dirty.delete(key)
    retries.delete(key)
    return !dirty.has(key)
  }

  return {
    // Start mirroring a key: every engine change rewrites the v1 shape. Idempotent.
    watch(key) {
      adapterFor(key)
      if (unsubs.has(key)) return () => this.unwatch(key)
      unsubs.set(key, engine.subscribe(key, (blob) => { writeLocal(key, blob).catch(() => undefined) }))
      return () => this.unwatch(key)
    },
    unwatch(key) {
      unsubs.get(key)?.()
      unsubs.delete(key)
    },
    // Write the current materialised blob to both v1 places right now. Call it, then
    // flush(), before taking a key back to v1 so v1 resumes with current data.
    async writeNow(key) {
      const blob = await engine.get(key, emptyBlob(key))
      await writeLocal(key, blob)
      clearTimer(timers.get(key))
      timers.delete(key)
      return queue(() => writeCloud(key))
    },
    // Settle the local writes and push every dirty key to kv_store now. Resolves the
    // keys still dirty (empty when everything reached the cloud).
    async flush() {
      await chain
      for (const key of [...dirty.keys()]) {
        clearTimer(timers.get(key))
        timers.delete(key)
        await queue(() => writeCloud(key))
      }
      return [...dirty.keys()]
    },
    pending: () => [...dirty.keys()],
    stop() {
      for (const key of [...unsubs.keys()]) this.unwatch(key)
      for (const h of timers.values()) clearTimer(h)
      timers.clear()
    },
  }
}

// ---- additive import, local seed, verifier -----------------------------------

// A v1 blob is { data, updatedAt }; a bare value is a legacy blob written before sync existed.
function unwrapBlob(blob) {
  const shape = readLocalShape(blob)
  return shape ? { data: shape.data, updatedAt: shape.updatedAt } : null
}

// moodLog: a manually logged entry is never replaced by a derived one.
function keepLocal(key, local, incoming) {
  return key === 'moodLog' && local?.source === 'logged' && incoming?.source === 'derived'
}

function seedHlc(updatedAt, wallMs, maxDriftMs) {
  let ms = Number.isFinite(updatedAt) ? Math.max(0, Math.floor(updatedAt)) : 0
  // forge_push silently drops a stamp more than 24 h ahead: clamp a wrong-clock blob to now.
  if (ms - wallMs > maxDriftMs) ms = wallMs
  return serialize({ ms: Math.min(ms, MAX_MS), counter: 0, node: SEED_NODE })
}

export function createMigrator({
  engine,
  db,
  cloud,
  now = () => Date.now(),
  maxDriftMs = DEFAULT_MAX_DRIFT_MS,
} = {}) {
  if (!engine) throw new TypeError('migrate: createMigrator needs engine')

  async function localBlob(key) {
    if (!db) throw new TypeError('migrate: this call needs db')
    return db.getItem(key)
  }

  // Adds records the engine lacks and updates records whose body differs; nothing the
  // blob does not mention is touched, so no tombstone is ever written (a delete made on
  // a stale v1 device is lost, which the plan accepts). Existing records keep their
  // position, new ones append in blob order. Resolves { key, added, updated }.
  async function importBlob(key, blob) {
    const adapter = adapterFor(key)
    const incoming = unwrapBlob(blob)
    const result = { key, added: 0, updated: 0 }
    if (!incoming) return result
    const wanted = adapter.toEntries(incoming.data)
    if (wanted.length === 0) return result

    await engine.update(key, (current) => {
      const have = adapter.toEntries(current)
      const index = new Map(have.map((e) => [pair(e), e]))
      const maxPos = new Map()
      for (const e of have) if (e.pos != null) maxPos.set(e.collection, Math.max(maxPos.get(e.collection) ?? 0, e.pos))

      const merged = [...have]
      for (const e of wanted) {
        const local = index.get(pair(e))
        if (!local) {
          let pos = null
          if (e.pos != null) {
            pos = (maxPos.get(e.collection) ?? 0) + 1000
            maxPos.set(e.collection, pos)
          }
          merged.push({ ...e, pos })
          result.added++
        } else if (!deepEqual(local.body, e.body) && !keepLocal(key, local.body, e.body)) {
          merged[merged.indexOf(local)] = { ...local, body: e.body }
          result.updated++
        }
      }
      if (result.added + result.updated === 0) return current
      return adapter.fromEntries(merged)
    }, emptyBlob(key))
    return result
  }

  // Pushes the records of this device's local v1 blob that the cloud lacks or holds an
  // older version of. Each pushed record is stamped from blob.updatedAt, so a real v2
  // edit made later still wins. Skips a record whose cloud copy is live with an equal
  // body (nothing to upload) or has a stamp at least as new. Covers edits v1's swallowed
  // write errors never uploaded. Resolves { key, pushed, skipped, total }.
  async function seedFromLocalBlob(key, { blob, cloudRecords } = {}) {
    if (!cloud) throw new TypeError('migrate: seedFromLocalBlob needs cloud')
    const adapter = adapterFor(key)
    const shape = unwrapBlob(blob !== undefined ? blob : await localBlob(key))
    const result = { key, pushed: 0, skipped: 0, total: 0 }
    if (!shape) return result
    const entries = adapter.toEntries(shape.data)
    result.total = entries.length
    if (entries.length === 0) return result

    const remote = cloudRecords ?? (await cloud.pull({ sinceRev: 0 })).rows
    const inCloud = new Map(remote.filter((r) => adapter.collections.includes(r.collection)).map((r) => [pair(r), r]))
    const hlc = seedHlc(shape.updatedAt, now(), maxDriftMs)

    const out = []
    for (const e of entries) {
      const theirs = inCloud.get(pair(e))
      const missing = !theirs
      const newer = !!theirs && hlc > theirs.hlc && (theirs.deletedAt != null || !deepEqual(theirs.body, e.body))
      if (missing || newer) {
        out.push({ collection: e.collection, id: e.id, body: e.body, pos: e.pos ?? null, hlc, deviceId: SEED_NODE, deletedAt: null })
      } else {
        result.skipped++
      }
    }
    if (out.length) await cloud.push(out)
    result.pushed = out.length
    return result
  }

  // Seeds several keys over one cloud pull. Resolves one result per key.
  async function seedAll(keys = ADAPTER_KEYS) {
    if (!cloud) throw new TypeError('migrate: seedAll needs cloud')
    const { rows } = await cloud.pull({ sinceRev: 0 })
    const results = []
    for (const key of keys) results.push(await seedFromLocalBlob(key, { cloudRecords: rows }))
    return results
  }

  // Deep-equals what the engine materialises for `key` against the blob (default: this
  // device's local v1 copy). The blob is first normalised the way the adapters do (items
  // without an id and repeated ids are dropped), so a blob the app could never have
  // written does not fail the check. Resolves { key, ok, missing, extra, changed } with
  // record ids as 'collection/id'.
  async function verify(key, { blob } = {}) {
    const adapter = adapterFor(key)
    const shape = unwrapBlob(blob !== undefined ? blob : await localBlob(key))
    const expected = adapter.fromEntries(adapter.toEntries(shape ? shape.data : adapter.empty()))
    const actual = await engine.get(key, adapter.empty())

    const want = new Map(adapter.toEntries(expected).map((e) => [pair(e), e]))
    const got = new Map(adapter.toEntries(actual).map((e) => [pair(e), e]))
    const name = (k) => k.replace('\u0000', '/')
    const missing = [...want.keys()].filter((k) => !got.has(k)).map(name)
    const extra = [...got.keys()].filter((k) => !want.has(k)).map(name)
    const changed = [...want.keys()].filter((k) => got.has(k) && !deepEqual(want.get(k).body, got.get(k).body)).map(name)
    return { key, ok: deepEqual(actual, expected), missing, extra, changed }
  }

  return { importBlob, seedFromLocalBlob, seedAll, verify }
}

// ---- pre-cutover download -----------------------------------------------------

// The X1-07 export, reused (not re-implemented): { filename, json } for the JSON
// download taken before a key is cut over.
export async function preCutoverBackup({ db, now = () => Date.now() } = {}) {
  const json = await exportBackupJson({ db, now })
  const day = new Date(now()).toISOString().slice(0, 10)
  return { filename: `forge-backup-pre-v2-${day}.json`, json }
}
