import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loggedDays, logStreak, monthStrip } from '../src/money/dayLog.js'

const at = (y, m, d, h = 12, min = 0) => new Date(y, m - 1, d, h, min).getTime()
const NOW = at(2026, 11, 15, 9)

test('loggedDays counts a day with any transaction', () => {
  const days = loggedDays([{ date: at(2026, 11, 3), amount: 5 }, { date: at(2026, 11, 4), amount: 9, type: 'income' }], {})
  assert.deepEqual([...days].sort(), ['2026-11-03', '2026-11-04'])
})

test('loggedDays counts a no-spend mark and ignores false marks', () => {
  const days = loggedDays([], { '2026-11-05': { noSpend: true }, '2026-11-06': { noSpend: false }, '2026-11-07': {} })
  assert.deepEqual([...days], ['2026-11-05'])
})

test('loggedDays handles missing inputs', () => {
  assert.equal(loggedDays(undefined, undefined).size, 0)
})

test('loggedDays uses local midnight edges', () => {
  const days = loggedDays([{ date: at(2026, 11, 3, 0, 0) }, { date: at(2026, 11, 3, 23, 59) }, { date: at(2026, 11, 4, 0, 0) }], {})
  assert.deepEqual([...days].sort(), ['2026-11-03', '2026-11-04'])
})

test('logStreak ends at today', () => {
  const ex = [{ date: at(2026, 11, 15, 0, 0) }, { date: at(2026, 11, 14) }, { date: at(2026, 11, 13) }]
  assert.equal(logStreak(ex, {}, NOW), 3)
})

test('logStreak ends at yesterday when today is not logged', () => {
  const ex = [{ date: at(2026, 11, 14) }, { date: at(2026, 11, 13) }]
  assert.equal(logStreak(ex, {}, NOW), 2)
})

test('logStreak is 0 when neither today nor yesterday is logged', () => {
  assert.equal(logStreak([{ date: at(2026, 11, 13) }], {}, NOW), 0)
  assert.equal(logStreak([], {}, NOW), 0)
})

test('logStreak stops at a gap and counts no-spend marks', () => {
  const ex = [{ date: at(2026, 11, 15) }, { date: at(2026, 11, 12) }]
  assert.equal(logStreak(ex, { '2026-11-14': { noSpend: true }, '2026-11-13': { noSpend: true } }, NOW), 4)
  assert.equal(logStreak(ex, { '2026-11-14': { noSpend: true } }, NOW), 2)
})

test('logStreak at just after and just before local midnight', () => {
  const ex = [{ date: at(2026, 11, 14, 23, 59) }]
  assert.equal(logStreak(ex, {}, at(2026, 11, 15, 0, 0)), 1)
  assert.equal(logStreak(ex, {}, at(2026, 11, 15, 23, 59)), 1)
  assert.equal(logStreak(ex, {}, at(2026, 11, 16, 0, 0)), 0)
})

test('logStreak crosses month and year boundaries', () => {
  const ex = [{ date: at(2026, 1, 1) }, { date: at(2025, 12, 31) }, { date: at(2025, 12, 30) }]
  assert.equal(logStreak(ex, {}, at(2026, 1, 1, 8)), 3)
})

test('monthStrip returns one boolean per day up to today', () => {
  const strip = monthStrip([{ date: at(2026, 11, 1) }, { date: at(2026, 11, 15) }], { '2026-11-10': { noSpend: true } }, NOW)
  assert.equal(strip.length, 15)
  assert.deepEqual(strip.map((v, i) => (v ? i + 1 : 0)).filter(Boolean), [1, 10, 15])
})

test('monthStrip ignores other months and has length 1 on the 1st at midnight', () => {
  const now = at(2026, 12, 1, 0, 0)
  assert.deepEqual(monthStrip([{ date: at(2026, 11, 30) }], {}, now), [false])
  assert.deepEqual(monthStrip([{ date: at(2026, 12, 1, 0, 0) }], {}, now), [true])
})
