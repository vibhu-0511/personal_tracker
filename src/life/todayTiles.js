// Pure data feed for the Today tiles. Takes the raw Life arrays and returns plain
// objects/numbers only (no DOM, no storage, no mutation of inputs).

import { dateKey, earnings, emotionSummary, petState } from './logic.js'
import { dueCounts, overallStreak, taskBuckets, walletTotal } from './selectors.js'
import { levelFromXp, xpFor } from './progress.js'

// lifeTileData(tasks, reminders, habits, moodLog, now) ->
//   streak:    { current, best }  global streak (any habit checked in)
//   wallet:    { total, today }   earnings across all habits
//   pets:      [{ id, species, stage, mood, health }] one per habit
//   tasks:     { overdue, today, next }  open-task counts; next = earliest open task
//              due after today as { id, title, due }, or null
//   reminders: { due, next }  due = open reminders whose time has arrived;
//              next = earliest open future reminder as { id, title, at }, or null
//   mood:      { today, avg, trend }  today's valence (or null), 30-day average and
//              trend (null when the log has no recent entries)
//   level:     { level, pct }  derived from habit earnings plus done tasks
export function lifeTileData(tasks, reminders, habits, moodLog, now) {
  const ts = tasks || []
  const rs = reminders || []
  const hs = habits || []
  const log = moodLog || []

  const todayKey = dateKey(now)
  const buckets = taskBuckets(ts, todayKey)
  const nextTask = buckets.upcoming[0]
  const { remindersDue } = dueCounts(ts, rs, now)
  const nextReminder = rs
    .filter((r) => !r.done && r.at > now.getTime())
    .sort((a, b) => a.at - b.at)[0]
  const summary = emotionSummary(log, now)
  const todayMood = log.find((e) => e.date === todayKey)
  const { level, pct } = levelFromXp(xpFor(hs, ts, now))

  return {
    streak: overallStreak(hs, now),
    wallet: {
      total: walletTotal(hs, now),
      today: hs.reduce((sum, h) => sum + earnings(h, now).today, 0),
    },
    pets: hs.map((h) => {
      const p = petState(h, now)
      return { id: h.id, species: h.species, stage: p.stage, mood: p.mood, health: p.health }
    }),
    tasks: {
      overdue: buckets.overdue.length,
      today: buckets.dueToday.length,
      next: nextTask ? { id: nextTask.id, title: nextTask.title, due: nextTask.due } : null,
    },
    reminders: {
      due: remindersDue,
      next: nextReminder ? { id: nextReminder.id, title: nextReminder.title, at: nextReminder.at } : null,
    },
    mood: {
      today: todayMood ? todayMood.valence : null,
      avg: summary.avgValence,
      trend: summary.trend,
    },
    level: { level, pct },
  }
}
