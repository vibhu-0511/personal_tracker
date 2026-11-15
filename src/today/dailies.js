// The five Today dailies, computed from stored data. Pure and React-free; `now` (ms) is injectable.
// Order is fixed: habits, spend, mood, code, puzzle.
// Each item: { id, label, value (text), done, counted, href }. `counted` is false when the daily
// does not apply (no habits yet), so it is left out of the done/total ring.
import { dateKey } from '../life/logic.js'
import { codeRing } from '../logic/stats.js'
import { solvedOn, dayKey } from '../logic/puzzleProgress.js'
import { loggedDays } from '../money/dayLog.js'
import { formatRupees } from '../money/format.js'

const DEFAULT_CODE_GOAL = 3
const MOOD_LABELS = [[0, 'Awful'], [25, 'Bad'], [50, 'Okay'], [75, 'Good'], [100, 'Great']]

function moodLabel(valence) {
  let best = MOOD_LABELS[0]
  for (const m of MOOD_LABELS) if (Math.abs(m[0] - valence) < Math.abs(best[0] - valence)) best = m
  return best[1]
}

// data: { habits, expenses, dailyLog, moodLog, progress (code), puzzleProgress, settings, enabled }
// `enabled` is an optional list of daily ids that count (Settings > Dailies); default all five.
export function computeDailies(data = {}, now = Date.now()) {
  const { habits = [], expenses = [], dailyLog = {}, moodLog = [], progress = {}, puzzleProgress = {}, settings = {} } = data
  const key = dayKey(now)
  const today = dateKey(new Date(now))

  // Habits: done when every habit is checked in today. No habits: not counted.
  const checked = habits.filter((h) => (h.checkins ?? []).includes(today)).length
  const habitsDaily = {
    id: 'habits', label: 'Habits',
    value: habits.length ? `${checked}/${habits.length}` : 'None yet',
    done: habits.length > 0 && checked === habits.length,
    counted: habits.length > 0,
    href: '#/life/habits',
  }

  // Spend: done when today is logged (any transaction or a no-spend mark). Value is today's spend.
  const spent = expenses
    .filter((e) => e && e.type !== 'income' && dateKey(new Date(e.date)) === today)
    .reduce((s, e) => s + (Number(e.amount) || 0), 0)
  const spendDaily = {
    id: 'spend', label: 'Spend',
    value: formatRupees(spent),
    done: loggedDays(expenses, dailyLog).has(today),
    counted: true,
    href: '#/money/overview',
  }

  // Mood: done once today has an entry the person logged; a derived guess shows but does not count.
  const entry = moodLog.find((e) => e && e.date === today)
  const moodDaily = {
    id: 'mood', label: 'Mood',
    value: entry && Number.isFinite(entry.valence) ? moodLabel(entry.valence) : 'Not set',
    done: !!entry && entry.source !== 'derived',
    counted: true,
    href: '#/life/growth',
  }

  // Code: solved today against the daily goal.
  const goal = Number(settings.dailyCodeGoal) || Number(settings.dailyGoal) || DEFAULT_CODE_GOAL
  const ring = codeRing(progress, goal, now)
  const codeDaily = {
    id: 'code', label: 'Code',
    value: `${ring.done}/${ring.goal}`,
    done: ring.reached,
    counted: true,
    href: '#/logic/code',
  }

  // Puzzle: done when a bank puzzle was solved today (dated solves only) or the Lichess daily was marked.
  const puzzleDone = solvedOn(puzzleProgress, key) > 0 || dailyLog?.[key]?.puzzle === true
  const puzzleDaily = {
    id: 'puzzle', label: 'Puzzle',
    value: puzzleDone ? 'Solved' : 'Open',
    done: puzzleDone,
    counted: true,
    href: '#/logic/puzzles',
  }

  let items = [habitsDaily, spendDaily, moodDaily, codeDaily, puzzleDaily]
  if (Array.isArray(data.enabled)) items = items.map((d) => (data.enabled.includes(d.id) ? d : { ...d, counted: false }))
  const counted = items.filter((d) => d.counted)
  return { items, done: counted.filter((d) => d.done).length, total: counted.length }
}
