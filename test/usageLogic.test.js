import test from 'node:test'
import assert from 'node:assert/strict'
import {
  entryTotal, startOfWeek, dailySeries, totalsSince, bySource, formatTokens, parseTokens,
} from '../src/usage/logic.js'

const at = (y, m, d, h = 12) => new Date(y, m - 1, d, h).getTime()

test('entryTotal sums all token kinds and tolerates missing fields', () => {
  assert.equal(entryTotal({ input: 10, output: 5, cacheRead: 3, cacheWrite: 2 }), 20)
  assert.equal(entryTotal({ input: 7 }), 7)
})

test('startOfWeek is Monday-based', () => {
  // 2026-11-05 is a Thursday -> Monday 2026-11-02
  assert.equal(startOfWeek(at(2026, 11, 5)), at(2026, 11, 2, 0))
  assert.equal(startOfWeek(at(2026, 11, 8)), at(2026, 11, 2, 0)) // Sunday
  assert.equal(startOfWeek(at(2026, 11, 2)), at(2026, 11, 2, 0)) // Monday
})

test('dailySeries buckets by day, oldest first, ignores out-of-range', () => {
  const now = at(2026, 11, 5)
  const s = dailySeries([
    { date: at(2026, 11, 5, 9), input: 100 },
    { date: at(2026, 11, 5, 20), output: 50 },
    { date: at(2026, 11, 3), input: 10 },
    { date: at(2026, 10, 1), input: 999 },
  ], 3, now)
  assert.deepEqual(s.map((x) => x.total), [10, 0, 150])
})

test('totalsSince and bySource', () => {
  const entries = [
    { date: 100, source: 'api', input: 5 },
    { date: 200, source: 'claude-ai', input: 20 },
    { date: 300, source: 'api', output: 10 },
  ]
  assert.equal(totalsSince(entries, 200), 30)
  assert.deepEqual(bySource(entries), [['api', 15], ['claude-ai', 20]].sort((a, b) => b[1] - a[1]))
})

test('formatTokens', () => {
  assert.equal(formatTokens(950), '950')
  assert.equal(formatTokens(1500), '1.5k')
  assert.equal(formatTokens(250000), '250k')
  assert.equal(formatTokens(2_300_000), '2.3M')
})

test('parseTokens handles suffixes, separators, and bad input', () => {
  assert.equal(parseTokens('12k'), 12000)
  assert.equal(parseTokens('1.5M'), 1500000)
  assert.equal(parseTokens('12,345'), 12345)
  assert.equal(parseTokens(''), 0)
  assert.equal(parseTokens('abc'), null)
  assert.equal(parseTokens('-5'), null)
})
