// Pure reminder rules: snooze presets, repeat rules and rescheduling. No DOM, no storage.
// All times are epoch ms; calendar maths use the local time zone and keep the wall-clock
// time of day across DST changes (a time that does not exist that day, such as 2:30 AM on
// spring-forward, lands on the next valid instant, as `new Date(y, m, d, h, mi)` does).
//
// New optional reminder fields (old reminders without them stay valid):
//   repeat:      { type: 'none'|'daily'|'weekly'|'monthly', days?: number[], day?: number }
//                days = chosen weekdays for weekly (0 = Sunday); day = monthly anchor day.
//                A bare string such as 'daily' is accepted too.
//   snoozedFrom: the `at` the reminder had before its first snooze.

export const SNOOZE_PRESETS = ['1h', 'tonight', 'tomorrow']
export const REPEAT_TYPES = ['none', 'daily', 'weekly', 'monthly']

const HOUR = 3_600_000

function withTime(date, h, mi = 0) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), h, mi, 0, 0)
}

function daysInMonth(y, m) {
  return new Date(y, m + 1, 0).getDate()
}

// Epoch ms a snooze preset resolves to, relative to `now`.
//   1h       one hour from now
//   tonight  8 PM today; if that has passed, 8 PM tomorrow
//   tomorrow 9 AM tomorrow
export function snoozeTime(preset, now) {
  const base = now instanceof Date ? now : new Date(now)
  if (preset === '1h') return base.getTime() + HOUR
  const tomorrow = new Date(base.getFullYear(), base.getMonth(), base.getDate() + 1)
  if (preset === 'tomorrow') return withTime(tomorrow, 9).getTime()
  if (preset === 'tonight') {
    const tonight = withTime(base, 20).getTime()
    return tonight > base.getTime() ? tonight : withTime(tomorrow, 20).getTime()
  }
  throw new Error(`Unknown snooze preset: ${preset}`)
}

// Normalise a repeat value to { type, days, day }; unknown or missing means none.
export function normalizeRepeat(repeat) {
  if (!repeat) return { type: 'none' }
  const r = typeof repeat === 'string' ? { type: repeat } : repeat
  if (!REPEAT_TYPES.includes(r.type)) return { type: 'none' }
  const out = { type: r.type }
  if (r.type === 'weekly' && Array.isArray(r.days)) {
    const days = [...new Set(r.days.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))]
    out.days = days.sort((a, b) => a - b)
  }
  if (r.type === 'monthly' && Number.isInteger(r.day) && r.day >= 1 && r.day <= 31) out.day = r.day
  return out
}

export function isRepeating(reminder) {
  return normalizeRepeat(reminder?.repeat).type !== 'none'
}

// The first occurrence strictly after `after` (epoch ms) at the time of day of `at`,
// or null when the rule is none (or weekly with no valid weekday and no fallback).
export function nextOccurrence(at, repeat, after = at) {
  const r = normalizeRepeat(repeat)
  if (r.type === 'none') return null
  const start = new Date(at)
  const h = start.getHours()
  const mi = start.getMinutes()
  const floor = Math.max(at, after)
  const y = start.getFullYear()
  const m = start.getMonth()
  const d = start.getDate()

  if (r.type === 'daily' || r.type === 'weekly') {
    const days = r.type === 'weekly' ? (r.days?.length ? r.days : [start.getDay()]) : null
    for (let i = 1; i < 800; i++) {
      const cand = new Date(y, m, d + i, h, mi)
      if (cand.getTime() <= floor) continue
      if (!days || days.includes(cand.getDay())) return cand.getTime()
    }
    return null
  }

  // monthly: keep the anchor day, clamped to the last day of shorter months
  const anchor = r.day ?? d
  for (let i = 1; i < 1300; i++) {
    const ym = m + i
    const first = new Date(y, ym, 1)
    const day = Math.min(anchor, daysInMonth(first.getFullYear(), first.getMonth()))
    const cand = new Date(first.getFullYear(), first.getMonth(), day, h, mi)
    if (cand.getTime() > floor) return cand.getTime()
  }
  return null
}

// Snooze: move `at` to the preset time and remember where it came from. Snoozing again
// keeps the original snoozedFrom.
export function snooze(reminder, preset, now) {
  return {
    ...reminder,
    at: snoozeTime(preset, now),
    snoozedFrom: reminder.snoozedFrom ?? reminder.at,
    done: false,
  }
}

// Reschedule to an explicit time; clears the snooze marker.
export function reschedule(reminder, at) {
  const { snoozedFrom, ...rest } = reminder
  return { ...rest, at: at instanceof Date ? at.getTime() : at, done: false }
}

// Complete a reminder. One-off: marked done. Repeating: stays open and moves to its next
// occurrence after both the scheduled time and `now` (missed occurrences are skipped).
// A monthly rule records its anchor day so a clamped month (31st -> 28th) does not drift.
export function complete(reminder, now) {
  const r = normalizeRepeat(reminder.repeat)
  if (r.type === 'none') return { ...reminder, done: true }
  const base = reminder.snoozedFrom ?? reminder.at
  const nowMs = now instanceof Date ? now.getTime() : now
  const next = nextOccurrence(base, r, nowMs)
  if (next == null) return { ...reminder, done: true }
  const { snoozedFrom, ...rest } = reminder
  const repeat =
    r.type === 'monthly' && r.day == null ? { ...r, day: new Date(base).getDate() } : reminder.repeat
  return { ...rest, repeat, at: next, done: false }
}
