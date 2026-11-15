import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  solvedToday, codeRing, codeStreak, localDaySeed, shuffleDaily, examTotals, examTopicKey,
} from '../src/logic/stats.js'
import { EXAMS } from '../src/logic/examData.js'

const at = (y, m, d, h = 12, min = 0) => new Date(y, m - 1, d, h, min).getTime()
const solved = (updatedAt) => ({ status: 'solved', tags: [], updatedAt })

test('solvedToday counts solved entries since local midnight', () => {
  const now = at(2026, 11, 13, 15)
  const midnight = at(2026, 11, 13, 0)
  const progress = {
    a: solved(midnight),            // exactly midnight counts
    b: solved(now),
    c: solved(midnight - 1),        // just before midnight does not
    d: { status: 'skipped', updatedAt: now },
  }
  assert.equal(solvedToday(progress, now), 2)
  assert.equal(solvedToday({}, now), 0)
  assert.equal(solvedToday(undefined, now), 0)
})

test('solvedToday matches the legacy Today.jsx formula', () => {
  const legacy = (progress) => {
    const start = new Date().setHours(0, 0, 0, 0)
    return Object.values(progress).filter((p) => p.status === 'solved' && p.updatedAt >= start).length
  }
  const start = new Date().setHours(0, 0, 0, 0)
  const progress = { a: solved(start), b: solved(start - 1), c: solved(Date.now()), d: { status: 'skipped', updatedAt: Date.now() } }
  assert.equal(solvedToday(progress), legacy(progress))
})

test('codeRing reports done against a goal of 3 by default', () => {
  const now = at(2026, 11, 13, 15)
  const one = { a: solved(now) }
  assert.deepEqual(codeRing(one, undefined, now), { done: 1, goal: 3, pct: 1 / 3, reached: false })
  const four = { a: solved(now), b: solved(now), c: solved(now), d: solved(now) }
  const ring = codeRing(four, 3, now)
  assert.equal(ring.done, 4)
  assert.equal(ring.pct, 1, 'pct is capped at 1')
  assert.equal(ring.reached, true)
  assert.equal(codeRing({}, 5, now).goal, 5)
  assert.equal(codeRing({}, 0, now).goal, 3, 'invalid goal falls back to 3')
})

test('codeStreak counts consecutive local days and tolerates an empty today', () => {
  const now = at(2026, 11, 13, 10)
  const days = (...ds) => Object.fromEntries(ds.map((d, i) => [`p${i}`, solved(at(2026, 11, d, 9))]))
  assert.deepEqual(codeStreak({}, now), { current: 0, best: 0 })
  assert.deepEqual(codeStreak(days(13, 12, 11), now), { current: 3, best: 3 })
  // nothing yet today: streak is still alive through yesterday
  assert.deepEqual(codeStreak(days(12, 11), now), { current: 2, best: 2 })
  // a missed day breaks the current streak but keeps the best
  assert.deepEqual(codeStreak(days(10, 9, 8, 7), now), { current: 0, best: 4 })
  // several solves on one day count once; gap splits runs
  const gap = { ...days(13, 12), x: solved(at(2026, 11, 12, 20)), y: solved(at(2026, 11, 9)) }
  assert.deepEqual(codeStreak(gap, now), { current: 2, best: 2 })
  // non-solved entries are ignored
  assert.deepEqual(codeStreak({ a: { status: 'skipped', updatedAt: now } }, now), { current: 0, best: 0 })
})

test('codeStreak crosses month and year boundaries', () => {
  const now = at(2027, 1, 2, 10)
  const progress = {
    a: solved(at(2027, 1, 2)), b: solved(at(2027, 1, 1)),
    c: solved(at(2026, 12, 31)), d: solved(at(2026, 12, 30)),
  }
  assert.deepEqual(codeStreak(progress, now), { current: 4, best: 4 })
})

test('localDaySeed is stable within a local day and steps by one at local midnight', () => {
  const morning = localDaySeed(at(2026, 11, 13, 0, 1))
  const night = localDaySeed(at(2026, 11, 13, 23, 59))
  assert.equal(morning, night)
  assert.equal(localDaySeed(at(2026, 11, 14, 0, 1)), morning + 1)
  assert.equal(localDaySeed(at(2026, 12, 1, 12)) - localDaySeed(at(2026, 11, 30, 12)), 1)
  assert.ok(Number.isInteger(morning))
})

test('shuffleDaily is deterministic, a permutation, and does not mutate its input', () => {
  const arr = Array.from({ length: 30 }, (_, i) => i)
  const frozen = [...arr]
  const a = shuffleDaily(arr, 20500)
  const b = shuffleDaily(arr, 20500)
  assert.deepEqual(a, b)
  assert.deepEqual(arr, frozen)
  assert.deepEqual([...a].sort((x, y) => x - y), frozen)
  assert.notDeepEqual(a, shuffleDaily(arr, 20501))
  assert.deepEqual(shuffleDaily([], 1), [])
})

test('examTotals counts known topics and ignores unknown keys', () => {
  const total = EXAMS.reduce((n, e) => n + e.sections.reduce((m, s) => m + s.topics.length, 0), 0)
  assert.equal(total, 66)
  const none = examTotals({})
  assert.deepEqual(none, { done: 0, total: 66, pct: 0 })
  assert.deepEqual(examTotals(undefined), none)

  const first = EXAMS[0]
  const key = examTopicKey(first.id, first.sections[0].name, first.sections[0].topics[0])
  const progress = {
    [key]: true,
    'cat::Quantitative Aptitude::Renamed Topic': true,
    'nope::x::y': true,
    [examTopicKey(first.id, first.sections[0].name, first.sections[0].topics[1])]: false,
  }
  assert.deepEqual(examTotals(progress), { done: 1, total: 66, pct: 2 })
})

test('examTotals never exceeds 100% even with orphaned keys', () => {
  const progress = {}
  for (const ex of EXAMS) for (const s of ex.sections) for (const t of s.topics) progress[examTopicKey(ex.id, s.name, t)] = true
  for (let i = 0; i < 20; i++) progress[`orphan::${i}::x`] = true
  assert.deepEqual(examTotals(progress), { done: 66, total: 66, pct: 100 })
})

test('examData EXAMS is identical to the EXAMS in Exams.jsx', () => {
  const src = readFileSync(fileURLToPath(new URL('../src/tabs/Exams.jsx', import.meta.url)), 'utf8')
  const start = src.indexOf('export const EXAMS = [')
  if (start === -1) return // R3-02 moved the data to examData.js; nothing left to compare
  const end = src.indexOf('\n]\n', start) + 3
  const literal = src.slice(start, end).replace('export const EXAMS = ', '')
  assert.deepEqual(EXAMS, new Function(`return ${literal}`)())
})

test('EXAMS shape: 3 exams with 66 topics', () => {
  assert.deepEqual(EXAMS.map((e) => e.id), ['cat', 'cfa', 'gmat'])
  const counts = EXAMS.map((e) => e.sections.reduce((m, s) => m + s.topics.length, 0))
  assert.deepEqual(counts, [17, 35, 14])
})

test('stats.js and examData.js are React-free', () => {
  for (const f of ['stats.js', 'examData.js']) {
    const text = readFileSync(fileURLToPath(new URL(`../src/logic/${f}`, import.meta.url)), 'utf8')
    assert.doesNotMatch(text, /from\s+['"]react/)
  }
})
