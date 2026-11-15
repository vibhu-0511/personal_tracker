// Per-key router between the v1 sync engine (engine.js, whole-blob kv_store) and the
// v2 engine (engine2.js, per-record). It holds the routing logic behind src/store.js's
// getSynced / saveSynced / mutate, in a module that can be imported under
// node:test (store.js cannot: supabaseClient.js throws without env).
//
// The router has the same surface as the v1 engine (get, save, mutate, reconcileKey,
// reconcileAll, flush, onStatusChange, claimOwner), so store.js swaps it in for `engine`
// and its own emitStoreKey-after-write code stays as it was.
//
// FLAGS OFF = v1, unchanged. `flags.isV2(key)` is false for every key by default (see
// createFlags in migrate.js), and for such a key every call goes straight to the v1
// engine with the same arguments and returns what it returns:
//   get       -> v1.get(key, fallback)
//   save      -> v1.save(key, data)
//   mutate    -> v1.mutate(key, fn, fallback)
// The v2 engine is created lazily (createV2) the first time a v2 key, or the sync
// lifecycle with a v2 key on, needs it. createV2 may return the engine or a Promise of it
// (store.js loads the v2 modules with dynamic import() there), so every use awaits it. With no flag on it is never constructed, so
// it adds no listeners, channels, locks or timers.
//
// A key that is on goes to engine2 (get / save / update). A v2 key is never reconciled through the v1 kv_store path
// (reconcileKey resolves 'noop'): engine2's own pull and the blob mirror own it.
//
// If createV2 throws for a v2 key the error propagates and nothing is cached, so the
// next call retries. A flagged key never silently falls back to v1: that would show
// stale data and write a second, diverging copy.

import { V2_KEYS } from './flags.js' // not adapters.js: keeps the v2 stack out of the entry chunk

const V2_LOCAL_PREFIX = 'r2:' // engine2's local keys: r2:<collection>, r2:outbox, r2:meta

// v1's claimOwner wipes the whole local db with db.clear() when a different user signs
// in. That would also delete engine2's r2:* records and meta under a live engine2.
// This wrapper hands v1 a db whose clear() keeps r2:* while `keepV2()` is true (engine2
// has been created or a key is on) and is otherwise exactly db.clear(), so with every
// flag off nothing differs. engine2.claimOwner wipes its own records first.
export function createV1Db(db, { keepV2 = () => false } = {}) {
  return {
    getItem: (key) => db.getItem(key),
    setItem: (key, value) => db.setItem(key, value),
    removeItem: (key) => db.removeItem(key),
    keys: () => db.keys(),
    async clear() {
      if (!keepV2()) return db.clear()
      const keys = await db.keys()
      for (const key of keys) {
        if (typeof key === 'string' && key.startsWith(V2_LOCAL_PREFIX)) continue
        await db.removeItem(key)
      }
      return undefined
    },
  }
}

