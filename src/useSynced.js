import { useCallback, useMemo, useSyncExternalStore } from 'react'
import { useLatest } from './useLatest.js'
import { createSnapshotStore, createSyncStatusStore } from './sync/snapshotStore.js'

// useSynced(key) / useSyncStatus() over a per-key snapshot store (src/sync/snapshotStore.js).
// useHydrate stays for non-synced loaders; synced screens move here.
//
// NOT WIRED YET: nothing in the app calls configureSynced(), so no screen uses these
// hooks and the running app is unchanged. A later task (R6-14) hands it the sync router:
//   configureSynced({ get, save, update, subscribe, onStatusChange, syncStatus })
// (see the backend description in snapshotStore.js). Until then the hooks throw a clear
// error if rendered.

const STATUS_POLL_MS = 2000

let store = null
let statusStore = null

export function configureSynced(backend, { statusIntervalMs = STATUS_POLL_MS } = {}) {
  statusStore = createSyncStatusStore({ backend, intervalMs: statusIntervalMs })
  store = createSnapshotStore({ backend, onChange: () => statusStore.refresh() })
  return { store, statusStore }
}

// Drops the configured backend (tests).
export function resetSynced() {
  store = null
  statusStore = null
}

function requireStore() {
  if (!store) throw new Error('useSynced: no sync backend configured (call configureSynced first)')
  return store
}

// Returns {value, ready, error, save, update}.
//   value   the synced value once ready; `fallback` until then (pass a stable constant)
//   ready   true synchronously on any render after the key was first cached
//   error   message if the first load failed and nothing is cached, else null
//   save    save(next): replace the whole key
//   update  update(fn): fn(fresh) -> next, run inside the per-key queue; the write path
//           call sites should use, because a render snapshot may be stale
export function useSynced(key, fallback) {
  const s = requireStore()
  const fallbackRef = useLatest(fallback)

  const subscribe = useCallback((onStoreChange) => s.subscribe(key, onStoreChange, fallbackRef.current), [s, key, fallbackRef])
  const getSnapshot = useCallback(() => s.getSnapshot(key), [s, key])
  const snap = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)

  const save = useCallback((next) => s.save(key, next), [s, key])
  const update = useCallback((fn) => s.update(key, fn, fallbackRef.current), [s, key, fallbackRef])

  const value = snap.ready ? snap.value : fallback
  return useMemo(
    () => ({ value, ready: snap.ready, error: snap.error, save, update }),
    [value, snap.ready, snap.error, save, update],
  )
}

// Returns {failed, pending, lastSyncedAt}: a local save failed or the cloud push is
// failing, how many records still wait to be sent, and when the last pull finished.
export function useSyncStatus() {
  if (!statusStore) throw new Error('useSyncStatus: no sync backend configured (call configureSynced first)')
  return useSyncExternalStore(statusStore.subscribe, statusStore.getSnapshot, statusStore.getSnapshot)
}
