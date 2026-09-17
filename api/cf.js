import { pickProblems } from './_lib/pickProblems.js'

// Codeforces' own comment (e.g. "handles: User with handle X not found") is a
// short, user-facing string worth showing as-is — unlike a raw fetch/parse
// exception, which shouldn't reach the client.
class CFApiError extends Error {}

async function cfGet(path) {
  const r = await fetch(`https://codeforces.com/api/${path}`)
  const j = await r.json()
  if (j.status !== 'OK') throw new CFApiError(j.comment || `Codeforces error on ${path}`)
  return j.result
}

let problemsCache = null

function toFiniteOrUndefined(v) {
  if (v === undefined || v === '') return undefined
  const n = Number(v)
  return Number.isFinite(n) ? n : undefined
}

function toNonNegativeInt(v, fallback) {
  const n = Number(v)
  return Number.isInteger(n) && n >= 0 ? n : fallback
}

export default async function handler(req, res) {
  const handle = (req.query.handle || '').trim()
  if (!handle) return res.status(400).json({ error: 'handle required' })

  const ratingMin = toFiniteOrUndefined(req.query.ratingMin)
  const ratingMax = toFiniteOrUndefined(req.query.ratingMax)
  const tags = req.query.tags ? req.query.tags.split(',').map((t) => t.trim()).filter(Boolean) : undefined
  const page = req.query.page ? toNonNegativeInt(req.query.page, 0) : 0

  const h = encodeURIComponent(handle)
  try {
    if (!problemsCache) {
      problemsCache = (await cfGet('problemset.problems')).problems
    }
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

    const result = pickProblems(problemsCache, info.rating, solvedIds, {
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

    res.status(200).json({
      rating: info.rating ?? null,
      problems,
      tagCounts,
      total: result.total,
      hasMore: result.hasMore,
      page,
    })
  } catch (e) {
    if (e instanceof CFApiError) return res.status(502).json({ error: e.message })
    console.error('cf handler error', e)
    res.status(502).json({ error: 'Could not reach Codeforces' })
  }
}
