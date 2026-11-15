import test from 'node:test'
import assert from 'node:assert/strict'
import { xpFor, levelFromXp, LEVEL_BASE, TASK_XP } from '../src/life/progress.js'
import { earnings } from '../src/life/logic.js'

const NOW = new Date(2026, 10, 13, 12, 0, 0)

function days(n, endOffset = 0) {
  // n consecutive local-date keys ending `endOffset` days before NOW
  const out = []
  for (let i = n - 1 + endOffset; i >= endOffset; i--) {
    const d = new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() - i)
    out.push(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
    )
  }
  return out
}

test('constants match ADR-0004', () => {
  assert.equal(LEVEL_BASE, 30)
  assert.equal(TASK_XP, 10)
})

test('xpFor is 0 for no habits and no tasks', () => {
  assert.equal(xpFor([], [], NOW), 0)
  assert.equal(xpFor(undefined, undefined, NOW), 0)
  assert.deepEqual(levelFromXp(xpFor([], [], NOW)), { level: 1, into: 0, needed: 30, pct: 0 })
})

test('xpFor sums earnings totals plus 10 per done task', () => {
  const habits = [
    { category: 'exercise', checkins: days(10) },
    { category: 'water', checkins: days(2) },
  ]
  const tasks = [{ done: true }, { done: false }, { done: true }, {}]
  const expected = Math.floor(
    earnings(habits[0], NOW).total + earnings(habits[1], NOW).total + 20,
  )
  assert.equal(xpFor(habits, tasks, NOW), expected)
})

test('ADR example 3: exercise 10-day streak plus 3 done tasks = 1330, Level 7, 64%', () => {
  const habits = [{ category: 'exercise', checkins: days(10) }]
  const tasks = [{ done: true }, { done: true }, { done: true }]
  assert.equal(earnings(habits[0], NOW).total, 1300)
  const xp = xpFor(habits, tasks, NOW)
  assert.equal(xp, 1330)
  assert.deepEqual(levelFromXp(xp), { level: 7, into: 250, needed: 390, pct: 64 })
})

test('xpFor rounds fractional multiplier earnings down', () => {
  // custom = 30/day; day 3 of a run is x1.25 = 37.5
  const habits = [{ category: 'custom', checkins: days(3) }]
  assert.equal(earnings(habits[0], NOW).total, 97.5)
  assert.equal(xpFor(habits, [], NOW), 97)
})

test('levelFromXp: blueprint sample 1240 reads as Level 7, 41%', () => {
  assert.deepEqual(levelFromXp(1240), { level: 7, into: 160, needed: 390, pct: 41 })
})

test('levelFromXp: level n starts at 30*(n-1)^2', () => {
  for (let n = 1; n <= 20; n++) {
    const start = 30 * (n - 1) ** 2
    assert.deepEqual(levelFromXp(start), { level: n, into: 0, needed: 30 * (2 * n - 1), pct: 0 })
    if (start > 0) assert.equal(levelFromXp(start - 1).level, n - 1)
  }
  assert.equal(levelFromXp(1080).level, 7)
  assert.equal(levelFromXp(1470).level, 8)
})

test('levelFromXp: pct stays within 0-99 and into < needed', () => {
  for (let xp = 0; xp < 3000; xp += 7) {
    const r = levelFromXp(xp)
    assert.ok(r.pct >= 0 && r.pct <= 99)
    assert.ok(r.into >= 0 && r.into < r.needed)
  }
})

test('levelFromXp: never decreases when highWater >= xp', () => {
  assert.deepEqual(levelFromXp(30, 1330), { level: 7, into: 250, needed: 390, pct: 64 })
  let prev = 0
  for (let xp = 1330; xp >= 0; xp -= 10) {
    const { level } = levelFromXp(xp, 1330)
    assert.equal(level, 7)
    prev = level
  }
  assert.equal(prev, 7)
  // xp above highWater still wins
  assert.equal(levelFromXp(1500, 1330).level, 8)
})

test('levelFromXp tolerates junk input', () => {
  assert.deepEqual(levelFromXp(-5), { level: 1, into: 0, needed: 30, pct: 0 })
  assert.deepEqual(levelFromXp(NaN, undefined), { level: 1, into: 0, needed: 30, pct: 0 })
})
