// Per-key snapshot store behind useSynced / useSyncStatus (R6-13). Pure JS, no React,
// no network: it talks to an injected backend, so node:test can drive it with a fake.
//
// Backend (the sync router / engine2 surface; every member but get/save/update is optional):
//   get(key, fallback)            -> Promise<blob>
//   save(key, data)               -> Promise
//   update(key, fn, fallback)     -> Promise<updated>   serialised read-modify-write
//   subscribe(key, fn)            -> unsubscribe        fn(blob) when a pull / other tab changes it
//   onStatusChange(fn)            -> unsubscribe        fn(failed: boolean), may fire synchronously
//   syncStatus()                  -> { pending, lastSyncedAt }
//
// Contract (what useSyncExternalStore needs):
//   - getSnapshot(key) is side-effect free and returns the SAME object until the key
//     really changes, so React does not re-render or loop;
//   - every change replaces the snapshot and notifies the key's listeners exactly once;
//     a change that leaves the value structurally equal (a pull echoing our own save, a
//     background revalidation) is dropped, so it neither replaces nor notifies;
//   - once a key is cached, `ready` is true from the first getSnapshot of any later
//     subscriber, with no Loading flash on a route change. The cache outlives its
//     listeners; re-subscribing revalidates it in the background.

const sameValue = (a, b) => {
  if (Object.is(a, b)) return true
  try {
    return JSON.stringify(a) === JSON.stringify(b)
  } catch {
    return false
  }
}

const errorMessage = (err) => (err && err.message) || 'Failed to load'

export function createSnapshotStore({ backend, onChange } = {}) {
  if (!backend || typeof backend.get !== 'function') throw new TypeError('snapshotStore: backend.get required')
  if (typeof backend.save !== 'function') throw new TypeError('snapshotStore: backend.save required')
  if (typeof backend.update !== 'function') throw new TypeError('snapshotStore: backend.update required')

  const entries = new Map()

  function entry(key) {
    let e = entries.get(key)
    if (!e) {
      e = {
        snap: Object.freeze({ value: undefined, ready: false, error: null }),
        listeners: new Set(),
        off: null,
        loading: null,
        version: 0, // bumped by every applied change; a stale load result is dropped
        fallback: undefined,
      }
      entries.set(key, e)
    }
    return e
  }

  function notify(key, e) {
    for (const fn of [...e.listeners]) {
      try {
        fn()
      } catch { /* a throwing listener must not block the others */ }
    }
    try {
      onChange?.(key)
    } catch { /* observer errors never break a write */ }
  }

  // Apply a value. Returns true if it changed (one notification), false if equal.
  function set(key, value) {
    const e = entry(key)
    if (e.snap.ready && e.snap.error === null && sameValue(e.snap.value, value)) return false
    e.version += 1
    e.snap = Object.freeze({ value, ready: true, error: null })
    notify(key, e)
    return true
  }

  function fail(key, e, err) {
    e.version += 1
    e.snap = Object.freeze({ value: e.snap.value, ready: false, error: errorMessage(err) })
    notify(key, e)
  }

  // Read the key from the backend. Concurrent calls share one read. A result that lands
  // after a newer change (save, update, subscriber emission) is dropped, never applied.
  function load(key, fallback) {
    const e = entry(key)
    if (fallback !== undefined) e.fallback = fallback
    if (e.loading) return e.loading
    const startedAt = e.version
    const p = Promise.resolve()
      .then(() => backend.get(key, e.fallback))
      .then(
        (value) => {
          if (e.version === startedAt) set(key, value)
          else if (!e.snap.ready) set(key, value)
        },
        (err) => {
          // A cached key keeps serving its value; only a key with nothing to show errors.
          if (!e.snap.ready) fail(key, e, err)
        },
      )
      .finally(() => { if (e.loading === p) e.loading = null })
    e.loading = p
    return p
  }

  function getSnapshot(key) {
    return entry(key).snap
  }

  function subscribe(key, listener, fallback) {
    const e = entry(key)
    if (fallback !== undefined) e.fallback = fallback
    e.listeners.add(listener)
    if (e.listeners.size === 1) {
      if (typeof backend.subscribe === 'function' && !e.off) {
        try {
          e.off = backend.subscribe(key, (blob) => { set(key, blob) }) || null
        } catch { e.off = null }
      }
      // First read, retry after an error, or background revalidation of a cached key.
      load(key)
    }
    return () => {
      if (!e.listeners.delete(listener)) return
      if (e.listeners.size === 0 && e.off) {
        const off = e.off
        e.off = null
        try { off() } catch { /* ignore */ }
      }
    }
  }

  // Seed the cache (tests, or a caller that already holds fresh data).
  function prime(key, value) {
    return set(key, value)
  }

  // Replace the whole key. The snapshot changes once the backend has accepted it.
  async function save(key, data) {
    await backend.save(key, data)
    set(key, data)
    return data
  }

  // The stale-snapshot-safe write path: fn runs inside the backend's per-key queue
  // against fresh state, never against a component's render snapshot.
  async function update(key, fn, fallback) {
    const e = entry(key)
    const updated = await backend.update(key, fn, fallback !== undefined ? fallback : e.fallback)
    set(key, updated)
    return updated
  }

  // Re-read a key (e.g. after a store event). Notifies only if it differs.
  function reload(key) {
    return load(key)
  }

  function listenerCount(key) {
    return entries.get(key)?.listeners.size ?? 0
  }

  return { getSnapshot, subscribe, load, reload, prime, save, update, listenerCount }
}

