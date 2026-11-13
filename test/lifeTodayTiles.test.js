import test from 'node:test'
import assert from 'node:assert/strict'
import { lifeTileData } from '../src/life/todayTiles.js'
import { earnings } from '../src/life/logic.js'
import { levelFromXp, TASK_XP } from '../src/life/progress.js'

const NOW = new Date(2026, 5, 15, 12, 0) // Mon 15 Jun 2026, local noon
const day = (offset) => {
  const d = new Date(2026, 5, 15 + offset)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

test('empty inputs give zeroed, null-safe tile data', () => {
  assert.deepEqual(lifeTileData([], [], [], [], NOW), {
    streak: { current: 0, best: 0 },
    wallet: { total: 0, today: 0 },
    pets: [],
    tasks: { overdue: 0, today: 0, next: null },
    reminders: { due: 0, next: null },
    mood: { today: null, avg: null, trend: null },
    level: { level: 1, pct: 0 },
  })
})

test('undefined inputs behave like empty ones', () => {
  const out = lifeTileData(undefined, undefined, undefined, undefined, NOW)
  assert.equal(out.tasks.overdue, 0)
  assert.deepEqual(out.pets, [])
})

test('populated inputs feed every tile', () => {
  const habits = [
    { id: 'h1', name: 'Run', category: 'exercise', species: 'dog', checkins: [day(-2), day(-1), day(0)] },
    { id: 'h2', name: 'Read', category: 'reading', species: 'cat', checkins: [day(-5)] },
  ]
  const tasks = [
    { id: 't1', title: 'late', due: day(-1), done: false },
    { id: 't2', title: 'now', due: day(0), done: false },
    { id: 't3', title: 'later B', due: day(5), done: false },
    { id: 't4', title: 'later A', due: day(2), done: false },
    { id: 't5', title: 'finished', due: day(-3), done: true },
    { id: 't6', title: 'no date', due: null, done: false },
  ]
  const reminders = [
    { id: 'r1', title: 'past', at: NOW.getTime() - 60000, done: false },
    { id: 'r2', title: 'past done', at: NOW.getTime() - 60000, done: true },
    { id: 'r3', title: 'soon', at: NOW.getTime() + 3600000, done: false },
    { id: 'r4', title: 'far', at: NOW.getTime() + 86400000, done: false },
  ]
  const moodLog = [
    { date: day(-2), valence: 25, source: 'logged' },
    { date: day(-1), valence: 50, source: 'logged' },
    { date: day(0), valence: 75, source: 'logged' },
  ]

  const out = lifeTileData(tasks, reminders, habits, moodLog, NOW)

  assert.deepEqual(out.streak, { current: 3, best: 3 })
  const expectedTotal = earnings(habits[0], NOW).total + earnings(habits[1], NOW).total
  assert.deepEqual(out.wallet, { total: expectedTotal, today: earnings(habits[0], NOW).today })
  assert.ok(out.wallet.today > 0)
  assert.deepEqual(out.pets.map((p) => [p.id, p.species, p.stage, p.mood]), [
    ['h1', 'dog', 'baby', 'happy'],
    ['h2', 'cat', 'baby', 'sick'],
  ])
  assert.ok(out.pets.every((p) => typeof p.health === 'number'))
  assert.deepEqual(out.tasks, { overdue: 1, today: 1, next: { id: 't4', title: 'later A', due: day(2) } })
  assert.deepEqual(out.reminders, {
    due: 1,
    next: { id: 'r3', title: 'soon', at: NOW.getTime() + 3600000 },
  })
  assert.deepEqual(out.mood, { today: 75, avg: 50, trend: 38 })
  const xp = Math.floor(expectedTotal + TASK_XP * 1) // one done task
  const lv = levelFromXp(xp)
  assert.deepEqual(out.level, { level: lv.level, pct: lv.pct })
  assert.ok(out.level.level > 1)
})

test('does not mutate its inputs', () => {
  const tasks = [
    { id: 'b', title: 'b', due: day(3), done: false },
    { id: 'a', title: 'a', due: day(1), done: false },
  ]
  const reminders = [
    { id: 'y', title: 'y', at: NOW.getTime() + 2000, done: false },
    { id: 'x', title: 'x', at: NOW.getTime() + 1000, done: false },
  ]
  const snap = JSON.stringify([tasks, reminders])
  lifeTileData(tasks, reminders, [], [], NOW)
  assert.equal(JSON.stringify([tasks, reminders]), snap)
})
