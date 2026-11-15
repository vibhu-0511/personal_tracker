// Pure Logic helpers: React-free, so the Home bundle can import them without
// loading the lazy Logic chunk. Every date-dependent function takes an optional
// `now` (ms) so tests can pin the clock.
import { EXAMS } from './examData.js'

const DAY_MS = 86400000

function localMidnight(ms) {
  return new Date(ms).setHours(0, 0, 0, 0)
}

// Same rule as the old Today.jsx solvedToday: solved entries updated at or after
// local midnight.
export function solvedToday(progress, now = Date.now()) {
  const start = localMidnight(now)
  return Object.values(progress || {}).filter(
    (p) => p && p.status === 'solved' && p.updatedAt >= start
  ).length
}

// Code ring: today's solved count against a daily goal.
// Returns { done, goal, pct (0..1, capped), reached }.
export function codeRing(progress, goal = 3, now = Date.now()) {
  const g = Number.isFinite(goal) && goal > 0 ? Math.floor(goal) : 3
  const done = solvedToday(progress, now)
  return { done, goal: g, pct: Math.min(1, done / g), reached: done >= g }
}

// Local calendar day index (days since epoch of the local date). Consecutive
// local days differ by exactly 1, across DST changes too.
function localDayIndex(ms) {
  const d = new Date(ms)
  return Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY_MS)
}

// Streak of consecutive local days with at least one solved problem.
// `current` stays alive while today is still empty (it counts back from
// yesterday), and is 0 once a whole local day was missed.
// Returns { current, best }.
export function codeStreak(progress, now = Date.now()) {
  const days = new Set()
  for (const p of Object.values(progress || {})) {
    if (p && p.status === 'solved' && Number.isFinite(p.updatedAt)) {
      days.add(localDayIndex(p.updatedAt))
    }
  }
  if (days.size === 0) return { current: 0, best: 0 }

  const sorted = [...days].sort((a, b) => a - b)
  let best = 1
  let run = 1
  for (let i = 1; i < sorted.length; i++) {
    run = sorted[i] === sorted[i - 1] + 1 ? run + 1 : 1
    if (run > best) best = run
  }

  const today = localDayIndex(now)
  let cursor = days.has(today) ? today : today - 1
  let current = 0
  while (days.has(cursor)) {
    current++
    cursor--
  }
  return { current, best }
}

// Seed that changes at local midnight (the old Puzzles.jsx seed rolled over at
// UTC midnight). One integer per local calendar day.
export function localDaySeed(now = Date.now()) {
  return localDayIndex(now)
}

// Deterministic shuffle: the same (arr, seed) always gives the same order.
// Identical algorithm to the former Puzzles.jsx shuffleDaily.
export function shuffleDaily(arr, seed) {
  const copy = [...arr]
  let s = seed
  for (let i = copy.length - 1; i > 0; i--) {
    s = (s * 9301 + 49297) % 233280
    const j = s % (i + 1)
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

export const examTopicKey = (examId, section, topic) => `${examId}::${section}::${topic}`

// Exam completion over the known syllabus. Only keys that name a real topic and
// are truthy count, so orphaned keys cannot push the total past 100%.
// Returns { done, total, pct } with pct an integer 0..100.
export function examTotals(examProgress, exams = EXAMS) {
  const progress = examProgress || {}
  let done = 0
  let total = 0
  for (const ex of exams) {
    for (const sec of ex.sections) {
      for (const topic of sec.topics) {
        total++
        if (progress[examTopicKey(ex.id, sec.name, topic)]) done++
      }
    }
  }
  const pct = total ? Math.min(100, Math.round((done / total) * 100)) : 0
  return { done, total, pct }
}
