import test from 'node:test'
import assert from 'node:assert/strict'
import {
  taskBuckets,
  matchesUrgency,
  quadrantOf,
  quadrantCounts,
  dueCounts,
  walletTotal,
  overallStreak,
} from '../src/life/selectors.js'
import { earnings } from '../src/life/logic.js'

const T = (over) => ({ id: 'x', title: 't', due: null, done: false, urgent: false, important: false, ...over })

test('matchesUrgency: each filter selects exactly its quadrant', () => {
  const ui = T({ urgent: true, important: true })
  const i = T({ important: true })
  const u = T({ urgent: true })
  const none = T({})
  assert.deepEqual([ui, i, u, none].map((t) => matchesUrgency(t, 'urgent')), [true, false, false, false])
  assert.deepEqual([ui, i, u, none].map((t) => matchesUrgency(t, 'important')), [false, true, false, false])
  assert.deepEqual([ui, i, u, none].map((t) => matchesUrgency(t, 'not-important')), [false, false, true, false])
  assert.deepEqual([ui, i, u, none].map((t) => matchesUrgency(t, 'extras')), [false, false, false, true])
  assert.deepEqual([ui, i, u, none].map((t) => matchesUrgency(t, 'all')), [true, true, true, true])
})

test('quadrantOf agrees with matchesUrgency for every flag combination', () => {
  for (const urgent of [false, true]) {
    for (const important of [false, true]) {
      const t = T({ urgent, important })
      const q = quadrantOf(t)
      for (const f of ['urgent', 'important', 'not-important', 'extras']) {
        assert.equal(matchesUrgency(t, f), f === q, `${urgent}/${important} vs ${f}`)
      }
    }
  }
})

test('quadrantCounts counts open tasks only', () => {
  const tasks = [
    T({ urgent: true, important: true }),
    T({ urgent: true, important: true, done: true }),
    T({ important: true }),
    T({ urgent: true }),
    T({}),
    T({}),
  ]
  assert.deepEqual(quadrantCounts(tasks), { urgent: 1, important: 1, 'not-important': 1, extras: 2 })
  assert.deepEqual(quadrantCounts([]), { urgent: 0, important: 0, 'not-important': 0, extras: 0 })
})

test('taskBuckets splits by due date, sorts upcoming, separates done', () => {
  const tasks = [
    T({ id: 'a', due: '2026-05-01' }),
    T({ id: 'b', due: '2026-05-10' }),
    T({ id: 'c', due: '2026-05-12' }),
    T({ id: 'd', due: '2026-05-11' }),
    T({ id: 'e' }),
    T({ id: 'f', due: '2026-05-01', done: true }),
    T({ id: 'g', done: true }),
  ]
  const b = taskBuckets(tasks, '2026-05-10')
  assert.deepEqual(b.overdue.map((t) => t.id), ['a'])
  assert.deepEqual(b.dueToday.map((t) => t.id), ['b'])
  assert.deepEqual(b.upcoming.map((t) => t.id), ['d', 'c'])
  assert.deepEqual(b.noDate.map((t) => t.id), ['e'])
  assert.deepEqual(b.done.map((t) => t.id), ['f', 'g'])
})

test('taskBuckets handles empty input', () => {
  assert.deepEqual(taskBuckets([], '2026-05-10'), { overdue: [], dueToday: [], upcoming: [], noDate: [], done: [] })
})

test('dueCounts: open tasks due today and reminders already due', () => {
  const now = new Date(2026, 4, 10, 12, 0, 0)
  const tasks = [
    T({ due: '2026-05-10' }),
    T({ due: '2026-05-10', done: true }),
    T({ due: '2026-05-09' }),
    T({ due: '2026-05-11' }),
  ]
  const reminders = [
    { at: now.getTime() - 1000, done: false },
    { at: now.getTime(), done: false },
    { at: now.getTime() + 1000, done: false },
    { at: now.getTime() - 1000, done: true },
  ]
  assert.deepEqual(dueCounts(tasks, reminders, now), { tasksDueToday: 1, remindersDue: 2 })
  assert.deepEqual(dueCounts([], [], now), { tasksDueToday: 0, remindersDue: 0 })
})

test('walletTotal sums earnings().total across habits', () => {
  const now = new Date(2026, 4, 10)
  const habits = [
    { category: 'exercise', checkins: ['2026-05-08', '2026-05-09', '2026-05-10'] },
    { category: 'water', checkins: ['2026-05-10'] },
  ]
  const expected = earnings(habits[0], now).total + earnings(habits[1], now).total
  assert.equal(walletTotal(habits, now), expected)
  assert.ok(expected > 0)
  assert.equal(walletTotal([], now), 0)
})

test('overallStreak: a day counts when any habit was checked in', () => {
  const now = new Date(2026, 4, 10)
  const habits = [
    { category: 'exercise', checkins: ['2026-05-10', '2026-05-09', '2026-05-01'] },
    { category: 'water', checkins: ['2026-05-08', '2026-05-07', '2026-05-02'] },
  ]
  assert.deepEqual(overallStreak(habits, now), { current: 4, best: 4 })
})

test('overallStreak: yesterday keeps the streak alive, a gap breaks it, empty is zero', () => {
  const now = new Date(2026, 4, 10)
  assert.deepEqual(
    overallStreak([{ checkins: ['2026-05-09', '2026-05-08'] }], now),
    { current: 2, best: 2 }
  )
  assert.deepEqual(
    overallStreak([{ checkins: ['2026-05-07', '2026-05-06', '2026-05-05'] }], now),
    { current: 0, best: 3 }
  )
  assert.deepEqual(overallStreak([], now), { current: 0, best: 0 })
  assert.deepEqual(overallStreak([{ checkins: [] }], now), { current: 0, best: 0 })
})
