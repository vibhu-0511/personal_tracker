import { applyCors, handlePreflight, setCache } from './_lib/http.js'

export default function handler(req, res) {
  if (handlePreflight(req, res)) return
  applyCors(req, res)
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD, OPTIONS')
    setCache(res)
    return res.status(405).json({ error: 'GET only' })
  }
  setCache(res) // health must never be served stale
  res.status(200).json({ ok: true })
}
