// Pure helpers for the chip editors. No DOM, no storage.
import { CATEGORIES, MAX_AMOUNT } from '../../money/categories.js'
import { snoozeTime } from '../../life/reminderLogic.js'

// All 12 categories, most recently used first. `recent` is a list of category ids,
// newest first (unknown ids and repeats are ignored). Unused ones keep catalogue order.
export function sortCategories(recent = []) {
  const rank = new Map()
  for (const id of recent) if (!rank.has(id)) rank.set(id, rank.size)
  return CATEGORIES.map((c, i) => ({ c, i }))
    .sort((a, b) => {
      const ra = rank.has(a.c.id) ? rank.get(a.c.id) : Infinity
      const rb = rank.has(b.c.id) ? rank.get(b.c.id) : Infinity
      return ra === rb ? a.i - b.i : ra - rb
    })
    .map((x) => x.c)
}

// Next Saturday 10 AM strictly after `now` (today if it is Saturday before 10 AM).
export function saturdayTenAM(now) {
  const base = now instanceof Date ? now : new Date(now)
  for (let i = 0; i < 8; i++) {
    const cand = new Date(base.getFullYear(), base.getMonth(), base.getDate() + i, 10, 0, 0, 0)
    if (cand.getDay() === 6 && cand.getTime() > base.getTime()) return cand.getTime()
  }
  return null
}

export function whenPresets(now) {
  return [
    { id: 'tonight', label: 'Tonight 8 PM', at: snoozeTime('tonight', now) },
    { id: 'tomorrow', label: 'Tomorrow 9 AM', at: snoozeTime('tomorrow', now) },
    { id: 'saturday', label: 'Sat 10 AM', at: saturdayTenAM(now) },
  ]
}

const pad = (n) => String(n).padStart(2, '0')

// epoch ms -> value for <input type="datetime-local"> (local time, minute precision)
export function toLocalInput(ms) {
  const d = new Date(ms)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// datetime-local value -> epoch ms, or null when empty or invalid
export function fromLocalInput(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(s || '')
  if (!m) return null
  const t = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]).getTime()
  return Number.isNaN(t) ? null : t
}

// Typed text -> a rupee amount in (0, MAX_AMOUNT], at most 2 decimals; else null.
export function parseAmount(text) {
  const s = String(text ?? '').replace(/[₹,\s]/g, '')
  if (!/^\d*\.?\d{0,2}$/.test(s) || s === '' || s === '.') return null
  const n = Number(s)
  return n > 0 && n <= MAX_AMOUNT ? n : null
}
