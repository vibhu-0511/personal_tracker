// Which local days have expenses logged, and the run of consecutive logged days.
// A day counts as logged when it has any transaction (expense or income) or a no-spend mark.
// Entries are { date (ms) }; dailyLog is { 'YYYY-MM-DD': { noSpend?: boolean } }. Day keys are local dates.
import { dateKey } from '../life/logic.js'

// Set of local day keys that were logged.
export function loggedDays(expenses, dailyLog) {
  const days = new Set()
  for (const e of expenses || []) days.add(dateKey(new Date(e.date)))
  for (const [key, v] of Object.entries(dailyLog || {})) if (v && v.noSpend) days.add(key)
  return days
}

// Consecutive logged days ending today, or yesterday when today is not logged yet. 0 if neither is logged.
export function logStreak(expenses, dailyLog, now = Date.now()) {
  const days = loggedDays(expenses, dailyLog)
  const d = new Date(now)
  let cursor = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  if (!days.has(dateKey(cursor))) cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() - 1)
  let n = 0
  while (days.has(dateKey(cursor))) {
    n++
    cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() - 1)
  }
  return n
}

// One boolean per day of the local month, from the 1st up to and including today.
export function monthStrip(expenses, dailyLog, now = Date.now()) {
  const days = loggedDays(expenses, dailyLog)
  const d = new Date(now)
  const strip = []
  for (let day = 1; day <= d.getDate(); day++) {
    strip.push(days.has(dateKey(new Date(d.getFullYear(), d.getMonth(), day))))
  }
  return strip
}
