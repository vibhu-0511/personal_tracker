import test from 'node:test'
import assert from 'node:assert/strict'
import { lastNDays, checkedCount } from '../src/life/habitView.js'
import { dateKey } from '../src/life/logic.js'

// DST rules only bite in a zone that has them; Date reads process.env.TZ lazily in Node.
const ORIGINAL_TZ = process.env.TZ
process.env.TZ = 'America/New_York'
test.after(() => {
  if (ORIGINAL_TZ === undefined) delete process.env.TZ
  else process.env.TZ = ORIGINAL_TZ
})

const dates = (days) => days.map((d) => d.date)

test('returns n entries, oldest first, ending today', () => {
  const now = new Date(2026, 5, 15, 12, 0)
  const days = lastNDays([], now, 30)
  assert.equal(days.length, 30)
  assert.equal(days[29].date, '2026-06-15')
  assert.equal(days[0].date, '2026-05-17')
  assert.ok(days.every((d) => d.checked === false))
})

test('marks checked days and ignores check-ins outside the window', () => {
  const now = new Date(2026, 5, 15, 12, 0)
  const days = lastNDays(['2026-06-15', '2026-06-01', '2026-05-17', '2026-05-16', '2026-06-16'], now, 30)
  assert.deepEqual(days.filter((d) => d.checked).map((d) => d.date), ['2026-05-17', '2026-06-01', '2026-06-15'])
  assert.equal(checkedCount(days), 3)
})

test('crosses the spring-forward change without skipping or repeating a day', () => {
  assert.equal(new Date(2026, 2, 8).getTimezoneOffset(), 300)
  assert.equal(new Date(2026, 2, 9).getTimezoneOffset(), 240) // DST really started on 8 Mar
  const now = new Date(2026, 2, 12, 0, 30)
  const days = lastNDays(['2026-03-08', '2026-03-09'], now, 30)
  const keys = dates(days)
  assert.equal(new Set(keys).size, 30)
  assert.equal(keys[0], '2026-02-11')
  assert.equal(keys[29], '2026-03-12')
  assert.ok(keys.includes('2026-03-08') && keys.includes('2026-03-09'))
  for (let i = 1; i < keys.length; i++) {
    const [y1, m1, d1] = keys[i - 1].split('-').map(Number)
    const [y2, m2, d2] = keys[i].split('-').map(Number)
    assert.equal((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000, 1)
  }
  assert.equal(checkedCount(days), 2)
})

test('crosses the fall-back change (25h day) cleanly, also at late-night now', () => {
  const now = new Date(2026, 10, 3, 23, 59)
  const keys = dates(lastNDays([], now, 30))
  assert.equal(new Set(keys).size, 30)
  assert.equal(keys[29], '2026-11-03')
  assert.equal(keys[0], '2026-10-05')
  assert.ok(keys.includes('2026-11-01'))
})

test('rolls over month ends and a leap day', () => {
  const mar1 = lastNDays([], new Date(2024, 2, 1, 9, 0), 3)
  assert.deepEqual(dates(mar1), ['2024-02-28', '2024-02-29', '2024-03-01'])
  const mar1Plain = lastNDays([], new Date(2026, 2, 1, 9, 0), 3)
  assert.deepEqual(dates(mar1Plain), ['2026-02-27', '2026-02-28', '2026-03-01'])
  const jan1 = lastNDays([], new Date(2027, 0, 1, 0, 5), 3)
  assert.deepEqual(dates(jan1), ['2026-12-30', '2026-12-31', '2027-01-01'])
  const m31 = lastNDays([], new Date(2026, 4, 31, 23, 59), 2)
  assert.deepEqual(dates(m31), ['2026-05-30', '2026-05-31'])
})

test('last entry always equals dateKey(now); tolerates missing checkins and bad n', () => {
  const now = new Date(2026, 6, 4, 18, 0)
  assert.equal(lastNDays(undefined, now, 5)[4].date, dateKey(now))
  assert.deepEqual(lastNDays([], now, 0), [])
  assert.deepEqual(lastNDays([], now, -3), [])
  assert.equal(lastNDays([], now).length, 30)
})
