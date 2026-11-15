// Pure helpers for the capture sheet's non-text panels (Habit, Solve, Mood). No DOM, no storage.
import { dateKey, MANUAL_MOODS } from '../../life/logic.js'
import { dayKey } from '../../logic/puzzleProgress.js'

// Same wording as the Mood daily on Today (src/today/dailies.js).
const MOOD_NAMES = { 0: 'Awful', 25: 'Bad', 50: 'Okay', 75: 'Good', 100: 'Great' }

// The five existing moods: { value, emoji, label }.
export const MOODS = MANUAL_MOODS.map((m) => ({ ...m, label: MOOD_NAMES[m.value] }))

// Habits with no check-in for the local day of `now` (ms or Date), in stored order.
export function uncheckedHabits(habits, now = Date.now()) {
  const key = dateKey(new Date(now))
  return (habits || []).filter((h) => h && !(h.checkins ?? []).includes(key))
}

// A "Solved a problem" tap becomes a solved entry in the code `progress` map, so it counts in
// solvedToday/codeRing. Returns { id, status, tags } ready for markProblem(id, status, tags).
export function quickSolve(now = Date.now()) {
  return { id: `quick-${now}`, status: 'solved', tags: [] }
}

// dailyLog with today's puzzle marked done (what the Puzzle daily reads). Pure; keeps other fields.
export function markPuzzleDone(log, now = Date.now()) {
  const key = dayKey(now)
  return { ...(log || {}), [key]: { ...(log || {})[key], puzzle: true } }
}

export function isPuzzleDone(log, now = Date.now()) {
  return log?.[dayKey(now)]?.puzzle === true
}
