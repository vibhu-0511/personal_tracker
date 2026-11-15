// Pure view helpers for the Habits screen (R2-13). No DOM, no storage.
import { dateKey } from './logic.js'

// The last `n` calendar days ending on `now`'s local day, oldest first:
//   lastNDays(checkins, now, 30) -> [{ date: 'YYYY-MM-DD', checked: boolean }]
// Days are stepped with the local y/m/d constructor, never by adding 86400000 ms, so a
// 23h or 25h day (DST change) cannot skip or repeat a date. Month and year ends roll over
// through Date's own day arithmetic. Check-ins are the same dateKey strings logic.js stores.
export function lastNDays(checkins, now, n = 30) {
  const count = Math.floor(n)
  if (!(count > 0)) return []
  const set = new Set(checkins || [])
  const y = now.getFullYear()
  const m = now.getMonth()
  const d = now.getDate()
  const out = []
  for (let i = count - 1; i >= 0; i--) {
    const date = dateKey(new Date(y, m, d - i))
    out.push({ date, checked: set.has(date) })
  }
  return out
}

// How many of the given days are checked, for a "n of 30" caption.
export function checkedCount(days) {
  return days.reduce((sum, day) => sum + (day.checked ? 1 : 0), 0)
}
