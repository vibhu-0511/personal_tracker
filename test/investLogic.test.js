import test from 'node:test'
import assert from 'node:assert/strict'
import { PHASES } from '../src/invest/course.js'
import { ALL_MODS, isUnlocked, courseProgress } from '../src/invest/progress.js'
import { filterWatchlist, sortWatchlist, summarizeMovers } from '../src/invest/watchlist.js'

test('module list is 19 modules from PHASES', () => {
  assert.equal(ALL_MODS.length, 19)
  assert.equal(ALL_MODS.length, PHASES.reduce((n, p) => n + p.mods.length, 0))
})

test('isUnlocked chain: m1 always open, others need predecessor', () => {
  assert.equal(isUnlocked({}, ALL_MODS[0].id), true)
  assert.equal(isUnlocked({}, 'm1'), true)
  assert.equal(isUnlocked({}, ALL_MODS[1].id), false)
  assert.equal(isUnlocked({ [ALL_MODS[0].id]: true }, ALL_MODS[1].id), true)
  assert.equal(isUnlocked({ [ALL_MODS[0].id]: true }, ALL_MODS[2].id), false)
  assert.equal(isUnlocked({ [ALL_MODS[0].id]: false }, ALL_MODS[1].id), false)
  // follows list order, not numeric id order (m17 follows m7)
  assert.equal(isUnlocked({ m7: true }, 'm17'), true)
  assert.equal(isUnlocked({ m16: true }, 'm17'), false)
  assert.equal(isUnlocked(undefined, 'm2'), false)
})

test('courseProgress pct for 0/19 and 19/19', () => {
  assert.deepEqual(courseProgress({}), { done: 0, total: 19, pct: 0 })
  const all = Object.fromEntries(ALL_MODS.map((m) => [m.id, true]))
  assert.deepEqual(courseProgress(all), { done: 19, total: 19, pct: 100 })
  assert.equal(courseProgress({ m1: true, m2: false }).done, 1)
  assert.equal(courseProgress({ m1: true }).pct, 5)
})

test('sortWatchlist: IPOs first by open date, then addedAt desc', () => {
  const items = [
    { id: 's1', type: 'stock', name: 'A', addedAt: 10 },
    { id: 'i2', type: 'ipo', name: 'B', ipo: { open: '2026-03-01' } },
    { id: 's3', type: 'stock', name: 'C', addedAt: 30 },
    { id: 'i1', type: 'ipo', name: 'D', ipo: { open: '2026-02-01' } },
    { id: 'm1', type: 'mf', name: 'E', addedAt: 20 },
  ]
  const copy = [...items]
  assert.deepEqual(sortWatchlist(items).map((i) => i.id), ['i1', 'i2', 's3', 'm1', 's1'])
  assert.deepEqual(items, copy, 'input not mutated')
})

test('filterWatchlist matches name or symbol, case-insensitive', () => {
  const items = [
    { name: 'Reliance Industries', symbol: 'RELIANCE.NS', type: 'stock' },
    { name: 'Some IPO', type: 'ipo' },
  ]
  assert.equal(filterWatchlist(items, '').length, 2)
  assert.equal(filterWatchlist(items, '  ').length, 2)
  assert.deepEqual(filterWatchlist(items, 'reliance.ns').map((i) => i.name), ['Reliance Industries'])
  assert.deepEqual(filterWatchlist(items, 'ipo').map((i) => i.name), ['Some IPO'])
  assert.equal(filterWatchlist(items, 'zzz').length, 0)
})

test('summarizeMovers counts up/down/unavailable', () => {
  const items = [
    { type: 'stock', symbol: 'A' },
    { type: 'stock', symbol: 'B' },
    { type: 'stock', symbol: 'C' },
    { type: 'stock', symbol: 'D' },
    { type: 'stock', symbol: 'E' },
    { type: 'ipo', name: 'X' },
    { type: 'mf', name: 'Y' },
  ]
  const quotes = {
    A: { changePct: 1.2 },
    B: { changePct: -0.5 },
    C: { error: 'nope' },
    // D has no quote at all
    E: { changePct: 0 },
  }
  assert.deepEqual(summarizeMovers(items, quotes), { up: 1, down: 1, flat: 1, unavailable: 2 })
  assert.deepEqual(summarizeMovers([], {}), { up: 0, down: 0, flat: 0, unavailable: 0 })
  assert.deepEqual(summarizeMovers(items.slice(0, 1), undefined), { up: 0, down: 0, flat: 0, unavailable: 1 })
})
