// In-memory stand-in for the localforage instance the sync engine uses.
// Mirrors the subset the app calls (getItem, setItem, removeItem, clear, keys,
// length) plus failure injection and call counters for tests. Never touches
// IndexedDB, the network or any real service.
//
// IndexedDB stores structured clones, so by default values are cloned on the
// way in and out: a test that mutates an object after setItem, or mutates what
// getItem returned, cannot silently change the "stored" value.
//
// Like localforage, getItem resolves null for a missing key, and setItem
// resolves with the stored value.

export function createFakeDb(initial = {}, { clone = true } = {}) {
  const store = new Map()
  const copy = (v) => (clone && v !== undefined ? structuredClone(v) : v)
  const injections = []
  const calls = { getItem: 0, setItem: 0, removeItem: 0, clear: 0, keys: 0 }

  for (const [k, v] of Object.entries(initial)) store.set(k, copy(v))

  // Throws the first matching injection (and consumes one of its `times`).
  function maybeFail(op, key) {
    const i = injections.findIndex((f) => f.op === op && (f.key === undefined || f.key === key))
    if (i === -1) return
    const f = injections[i]
    f.times -= 1
    if (f.times <= 0) injections.splice(i, 1)
    throw f.error
  }

  const db = {
    async getItem(key) {
      calls.getItem++
      maybeFail('getItem', key)
      return store.has(key) ? copy(store.get(key)) : null
    },
    async setItem(key, value) {
      calls.setItem++
      maybeFail('setItem', key)
      store.set(key, copy(value))
      return value
    },
    async removeItem(key) {
      calls.removeItem++
      maybeFail('removeItem', key)
      store.delete(key)
    },
    async clear() {
      calls.clear++
      maybeFail('clear')
      store.clear()
    },
    async keys() {
      calls.keys++
      maybeFail('keys')
      return [...store.keys()]
    },
    async length() {
      return store.size
    },

    // ---- test controls (not part of the localforage surface) ----

    calls,

    // Make a method reject. op is 'getItem' | 'setItem' | 'removeItem' | 'clear' | 'keys'.
    // Optional key limits it to one key. times defaults to 1; Infinity keeps failing
    // until clearFailures(). Defaults to a quota-style error.
    failOn(op, { key, times = 1, error = new Error('QuotaExceededError: fake db write failed') } = {}) {
      if (!(op in calls)) throw new Error(`fakeDb: unknown op ${op}`)
      injections.push({ op, key, times, error })
      return db
    },
    clearFailures() {
      injections.length = 0
    },

    // Synchronous plain-object view of the current contents (clones).
    snapshot() {
      return Object.fromEntries([...store].map(([k, v]) => [k, copy(v)]))
    },
    has(key) {
      return store.has(key)
    },
  }
  return db
}

// Same name the v1 engine test uses for its inline fake.
export const makeFakeDb = createFakeDb
