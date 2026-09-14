import { toICS, validateICSInput } from './_lib/ics.js'

export default function handler(req, res) {
  const { title, start } = req.query
  const out = validateICSInput({ title, start })
  if (out.error) return res.status(400).json({ error: out.error })

  res.setHeader('Content-Type', 'text/calendar; charset=utf-8')
  res.setHeader('Content-Disposition', 'attachment; filename=reminder.ics')
  res.end(toICS({ title: out.title, start: out.start }))
}
