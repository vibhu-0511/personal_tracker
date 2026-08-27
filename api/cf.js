import { pickProblems } from './_lib/pickProblems.js'

async function cfGet(path) {
  const r = await fetch(`https://codeforces.com/api/${path}`)
  const j = await r.json()
  if (j.status !== 'OK') throw new Error(j.comment || `Codeforces error on ${path}`)
  return j.result
}

// Cached per warm serverless instance; the problemset changes rarely.
let problemsCache = null

export default async function handler(req, res) {
  const handle = (req.query.handle || '').trim()
  if (!handle) return res.status(400).json({ error: 'handle required' })

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

    const problems = pickProblems(problemsCache, info.rating, solvedIds).map((p) => ({
      id: `${p.contestId}${p.index}`,
      name: p.name,
      rating: p.rating,
      tags: p.tags || [],
      url: `https://codeforces.com/problemset/problem/${p.contestId}/${p.index}`,
    }))

    res.status(200).json({ rating: info.rating ?? null, problems, tagCounts })
  } catch (e) {
    res.status(502).json({ error: String((e && e.message) || e) })
  }
}
