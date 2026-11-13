// Pure task/reminder/habit selectors for the Life tab. No DOM, no storage.
// Extracted from the logic that used to live inline in Life.jsx (matchesUrgency,
// task bucketing, wallet and due counts) so it can be unit tested.

import { dateKey, earnings, streaks } from './logic.js'

// Quadrant ids, in the same vocabulary as the Tasks urgency filter.
// 'urgent' means urgent AND important (the top-priority quadrant).
export const QUADRANTS = ['urgent', 'important', 'not-important', 'extras']

// Mirrors the old inline matchesUrgency(t, f). Unknown filters (incl. 'all') match everything.
export function matchesUrgency(t, f) {
  if (f === 'urgent') return Boolean(t.urgent && t.important)
  if (f === 'important') return Boolean(t.important && !t.urgent)
  if (f === 'not-important') return Boolean(t.urgent && !t.important)
  if (f === 'extras') return !t.urgent && !t.important
  return true
}

// The single quadrant a task belongs to; consistent with matchesUrgency.
export function quadrantOf(t) {
  if (t.urgent && t.important) return 'urgent'
  if (t.important) return 'important'
  if (t.urgent) return 'not-important'
  return 'extras'
}

// Number of open (not done) tasks per quadrant.
export function quadrantCounts(tasks) {
  const counts = { urgent: 0, important: 0, 'not-important': 0, extras: 0 }
  for (const t of tasks) {
    if (!t.done) counts[quadrantOf(t)]++
  }
  return counts
}

// Same bucketing as the old Tasks view: overdue / dueToday / upcoming (sorted by due
// ascending) / noDate, all open tasks, plus done. Input order is preserved within buckets.
export function taskBuckets(tasks, todayKey) {
  return {
    overdue: tasks.filter((t) => !t.done && t.due && t.due < todayKey),
    dueToday: tasks.filter((t) => !t.done && t.due === todayKey),
    upcoming: tasks
      .filter((t) => !t.done && t.due && t.due > todayKey)
      .sort((a, b) => a.due.localeCompare(b.due)),
    noDate: tasks.filter((t) => !t.done && !t.due),
    done: tasks.filter((t) => t.done),
  }
}

// Open tasks due today and reminders whose time has arrived.
export function dueCounts(tasks, reminders, now) {
  const today = dateKey(now)
  return {
    tasksDueToday: tasks.filter((t) => !t.done && t.due === today).length,
    remindersDue: reminders.filter((r) => !r.done && r.at <= now.getTime()).length,
  }
}

// Total earned across all habits (same sum the Life header wallet showed).
export function walletTotal(habits, now) {
  return habits.reduce((sum, h) => sum + earnings(h, now).total, 0)
}

// Global streak: a day counts when ANY habit was checked in. Returns {current, best}
// with the same semantics as streaks() (current survives until end of day).
export function overallStreak(habits, now) {
  const days = new Set()
  for (const h of habits) for (const k of h.checkins ?? []) days.add(k)
  return streaks([...days], now)
}
