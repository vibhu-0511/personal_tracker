import test from 'node:test'
import assert from 'node:assert/strict'
import {
  normalize, normalizeAll, isSolved, markSolved, unmark, dayKey, solvedOn, toStored,
} from '../src/logic/puzzleProgress.js'

const NOW = new Date(2026, 10, 15, 10, 30).getTime()

test('normalize handles old booleans and new objects', () => {
  assert.deepEqual(normalize(true), { solved: true, at: null })
  assert.deepEqual(normalize(false), { solved: false, at: null })
  assert.deepEqual(normalize(undefined), { solved: false, at: null })
  assert.deepEqual(normalize({ solved: true, at: NOW }), { solved: true, at: NOW })
  assert.deepEqual(normalize({ solved: true, at: 'x' }), { solved: true, at: null })
})

test('markSolved stores at and keeps the first date', () => {
  const p = markSolved({ a: true }, 'b', NOW)
  assert.deepEqual(p.b, { solved: true, at: NOW })
  assert.equal(p.a, true)
  assert.equal(markSolved(p, 'b', NOW + 1000).b.at, NOW)
  assert.equal(markSolved({ a: true }, 'a', NOW).a.at, NOW)
  assert.equal(isSolved(p, 'b'), true)
  assert.equal(isSolved(unmark(p, 'b'), 'b'), false)
})

test('solvedOn counts only dated solves on that day', () => {
  const yesterday = NOW - 86400000
  let p = { old: true }
  p = markSolved(p, 'x', NOW)
  p = markSolved(p, 'y', NOW)
  p = markSolved(p, 'z', yesterday)
  assert.equal(solvedOn(p, dayKey(NOW)), 2)
  assert.equal(solvedOn(p, dayKey(yesterday)), 1)
  assert.equal(solvedOn({ old: true }, dayKey(NOW)), 0)
  assert.equal(solvedOn(null, dayKey(NOW)), 0)
})

test('old boolean data round-trips without loss', () => {
  const old = { a: true, b: true }
  assert.deepEqual(toStored(normalizeAll(old)), old)
  const mixed = { a: true, b: { solved: true, at: NOW } }
  assert.deepEqual(toStored(normalizeAll(mixed)), mixed)
})
