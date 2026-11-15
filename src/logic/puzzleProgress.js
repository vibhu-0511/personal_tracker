// Puzzle progress entries. Old data stores `id: true`; new data stores
// `id: { solved, at }` where `at` is the ms timestamp of the solve (or null when
// the date is unknown). Pure and React-free; `now` is injectable for tests.

export function normalize(entry) {
  if (entry && typeof entry === 'object') {
    const at = Number.isFinite(entry.at) ? entry.at : null
    return { solved: !!entry.solved, at }
  }
  return { solved: !!entry, at: null }
}

// Normalize a whole progress map; unsolved entries are dropped.
export function normalizeAll(progress) {
  const out = {}
  for (const [id, v] of Object.entries(progress || {})) {
    const n = normalize(v)
    if (n.solved) out[id] = n
  }
  return out
}

export function isSolved(progress, id) {
  return normalize(progress?.[id]).solved
}

// Returns a new map with `id` solved at `now`. A repeat call keeps the first date.
export function markSolved(progress, id, now = Date.now()) {
  const prev = normalize(progress?.[id])
  const at = prev.solved && prev.at != null ? prev.at : now
  return { ...(progress || {}), [id]: { solved: true, at } }
}

export function unmark(progress, id) {
  const next = { ...(progress || {}) }
  delete next[id]
  return next
}

// Local calendar day key, "YYYY-MM-DD".
export function dayKey(ms) {
  const d = new Date(ms)
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

// Count of solves dated on `key`. Undated (legacy) solves never count.
export function solvedOn(progress, key) {
  return Object.values(progress || {}).filter((v) => {
    const n = normalize(v)
    return n.solved && n.at != null && dayKey(n.at) === key
  }).length
}

// Storage form: undated solves go back to plain `true` so old readers and old
// data are unchanged; dated solves keep their object.
export function toStored(progress) {
  const out = {}
  for (const [id, v] of Object.entries(progress || {})) {
    const n = normalize(v)
    if (!n.solved) continue
    out[id] = n.at == null ? true : { solved: true, at: n.at }
  }
  return out
}
