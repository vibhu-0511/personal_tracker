import test from 'node:test'
import assert from 'node:assert/strict'
import { CATEGORIES, CAT_MAP, categoryInfo, MAX_AMOUNT } from '../src/money/categories.js'
import {
  shortAmount, formatRupees, formatMonth, shortMonth, formatDate, startOfDay,
  toDateInputValue, fromDateInputValue,
} from '../src/money/format.js'

const at = (y, m, d, h = 12, min = 0) => new Date(y, m - 1, d, h, min).getTime()

test('shortAmount picks k, L and Cr suffixes', () => {
  assert.equal(shortAmount(0), '0')
  assert.equal(shortAmount(950), '950')
  assert.equal(shortAmount(1000), '1k')
  assert.equal(shortAmount(5400), '5k')
  assert.equal(shortAmount(100000), '1.0L')
  assert.equal(shortAmount(125000), '1.3L')
  assert.equal(shortAmount(10000000), '1.0Cr')
})

test('formatRupees uses rupee sign and Indian grouping', () => {
  assert.equal(formatRupees(0), '₹0')
  assert.equal(formatRupees(999), '₹999')
  assert.equal(formatRupees(123456), '₹1,23,456')
  assert.equal(formatRupees(10000000), '₹1,00,00,000')
})

test('formatMonth and shortMonth', () => {
  assert.equal(formatMonth(at(2026, 11, 13)), 'November 2026')
  assert.equal(shortMonth(at(2026, 11, 13)), 'Nov')
})

test('formatDate says Today and Yesterday relative to an injected now', () => {
  const now = at(2026, 11, 13, 15)
  assert.equal(formatDate(at(2026, 11, 13, 0, 5), now), 'Today')
  assert.equal(formatDate(at(2026, 11, 12, 23, 59), now), 'Yesterday')
  // Word order comes from the ICU en-IN data ("3 Nov" here, "Nov 3" elsewhere), so only check the parts.
  assert.match(formatDate(at(2026, 11, 3), now), /^(3 Nov|Nov 3)$/)
})

test('startOfDay is local midnight', () => {
  assert.equal(startOfDay(at(2026, 11, 13, 17, 45)), new Date(2026, 10, 13).getTime())
})

test('date input round trip keeps time of day from the fallback', () => {
  const ts = at(2026, 11, 13, 17, 45)
  assert.equal(toDateInputValue(ts), '2026-11-13')
  assert.equal(toDateInputValue(at(2026, 1, 5)), '2026-01-05')
  const moved = fromDateInputValue('2026-11-20', ts)
  assert.equal(toDateInputValue(moved), '2026-11-20')
  assert.equal(new Date(moved).getHours(), 17)
  assert.equal(new Date(moved).getMinutes(), 45)
  assert.equal(fromDateInputValue('', ts), ts)
})

test('categories: 12 unique ids, map lookup, fallback for unknown ids', () => {
  assert.equal(CATEGORIES.length, 12)
  assert.equal(new Set(CATEGORIES.map((c) => c.id)).size, 12)
  assert.equal(CAT_MAP.coffee.label, 'Coffee')
  assert.equal(CAT_MAP.education.label, 'P2P') // pinned current behaviour, see R4 report
  assert.deepEqual(categoryInfo('mystery'), { id: 'mystery', emoji: '📦', label: 'mystery' })
  assert.equal(categoryInfo('food'), CAT_MAP.food)
  assert.equal(MAX_AMOUNT, 10_000_000)
})
