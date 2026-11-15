import { toICS, validateICSInput } from './_lib/ics.js'
import { applyCors, handlePreflight, setCache } from './_lib/http.js'

export default function handler(req, res) {
  if (handlePreflight(req, res)) return
  applyCors(req, res)
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD, OPTIONS')
    setCache(res)
    return res.status(405).json({ error: 'GET only' })
  }
  setCache(res) // each download gets a fresh UID/DTSTAMP, so never share-cache it
  const q = req.query || {}
  const title = typeof q.title === 'string' ? q.title : ''
  const start = typeof q.start === 'string' ? q.start : ''
  const out = validateICSInput({ title, start })
  if (out.error) return res.status(400).json({ error: out.error })

  res.setHeader('Content-Type', 'text/calendar; charset=utf-8')
  res.setHeader('Content-Disposition', 'attachment; filename=reminder.ics')
  res.end(toICS({ title: out.title, start: out.start }))
}