// {failed, pending, lastSyncedAt} snapshot for useSyncStatus. `failed` follows the
// backend's onStatusChange; pending and lastSyncedAt are read from syncStatus() whenever
// refresh() runs: on a failed flip, on each store change (wired by useSynced.js), and
// every `intervalMs` while somebody is subscribed (0 = no polling).
export function createSyncStatusStore({
  backend,
  intervalMs = 0,
  setIntervalFn = globalThis.setInterval,
  clearIntervalFn = globalThis.clearInterval,
} = {}) {
  let snap = Object.freeze({ failed: false, pending: 0, lastSyncedAt: null })
  let failedFlag = false
  const listeners = new Set()
  let offStatus = null
  let timer = null

  function read() {
    let pending = 0
    let lastSyncedAt = null
    try {
      const s = backend?.syncStatus?.()
      if (s && typeof s === 'object') {
        if (Number.isFinite(s.pending)) pending = s.pending
        if (s.lastSyncedAt != null) lastSyncedAt = s.lastSyncedAt
      }
    } catch { /* keep zeros */ }
    return { failed: failedFlag, pending, lastSyncedAt }
  }

  // Recompute; replaces the snapshot and notifies once only if a field changed.
  function refresh() {
    const next = read()
    if (next.failed === snap.failed && next.pending === snap.pending && next.lastSyncedAt === snap.lastSyncedAt) return false
    snap = Object.freeze(next)
    for (const fn of [...listeners]) {
      try {
        fn()
      } catch { /* ignore */ }
    }
    return true
  }

  function getSnapshot() {
    return snap
  }

  function subscribe(listener) {
    listeners.add(listener)
    if (listeners.size === 1) {
      if (typeof backend?.onStatusChange === 'function') {
        try {
          offStatus = backend.onStatusChange((failed) => {
            failedFlag = failed === true
            refresh()
          }) || null
        } catch { offStatus = null }
      }
      if (intervalMs > 0 && typeof setIntervalFn === 'function' && typeof backend?.syncStatus === 'function') {
        timer = setIntervalFn(refresh, intervalMs)
        timer?.unref?.()
      }
      refresh()
    }
    return () => {
      if (!listeners.delete(listener) || listeners.size > 0) return
      if (offStatus) {
        try { offStatus() } catch { /* ignore */ }
        offStatus = null
      }
      if (timer != null) {
        clearIntervalFn(timer)
        timer = null
      }
    }
  }

  return { getSnapshot, subscribe, refresh }
}
