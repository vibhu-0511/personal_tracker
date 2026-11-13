// Tiny pub/sub for local store writes, so components that read a synced key
// (e.g. the header pills reading 'habits') can refresh after a local save
// without a remount. Remote-sync changes use their own tick; this covers
// writes made on this device only.
const listeners = new Map()

// Subscribe to changes of one key. Returns an unsubscribe function.
export function subscribeStoreKey(key, fn) {
  let set = listeners.get(key)
  if (!set) {
    set = new Set()
    listeners.set(key, set)
  }
  set.add(fn)
  return () => {
    const current = listeners.get(key)
    if (!current) return
    current.delete(fn)
    if (current.size === 0) listeners.delete(key)
  }
}

// Notify every listener of `key`. A throwing listener never blocks the others
// or the save that triggered the emit.
export function emitStoreKey(key) {
  const set = listeners.get(key)
  if (!set) return
  for (const fn of [...set]) {
    try {
      fn(key)
    } catch (err) {
      console.error('storeEvents listener failed', err)
    }
  }
}

// Number of live listeners for a key (or all keys); used by tests to assert no leaks.
export function listenerCount(key) {
  if (key !== undefined) return listeners.get(key)?.size ?? 0
  let n = 0
  for (const set of listeners.values()) n += set.size
  return n
}
