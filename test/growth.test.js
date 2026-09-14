import test from 'node:test'
import assert from 'node:assert/strict'
import {
  computeStats,
  unlockedTitles,
  derivedValence,
  ensureTodayEntry,
  logManualMood,
  emotionSummary,
  dateKey,
} from '../src/life/logic.js'

const habit = (domain, checkins) => ({ id: domain + Math.random(), domain, checkins })

test('computeStats sums 2 points per unique checkin per domain, capped at 100', () => {
  const habits = [
    habit('physical', ['2026-01-01', '2026-01-02', '2026-01-02']), // dup ignored -> 2 uniq -> 4 pts
    habit('physical', ['2026-01-03']), // +2 pts -> 6 total
    habit('logical', Array.from({ length: 60 }, (_, i) => `2026-02-${String(i + 1).padStart(2, '0')}`).slice(0, 28)),
  ]
  const stats = computeStats(habits)
  assert.equal(stats.physical, 6)
  assert.equal(stats.emotional, 0)
  assert.ok(stats.logical <= 100)
})

test('computeStats treats a missing/unknown domain as other', () => {
  const stats = computeStats([{ id: 'x', checkins: ['2026-01-01'] }, { id: 'y', domain: 'bogus', checkins: ['2026-01-01'] }])
  assert.equal(stats.other, 4)
})

test('computeStats caps a domain at 100', () => {
  const many = Array.from({ length: 60 }, (_, i) => `2026-01-${String((i % 28) + 1).padStart(2, '0')}-${i}`)
  const stats = computeStats([habit('financial', many)])
  assert.equal(stats.financial, 100)
})

test('unlockedTitles returns only titles at or below the stat', () => {
  const titles = unlockedTitles({ physical: 50, logical: 0, emotional: 0, financial: 0, other: 0 })
  const physicalTitles = titles.filter((t) => t.domain === 'physical')
  assert.equal(physicalTitles.length, 2) // 25 and 50 tiers
  assert.ok(physicalTitles.every((t) => t.at <= 50))
})

test('derivedValence averages habit mood onto a 0-100 scale', () => {
  const today = new Date(2026, 0, 10)
  const happyHabit = { checkins: [dateKey(today)] } // checked in today -> happy
  const sickHabit = { checkins: ['2026-01-01'] } // long ago -> sick
  const v = derivedValence([happyHabit, sickHabit], today)
  assert.equal(v, 50) // (100 + 0) / 2
})

test('derivedValence returns null with no habits', () => {
  assert.equal(derivedValence([], new Date()), null)
})

test('ensureTodayEntry adds a derived entry once, does not duplicate', () => {
  const today = new Date(2026, 0, 10)
  const habits = [{ checkins: [dateKey(today)] }]
  const log1 = ensureTodayEntry([], habits, today)
  assert.equal(log1.length, 1)
  assert.equal(log1[0].source, 'derived')
  const log2 = ensureTodayEntry(log1, habits, today)
  assert.equal(log2.length, 1) // unchanged, no duplicate
})

test('logManualMood overrides the derived entry for today', () => {
  const today = new Date(2026, 0, 10)
  const derived = [{ date: dateKey(today), valence: 50, source: 'derived' }]
  const next = logManualMood(derived, today, 75)
  assert.equal(next.length, 1)
  assert.equal(next[0].valence, 75)
  assert.equal(next[0].source, 'logged')
})

test('emotionSummary computes consistency, average and trend over the last 30 days', () => {
  const today = new Date(2026, 1, 28) // Feb 28 2026
  const log = []
  for (let i = 0; i < 30; i++) {
    const d = new Date(2026, 1, 28 - i)
    // first half of the window (recent 15 days) is happier than the second half (older 15 days)
    log.push({ date: dateKey(d), valence: i < 15 ? 100 : 0, source: 'derived' })
  }
  const s = emotionSummary(log, today)
  assert.equal(s.days, 30)
  assert.equal(s.consistency, 100)
  assert.equal(s.avgValence, 50)
  assert.ok(s.trend > 0) // recent half happier than older half
})

test('emotionSummary handles an empty log', () => {
  const s = emotionSummary([], new Date())
  assert.equal(s.days, 0)
  assert.equal(s.avgValence, null)
})
