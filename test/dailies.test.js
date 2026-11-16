import { test } from 'node:test'
import assert from 'node:assert/strict'
import { computeDailies } from '../src/today/dailies.js'
import { NOW_MS, expenses } from '../e2e/fixtures/ember-day.js'

const at = (day, h, m = 0) => new Date(2026, 10, day, h, m).getTime()
const habits = [
  { id: 'h1', checkins: ['2026-11-14', '2026-11-15'] },
  { id: 'h2', checkins: ['2026-11-15'] },
  { id: 'h3', checkins: ['2026-11-15'] },
]
const fixtureDay = {
  habits,
  expenses,
  moodLog: [{ date: '2026-11-15', valence: 75, source: 'logged' }],
  progress: { a: { status: 'solved', updatedAt: at(15, 10) } },
  puzzleProgress: { p1: true },
  settings: { dailyCodeGoal: 3 },
}

test('returns the five dailies in order with label, value, done and href', () => {
  const { items } = computeDailies(fixtureDay, NOW_MS)
  assert.deepEqual(items.map((d) => d.id), ['habits', 'spend', 'mood', 'code', 'puzzle'])
  for (const d of items) {
    assert.equal(typeof d.label, 'string')
    assert.equal(typeof d.value, 'string')
    assert.equal(typeof d.done, 'boolean')
    assert.match(d.href, /^#\//)
  }
  assert.deepEqual(items.map((d) => d.value), ['3/3', '₹640', 'Good', '1/3', 'Open'])
})

test('the fixture day gives 3 of 5 done', () => {
  const r = computeDailies(fixtureDay, NOW_MS)
  assert.equal(r.done, 3)
  assert.equal(r.total, 5)
})

test('zero habits means the habits daily is not counted', () => {
  const r = computeDailies({ ...fixtureDay, habits: [] }, NOW_MS)
  assert.equal(r.items[0].counted, false)
  assert.equal(r.items[0].done, false)
  assert.equal(r.total, 4)
  assert.equal(r.done, 2)
})

test('a no-spend mark completes spend; a derived mood does not complete mood', () => {
  const r = computeDailies({
    expenses: [], dailyLog: { '2026-11-15': { noSpend: true } },
    moodLog: [{ date: '2026-11-15', valence: 50, source: 'derived' }],
  }, NOW_MS)
  assert.equal(r.items[1].done, true)
  assert.equal(r.items[1].value, '₹0')
  assert.equal(r.items[2].done, false)
  assert.equal(r.items[2].value, 'Okay')
})

test('code done at the goal; puzzle done only with a dated solve today', () => {
  const progress = { a: 1, b: 2, c: 3 }
  for (const k of Object.keys(progress)) progress[k] = { status: 'solved', updatedAt: at(15, 9) }
  const r = computeDailies({
    progress,
    puzzleProgress: { old: true, p: { solved: true, at: at(15, 8) } },
  }, NOW_MS)
  assert.equal(r.items[3].done, true)
  assert.equal(r.items[4].done, true)
  assert.equal(r.items[4].value, 'Solved')
  assert.equal(computeDailies({ puzzleProgress: { old: true } }, NOW_MS).items[4].done, false)
})

test('the Lichess daily mark completes the puzzle daily', () => {
  const r = computeDailies({ dailyLog: { '2026-11-15': { puzzle: true } } }, NOW_MS)
  assert.equal(r.items[4].done, true)
  assert.equal(r.items[4].value, 'Solved')
  assert.equal(computeDailies({ dailyLog: { '2026-11-14': { puzzle: true } } }, NOW_MS).items[4].done, false)
})

test('settings.dailyCodeGoal changes the code daily and is clamped to 1 to 10', () => {
  const code = (goal) => computeDailies({ ...fixtureDay, settings: { dailyCodeGoal: goal } }, NOW_MS).items[3]
  assert.equal(code(1).value, '1/1')
  assert.equal(code(1).done, true)
  assert.equal(code(5).value, '1/5')
  assert.equal(code(5).done, false)
  assert.equal(code(99).value, '1/10')
  assert.equal(code(0).value, '1/3')
  assert.equal(computeDailies({ ...fixtureDay, settings: {} }, NOW_MS).items[3].value, '1/3')
})

test('settings.dailies picks which of the five count', () => {
  const r = computeDailies({ ...fixtureDay, settings: { dailyCodeGoal: 3, dailies: ['habits', 'mood', 'puzzle'] } }, NOW_MS)
  assert.deepEqual(r.items.map((d) => d.counted), [true, false, true, false, true])
  assert.equal(r.total, 3)
  assert.equal(r.done, 2)
  const none = computeDailies({ ...fixtureDay, settings: { dailies: [] } }, NOW_MS)
  assert.equal(none.total, 0)
  assert.equal(none.done, 0)
  assert.equal(computeDailies({ ...fixtureDay, settings: { dailies: undefined } }, NOW_MS).total, 5)
})