export function createSyncRouter({
  v1, // createSyncEngine(...)
  createV2, // () => engine2 | Promise<engine2>; called at most once successfully
  flags, // createFlags(...) from migrate.js
  onV2Key, // (key, v2) => void, once per key the first time it is routed to v2
  prepareV2Key, // async (key, v2) => void, awaited before the key's first v2 read/write (seeds engine2 from the v1 blob)
  onV2Synced, // (v2) => void, after the first pull of startSync() finished (releases held mirror writes)
  firstPullTimeoutMs = 8000, // how long reconcileAll waits for the first pull on a device with no cursor
} = {}) {
  if (!v1) throw new TypeError('router: v1 engine required')

  let v2 = null
  const seen = new Set() // keys already announced to onV2Key
  const prepared = new Map() // key -> promise of prepareV2Key; dropped when the key goes back to v1
  const statusAttachers = new Set()

  // A throwing or missing flag source means "off".
  function isV2(key) {
    if (!flags || typeof createV2 !== 'function') return false
    try {
      return flags.isV2(key) === true
    } catch {
      return false
    }
  }

  const anyV2 = (keys) => keys.some(isV2)

  // One shared in-flight creation; a failed one (sync throw or rejection) is dropped so the
  // next call retries. createV2 is invoked synchronously by the first caller.
  let v2Pending = null
  async function engineV2() {
    if (v2) return v2
    if (!v2Pending) {
      const p = (async () => {
        const created = await createV2()
        v2 = created
        for (const attach of statusAttachers) attach()
        return created
      })()
      v2Pending = p
      p.catch(() => { if (v2Pending === p) v2Pending = null })
    }
    return v2Pending
  }

  async function v2For(key) {
    const engine = await engineV2()
    if (!seen.has(key)) {
      seen.add(key)
      onV2Key?.(key, engine)
    }
    return engine
  }

  // engine2 for a v2 key, after its local seed ran once (a failed seed is retried on the
  // next call and propagates: a flagged key never reads a partial engine2).
  async function v2Ready(key) {
    const engine = await v2For(key)
    if (typeof prepareV2Key === 'function') {
      let p = prepared.get(key)
      if (!p) {
        p = Promise.resolve().then(() => prepareV2Key(key, engine))
        prepared.set(key, p)
        p.catch(() => { if (prepared.get(key) === p) prepared.delete(key) })
      }
      await p
    }
    return engine
  }

  // A key served by v1 again: its next v2 use re-seeds from the (possibly newer) v1 blob.
  const leftV2 = (key) => { if (prepared.size) prepared.delete(key) }

  async function get(key, fallback) {
    if (isV2(key)) return (await v2Ready(key)).get(key, fallback)
    leftV2(key)
    return v1.get(key, fallback)
  }

  async function save(key, data) {
    if (isV2(key)) return (await v2Ready(key)).save(key, data)
    leftV2(key)
    return v1.save(key, data)
  }

  async function mutate(key, fn, fallback) {
    if (isV2(key)) return (await v2Ready(key)).update(key, fn, fallback)
    leftV2(key)
    return v1.mutate(key, fn, fallback)
  }

  async function reconcileKey(key) {
    if (isV2(key)) return 'noop'
    leftV2(key)
    return v1.reconcileKey(key)
  }

  // The v1 half: exactly what reconcileAll did before any flag existed. Always awaited
  // by callers, also when a pull cursor exists (v1 blocked rendering on it).
  async function reconcileV1(keys) {
    const v1Keys = keys.filter((k) => !isV2(k))
    await v1.reconcileAll(v1Keys.length === keys.length ? keys : v1Keys)
  }

  // The v2 half: seed the v2 keys from their v1 blobs, then start engine2's network half
  // (it resolves once this tab owns the drain lock and finished its first pull, which
  // may be never in a second tab). `wait`: 'none' returns once started, 'first-pull'
  // waits for that pull (bounded by firstPullTimeoutMs), 'all' waits for it unbounded.
  async function reconcileV2(keys, { wait = 'all' } = {}) {
    const v2Keys = keys.filter(isV2)
    if (v2Keys.length === 0) return
    // a failed seed is retried by the key's next read; the mirror stays gated until a pull
    for (const key of v2Keys) await v2Ready(key).catch(() => undefined)
    const engine = await engineV2()
    const synced = Promise.resolve(engine.startSync()).then(
      () => { try { onV2Synced?.(engine) } catch { /* releasing is best effort */ } },
      () => undefined,
    )
    if (wait === 'none') return
    if (wait === 'all') { await synced; return }
    let timer
    const timeout = new Promise((resolve) => { timer = setTimeout(resolve, firstPullTimeoutMs) })
    try {
      await Promise.race([synced, timeout])
    } finally {
      clearTimeout(timer)
    }
  }

  // v1 keys reconcile as before; if any key is on, this also seeds and starts the v2
  // network half. A device with no pull cursor waits for engine2's first pull (bounded)
  // so v2 keys do not render empty and edits do not race it; with a cursor the v2 half
  // is not awaited.
  async function reconcileAll(keys) {
    await reconcileV1(keys)
    const v2Keys = keys.filter(isV2)
    if (v2Keys.length === 0) return
    const engine = await engineV2()
    await engine.ready?.()
    const cursor = engine.syncStatus?.().lastSyncedAt != null
    await reconcileV2(keys, { wait: cursor ? 'none' : 'first-pull' })
  }

  // A v2 flush failure must not stop v1's flush (used on page hide / before update).
  async function flush() {
    const tasks = [v1.flush()]
    if (v2 && typeof v2.flush === 'function') tasks.push(Promise.resolve(v2.flush()).catch(() => undefined))
    await Promise.all(tasks)
  }

  // engine2 first: on an owner change it wipes its own records, then v1's clear() (see
  // createV1Db) leaves r2:* alone. Only touches engine2 when it exists or a flag is on.
  async function claimOwner(userId) {
    if (userId && (v2 || anyV2(V2_KEYS))) await (await engineV2()).claimOwner(userId)
    return v1.claimOwner(userId)
  }

  // fn(failed) with failed = v1 failed || v2 failed. With no v2 it is exactly v1's
  // subscription; engine2 is attached when it appears.
  function onStatusChange(fn) {
    let f1 = false
    let f2 = false
    let last
    let primed = false
    const deliver = () => {
      const next = f1 || f2
      if (primed && next === last) return
      primed = true
      last = next
      fn(next)
    }
    const off1 = v1.onStatusChange((v) => { f1 = v; deliver() })
    let off2 = null
    const attach = () => {
      if (off2 || !v2) return
      off2 = v2.onStatusChange((v) => { f2 = v; deliver() })
    }
    statusAttachers.add(attach)
    attach()
    return () => {
      statusAttachers.delete(attach)
      off1?.()
      off2?.()
    }
  }

  return {
    isV2,
    get,
    save,
    mutate,
    reconcileKey,
    reconcileAll,
    reconcileV1,
    reconcileV2,
    flush,
    claimOwner,
    onStatusChange,
    get v2() { return v2 }, // the engine2 instance, or null while no key has needed it
  }
}
