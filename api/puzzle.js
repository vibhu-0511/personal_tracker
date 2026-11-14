import { applyCors, handlePreflight, setCache } from './_lib/http.js'

export default async function handler(req, res) {
  if (handlePreflight(req, res)) return
  applyCors(req, res)
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD, OPTIONS')
    setCache(res)
    return res.status(405).json({ error: 'GET only' })
  }
  try {
    const r = await fetch('https://lichess.org/api/puzzle/daily')
    if (!r.ok) throw new Error(`Lichess responded ${r.status}`)
    const { puzzle } = await r.json()
    // The daily puzzle changes once a day; let the CDN absorb repeat hits.
    setCache(res, { sMaxAge: 600, staleWhileRevalidate: 3600 })
    res.status(200).json({
      id: puzzle.id,
      rating: puzzle.rating,
      themes: puzzle.themes || [],
      url: `https://lichess.org/training/${puzzle.id}`,
    })
  } catch (e) {
    console.error('puzzle handler error', e)
    setCache(res)
    res.status(502).json({ error: 'Could not fetch today\'s puzzle' })
  }
}
