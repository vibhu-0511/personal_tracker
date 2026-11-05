// Pure helpers for the Claude token-usage tracker. No I/O.

export const SOURCES = [
  { id: 'claude-code', label: 'Claude Code' },
  { id: 'claude-ai', label: 'claude.ai' },
  { id: 'api', label: 'API' },
  { id: 'other', label: 'Other' },
]

export const entryTotal = (e) =>
  (e.input || 0) + (e.output || 0) + (e.cacheRead || 0) + (e.cacheWrite || 0)

export function startOfDay(ts) {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

// Monday-based week start.
export function startOfWeek(ts) {
  const d = new Date(startOfDay(ts))
  const offset = (d.getDay() + 6) % 7
  d.setDate(d.getDate() - offset)
  return d.getTime()
}

export function sumTokens(entries) {
  return entries.reduce((s, e) => s + entryTotal(e), 0)
}

export function totalsSince(entries, since) {
  return sumTokens(entries.filter((e) => e.date >= since))
}

// Last `days` days (oldest first) with per-day totals, for the bar chart.
export function dailySeries(entries, days = 7, now = Date.now()) {
  const today = startOfDay(now)
  const out = []
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    out.push({ day: d.getTime(), total: 0 })
  }
  const idx = new Map(out.map((o, i) => [o.day, i]))
  for (const e of entries) {
    const i = idx.get(startOfDay(e.date))
    if (i !== undefined) out[i].total += entryTotal(e)
  }
  return out
}

export function bySource(entries) {
  const m = {}
  for (const e of entries) m[e.source] = (m[e.source] || 0) + entryTotal(e)
  return Object.entries(m).sort((a, b) => b[1] - a[1])
}

export function formatTokens(n) {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`
  if (n >= 1e3) return `${(n / 1e3).toFixed(n >= 1e5 ? 0 : 1)}k`
  return String(n)
}

// Accepts "12k", "1.5m", "12,000", "12000"; returns a non-negative int or null.
export function parseTokens(str) {
  const s = String(str ?? '').trim().toLowerCase().replace(/[, _]/g, '')
  if (!s) return 0
  const m = s.match(/^(\d+(?:\.\d+)?)([kmb])?$/)
  if (!m) return null
  const mult = { k: 1e3, m: 1e6, b: 1e9 }[m[2]] || 1
  return Math.round(parseFloat(m[1]) * mult)
}
