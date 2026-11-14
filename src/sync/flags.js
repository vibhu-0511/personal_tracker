// Per-key sync v2 flags. Kept in its own tiny module (no engine2 / adapters / hlc imports)
// so src/store.js can read the flags in the entry chunk while the v2 stack itself is
// loaded lazily (dynamic import) only when a key is on. migrate.js re-exports all of it.

// Must equal ADAPTER_KEYS in src/sync/adapters.js and SYNCED_KEYS in src/store.js;
// test/lazyV2.test.js enforces it.
export const V2_KEYS = Object.freeze([
  'settings', 'notes', 'progress', 'expenses', 'budgets', 'goals',
  'examProgress', 'examNotes', 'investProgress', 'watchlist',
  'tasks', 'reminders', 'habits', 'moodLog', 'loans', 'puzzleProgress', 'checklists',
])

export const FLAGS_ENV_NAME = 'VITE_SYNC_V2_KEYS'
export const FLAGS_OVERRIDE_KEY = 'forge_sync_v2_keys' // localStorage: JSON { <key>: true | false }

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)

// 'puzzleProgress, notes,bogus' -> ['puzzleProgress', 'notes']. Unknown names are ignored,
// so a typo in the env var can never turn on a key that has no adapter.
export function parseKeyList(text) {
  if (typeof text !== 'string') return []
  const out = []
  for (const part of text.split(',')) {
    const name = part.trim()
    if (V2_KEYS.includes(name) && !out.includes(name)) out.push(name)
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
    if (!V2_KEYS.includes(key)) return false
    const override = readOverrides()[key]
    if (override === true || override === false) return override
    return envKeys.includes(key)
  }

  return {
    isV2,
    keys: () => V2_KEYS.filter(isV2),
    envKeys: () => [...envKeys],
    override: (key) => {
      const v = readOverrides()[key]
      return v === true || v === false ? v : null
    },
    // true / false forces the key on / off on this device; null removes the override.
    // Only ever called by a person or a caller that was told to; nothing here calls it.
    setOverride(key, value) {
      if (!V2_KEYS.includes(key)) throw new TypeError(`migrate: unknown synced key ${JSON.stringify(key)}`)
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
