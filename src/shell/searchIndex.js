// Pure search over screens, tasks and notes for the command palette. No React,
// no DOM: unit-tested in node (test/searchIndex.test.js).
import { ROUTES, TAB_IDS } from '../routes.js'

const norm = (s) => (typeof s === 'string' ? s : s == null ? '' : String(s)).toLowerCase()
const isWordStart = (text, i) => i === 0 || /[^a-z0-9]/.test(text[i - 1])

// Fuzzy score of `query` against `text`, case-insensitive. Returns null when
// the query is not a subsequence of the text, otherwise a number where bigger
// is better. Tiers: exact > prefix > word prefix > substring > subsequence.
// An empty query matches everything with score 0.
export function fuzzyScore(query, text) {
  const q = norm(query).trim()
  const t = norm(text)
  if (!q) return 0
  if (!t) return null
  if (t === q) return 1000
  if (t.startsWith(q)) return 800 - Math.min(t.length - q.length, 100)
  const at = t.indexOf(q)
  if (at !== -1) {
    // Prefer a substring that starts a word over one in the middle of a word.
    for (let i = at; i !== -1; i = t.indexOf(q, i + 1)) {
      if (isWordStart(t, i)) return 600 - Math.min(i, 100)
    }
    return 400 - Math.min(at, 100)
  }
  // Subsequence: reward consecutive runs and word starts, penalise gaps.
  let score = 100
  let ti = 0
  let prev = -2
  for (const ch of q) {
    const found = t.indexOf(ch, ti)
    if (found === -1) return null
    if (found === prev + 1) score += 10
    else score -= Math.min(found - ti, 10)
    if (isWordStart(t, found)) score += 5
    prev = found
    ti = found + 1
  }
  return Math.max(score, 1)
}

// Score an item against several fields; the title counts fully, extra fields
// (keywords, note body) at a discount so a title hit always outranks them.
export function scoreFields(query, title, extras = []) {
  let best = fuzzyScore(query, title)
  for (const extra of extras) {
    const s = fuzzyScore(query, extra)
    if (s !== null && s > 0) {
      const discounted = Math.floor(s / 4)
      if (best === null || discounted > best) best = discounted
    }
  }
  return best
}

// Stable sort of `items` by descending score; non-matches are dropped. With an
// empty query every item is kept in its original order.
export function rank(items, query, scorer, limit = Infinity) {
  const scored = []
  items.forEach((item, order) => {
    const score = scorer(item)
    if (score !== null) scored.push({ item, score, order })
  })
  if (norm(query).trim()) scored.sort((a, b) => b.score - a.score || a.order - b.order)
  return scored.slice(0, limit).map((s) => s.item)
}

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1)
const clip = (s, n = 80) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)

// One entry per tab and per tab sub-view, derived from the route table.
export function screenEntries() {
  const out = []
  for (const tab of TAB_IDS) {
    const { label, views } = ROUTES[tab]
    out.push({ id: `screen:${tab}`, kind: 'screen', title: label, subtitle: 'Screen', path: `/${tab}` })
    for (const view of views) {
      out.push({
        id: `screen:${tab}/${view}`,
        kind: 'screen',
        title: `${label} · ${cap(view)}`,
        subtitle: 'Screen',
        path: `/${tab}/${view}`,
      })
    }
  }
  return out
}

// Build a flat list of searchable entries. Tasks use `title`, notes use `body`
// (the shape in src/tabs/Notes.jsx). Malformed rows are skipped, not thrown.
export function buildIndex({ tasks = [], notes = [] } = {}) {
  const entries = screenEntries()
  for (const t of Array.isArray(tasks) ? tasks : []) {
    if (!t || typeof t.title !== 'string' || !t.title.trim()) continue
    entries.push({
      id: `task:${t.id ?? t.title}`,
      kind: 'task',
      title: t.title,
      subtitle: t.done ? 'Task · done' : 'Task',
      path: '/life/tasks',
      ref: t.id ?? null,
    })
  }
  for (const n of Array.isArray(notes) ? notes : []) {
    const body = n && typeof n.body === 'string' ? n.body.trim() : ''
    if (!body) continue
    const firstLine = body.split('\n', 1)[0]
    entries.push({
      id: `note:${n.id ?? body}`,
      kind: 'note',
      title: clip(firstLine),
      subtitle: 'Note',
      path: '/life/notes',
      ref: n.id ?? null,
      text: body,
    })
  }
  return entries
}

// Rank index entries for a query. With no query only screens are returned
// (tasks and notes would be an unbounded list).
export function searchIndex(entries, query, limit = 20) {
  const q = norm(query).trim()
  const pool = q ? entries : entries.filter((e) => e.kind === 'screen')
  return rank(pool, q, (e) => scoreFields(q, e.title, e.text ? [e.text] : []), limit)
}
