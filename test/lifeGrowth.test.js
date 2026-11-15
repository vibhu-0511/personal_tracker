import test from 'node:test'
import assert from 'node:assert/strict'
import { domainBreakdown, domainTitles } from '../src/life/growth.js'
import { computeStats, DOMAINS, TITLES } from '../src/life/logic.js'

const days = (n, month = '01') => Array.from({ length: n }, (_, i) => `2026-${month}-${String(i + 1).padStart(2, '0')}`)
const habit = (id, domain, checkins, name = id) => ({ id, name, domain, checkins })

test('domainBreakdown lists contributing habits with points, biggest first', () => {
  const habits = [
    habit('run', 'physical', days(3)),
    habit('lift', 'physical', days(5)),
    habit('read', 'logical', days(2)),
  ]
  assert.deepEqual(domainBreakdown(habits, 'physical'), [
    { id: 'lift', name: 'lift', checkins: 5, points: 10 },
    { id: 'run', name: 'run', checkins: 3, points: 6 },
  ])
})

test('domainBreakdown ignores duplicate check-ins and habits with none', () => {
  const habits = [
    habit('a', 'emotional', ['2026-01-01', '2026-01-01', '2026-01-02']),
    habit('b', 'emotional', []),
  ]
  assert.deepEqual(domainBreakdown(habits, 'emotional'), [{ id: 'a', name: 'a', checkins: 2, points: 4 }])
})

test('domainBreakdown ties keep list order', () => {
  const habits = [habit('x', 'other', days(2)), habit('y', 'other', days(2))]
  assert.deepEqual(domainBreakdown(habits, 'other').map((r) => r.id), ['x', 'y'])
})

test('domainBreakdown counts missing or unknown domains as other', () => {
  const habits = [habit('p', undefined, days(1)), habit('q', 'bogus', days(2)), habit('r', 'physical', days(4))]
  assert.deepEqual(domainBreakdown(habits, 'other').map((r) => r.id), ['q', 'p'])
  assert.deepEqual(domainBreakdown(habits, 'financial'), [])
})

test('breakdown points sum to computeStats before the 100 cap', () => {
  const habits = [
    habit('a', 'physical', days(28)),
    habit('b', 'physical', days(28, '02')),
    habit('c', 'physical', days(28, '03')), // 84 uniq -> 168 pts, capped to 100
    habit('d', 'logical', days(7)),
    habit('e', undefined, days(3)),
    habit('f', 'bogus', days(4)),
  ]
  const stats = computeStats(habits)
  for (const d of DOMAINS) {
    const sum = domainBreakdown(habits, d.id).reduce((s, r) => s + r.points, 0)
    assert.equal(Math.min(100, sum), stats[d.id], d.id)
  }
  assert.equal(stats.physical, 100)
  assert.equal(domainBreakdown(habits, 'physical').reduce((s, r) => s + r.points, 0), 168)
  assert.equal(domainBreakdown(habits, 'logical').reduce((s, r) => s + r.points, 0), stats.logical)
})

test('domainBreakdown of no habits is empty', () => {
  assert.deepEqual(domainBreakdown([], 'physical'), [])
})

test('domainTitles flags titles unlocked at or below the stat', () => {
  const titles = domainTitles('logical', 50)
  assert.deepEqual(titles.map((t) => t.at), [25, 50, 75, 100])
  assert.deepEqual(titles.map((t) => t.unlocked), [true, true, false, false])
  assert.ok(titles.every((t) => t.domain === 'logical'))
  assert.equal(domainTitles('logical', 0).some((t) => t.unlocked), false)
  assert.equal(TITLES.filter((t) => t.domain === 'logical').length, titles.length)
})
