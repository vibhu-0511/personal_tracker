// Pure record helpers for sync v2 (per-record last-write-wins). No DOM, no storage.
// Applied to provider writes in R2-18; nothing here touches the live sync path.

function recordKey(r) {
  if (r && r.id !== undefined && r.id !== null) return `id:${r.id}`
  if (r && r.date !== undefined && r.date !== null) return `date:${r.date}` // mood entries have no id
  return null
}

function deepEqual(a, b) {
  if (a === b) return true
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false
  if (Array.isArray(a) !== Array.isArray(b)) return false
  const ka = Object.keys(a)
  const kb = Object.keys(b)
  if (ka.length !== kb.length) return false
  return ka.every((k) => Object.prototype.hasOwnProperty.call(b, k) && deepEqual(a[k], b[k]))
}

function sameFields(a, b) {
  const { updatedAt: _a, ...ra } = a
  const { updatedAt: _b, ...rb } = b
  return deepEqual(ra, rb)
}

// Stamp `updatedAt = now` on records of `next` that are new (identity not in `prev`)
// or whose fields differ from the `prev` record with the same id (or date, for mood entries).
// Unchanged records keep their reference (and their existing updatedAt); if the rebuilt
// record lost its stamp, the previous one is carried over. Inputs are not mutated.
export function stampUpdated(prev, next, now) {
  if (!Array.isArray(next)) return next
  const before = new Map()
  for (const r of Array.isArray(prev) ? prev : []) {
    const k = recordKey(r)
    if (k !== null) before.set(k, r)
  }
  return next.map((r) => {
    const k = recordKey(r)
    if (k === null || !r || typeof r !== 'object') return r
    const old = before.get(k)
    if (!old) return { ...r, updatedAt: now }
    if (!sameFields(old, r)) return { ...r, updatedAt: now }
    if (r.updatedAt === undefined && old.updatedAt !== undefined) return { ...r, updatedAt: old.updatedAt }
    return r
  })
}

// Sorted, de-duplicated union of two check-in date-key arrays (YYYY-MM-DD sorts lexically).
export function mergeCheckins(a, b) {
  const set = new Set([...(Array.isArray(a) ? a : []), ...(Array.isArray(b) ? b : [])])
  return [...set].sort()
}

// One entry per date, sorted by date. A source 'logged' entry beats any other source;
// otherwise the higher updatedAt wins, and on a full tie the entry from `b` wins.
export function mergeMoodLog(a, b) {
  const byDate = new Map()
  const take = (e) => {
    if (!e || e.date === undefined || e.date === null) return
    const cur = byDate.get(e.date)
    if (!cur) return byDate.set(e.date, e)
    const curLogged = cur.source === 'logged'
    const eLogged = e.source === 'logged'
    if (curLogged !== eLogged) return eLogged ? byDate.set(e.date, e) : undefined
    if ((e.updatedAt ?? 0) >= (cur.updatedAt ?? 0)) byDate.set(e.date, e)
  }
  for (const e of Array.isArray(a) ? a : []) take(e)
  for (const e of Array.isArray(b) ? b : []) take(e)
  return [...byDate.values()].sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : 0))
}
