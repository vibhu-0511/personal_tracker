import { pickProblems } from './_lib/pickProblems.js'
import { applyCors, handlePreflight, setCache } from './_lib/http.js'

// Codeforces' own comment (e.g. "handles: User with handle X not found") is a
// short, user-facing string worth showing as-is — unlike a raw fetch/parse
// exception, which shouldn't reach the client.
class CFApiError extends Error {
  constructor(message, status = 502) {
    super(message)
    this.name = 'CFApiError'
    this.status = status
  }
}

// Upstream calls must not hang the function until the platform kills it.
export const CF_TIMEOUT_MS = 8000
// The full problemset is large and changes slowly; refresh it hourly.
export const PROBLEMS_CACHE_TTL_MS = 60 * 60 * 1000
export const RATE_LIMIT_MESSAGE = 'Codeforces is rate-limiting requests right now. Please try again in a minute.'

async function cfGet(path) {
  const r = await fetch(`https://codeforces.com/api/${path}`, {
    signal: AbortSignal.timeout(CF_TIMEOUT_MS),
  })
  // Codeforces answers FAILED calls (unknown handle, call limit) with a non-2xx
  // status *and* a JSON body, so parse first and only fall back to the HTTP
  // status when the body carries no usable verdict.
  let j
  try {
    j = await r.json()
  } catch {
    if (r.status === 429) throw new CFApiError(RATE_LIMIT_MESSAGE, 429)
    throw new Error(`Codeforces returned a non-JSON response (${r.status}) on ${path}`)
  }
  if (!j || typeof j !== 'object') throw new Error(`Unexpected Codeforces payload on ${path}`)
  if (j.status !== 'OK') {
    const comment = typeof j.comment === 'string' ? j.comment : ''
    if (r.status === 429 || /call limit exceeded/i.test(comment)) {
      throw new CFApiError(RATE_LIMIT_MESSAGE, 429)
    }
    throw new CFApiError(comment || `Codeforces error on ${path}`)
  }
  if (!r.ok) throw new Error(`Codeforces responded ${r.status} on ${path}`)
  return j.result
}

let problemsCache = null // { problems, at }

// Test hook: drop the module-level cache.
export function resetProblemsCache() {
  problemsCache = null
}

async function getProblems() {
  const now = Date.now()
  if (problemsCache && now - problemsCache.at < PROBLEMS_CACHE_TTL_MS) return problemsCache.problems
  const result = await cfGet('problemset.problems')
  if (!result || !Array.isArray(result.problems)) throw new Error('Unexpected problemset payload')
  problemsCache = { problems: result.problems, at: now }
  return problemsCache.problems
}

function toFiniteOrUndefined(v) {
  if (v === undefined || v === '') return undefined
  const n = Number(v)
  return Number.isFinite(n) ? n : undefined
}

function toNonNegativeInt(v, fallback) {
  const n = Number(v)
  return Number.isInteger(n) && n >= 0 ? n : fallback
}

// Codeforces handles are at most 24 characters; 50 leaves slack without letting
// an arbitrarily long string be forwarded upstream.
export const MAX_HANDLE_LENGTH = 50

const qstr = (v) => (typeof v === 'string' ? v : '')

export default async function handler(req, res) {
  if (handlePreflight(req, res)) return
  applyCors(req, res)
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD, OPTIONS')
    setCache(res)
    return res.status(405).json({ error: 'GET only' })
  }
  setCache(res) // errors are never cached; success overrides below
  const handle = qstr(req.query.handle).trim()
  if (!handle) return res.status(400).json({ error: 'handle required' })
  if (handle.length > MAX_HANDLE_LENGTH) return res.status(400).json({ error: 'handle is too long' })

  const ratingMin = toFiniteOrUndefined(req.query.ratingMin)
  const ratingMax = toFiniteOrUndefined(req.query.ratingMax)
  const tags = qstr(req.query.tags) ? qstr(req.query.tags).split(',').map((t) => t.trim()).filter(Boolean) : undefined
  const page = qstr(req.query.page) ? toNonNegativeInt(req.query.page, 0) : 0

  const h = encodeURIComponent(handle)
  try {
    const pool = await getProblems()
    const [info] = await cfGet(`user.info?handles=${h}`)
    const subs = await cfGet(`user.status?handle=${h}&from=1&count=10000`)

    const solvedIds = new Set()
    const tagCounts = {}
    for (const s of subs) {
      if (s.verdict !== 'OK' || !s.problem) continue
      const id = `${s.problem.contestId}${s.problem.index}`
      if (solvedIds.has(id)) continue
      solvedIds.add(id)
      for (const t of s.problem.tags || []) tagCounts[t] = (tagCounts[t] || 0) + 1
    }

    const result = pickProblems(pool, info.rating, solvedIds, {
      ratingMin,
      ratingMax,
      tags,
      offset: page * 20,
    })

    const problems = result.items.map((p) => ({
      id: `${p.contestId}${p.index}`,
      name: p.name,
      rating: p.rating,
      tags: p.tags || [],
      url: `https://codeforces.com/problemset/problem/${p.contestId}/${p.index}`,
    }))

    // Per-handle results; a short CDN cache spares Codeforces on repeat hits.
    setCache(res, { sMaxAge: 120, staleWhileRevalidate: 300 })
    res.status(200).json({
      rating: info.rating ?? null,
      problems,
      tagCounts,
      total: result.total,
      hasMore: result.hasMore,
      page,
    })
  } catch (e) {
    if (e instanceof CFApiError) {
      if (e.status === 429) res.setHeader('Retry-After', '60')
      return res.status(e.status).json({ error: e.message })
    }
    console.error('cf handler error', e)
    res.status(502).json({ error: 'Could not reach Codeforces' })
  }
}
