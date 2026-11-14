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
// lifecycle with a v2 key on, needs it. With no flag on it is never constructed, so
// it adds no listeners, channels, locks or timers.
//
// A key that is on goes to engine2 (get / save / update). A v2 key is never reconciled through the v1 kv_store path
// (reconcileKey resolves 'noop'): engine2's own pull and the blob mirror own it.
//
// If createV2 throws for a v2 key the error propagates and nothing is cached, so the
// next call retries. A flagged key never silently falls back to v1: that would show
// stale data and write a second, diverging copy.

import { ADAPTER_KEYS } from './adapters.js'

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
  createV2, // () => createEngine2(...); called at most once successfully
  flags, // createFlags(...) from migrate.js
  onV2Key, // (key, v2) => void, once per key the first time it is routed to v2
} = {}) {
  if (!v1) throw new TypeError('router: v1 engine required')

  let v2 = null
  const seen = new Set() // keys already announced to onV2Key
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

  function engineV2() {
    if (!v2) {
      v2 = createV2()
      for (const attach of statusAttachers) attach()
    }
    return v2
  }

  function v2For(key) {
    const engine = engineV2()
    if (!seen.has(key)) {
      seen.add(key)
      onV2Key?.(key, engine)
    }
    return engine
  }

  async function get(key, fallback) {
    if (isV2(key)) return v2For(key).get(key, fallback)
    return v1.get(key, fallback)
  }

  async function save(key, data) {
    if (isV2(key)) return v2For(key).save(key, data)
    return v1.save(key, data)
  }

  async function mutate(key, fn, fallback) {
    if (isV2(key)) return v2For(key).update(key, fn, fallback)
    return v1.mutate(key, fn, fallback)
  }

  async function reconcileKey(key) {
    if (isV2(key)) return 'noop'
    return v1.reconcileKey(key)
  }

  // v1 keys reconcile as before; if any key is on, this also starts the v2 network half
  // (not awaited: it resolves once this tab owns the drain lock and finished its first
  // pull, which may be never in a second tab).
  async function reconcileAll(keys) {
    const v1Keys = keys.filter((k) => !isV2(k))
    await v1.reconcileAll(v1Keys.length === keys.length ? keys : v1Keys)
    if (v1Keys.length !== keys.length) {
      for (const key of keys) if (isV2(key)) v2For(key)
      engineV2().startSync().catch(() => undefined)
    }
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
    if (userId && (v2 || anyV2(ADAPTER_KEYS))) await engineV2().claimOwner(userId)
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
    flush,
    claimOwner,
    onStatusChange,
    get v2() { return v2 }, // the engine2 instance, or null while no key has needed it
  }
}
