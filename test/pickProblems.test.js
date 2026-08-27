import test from 'node:test'
import assert from 'node:assert/strict'
import { pickProblems } from '../api/_lib/pickProblems.js'

const p = (contestId, index, rating, tags = []) => ({
  contestId, index, rating, tags, name: `P${contestId}${index}`,
})

test('keeps only problems within +/-200 of rating', () => {
  const problems = [p(1, 'A', 1000), p(2, 'B', 1400), p(3, 'C', 1600), p(4, 'D', 1900)]
  const out = pickProblems(problems, 1500, new Set())
  assert.deepEqual(out.map((x) => x.rating), [1400, 1600])
})

test('excludes already-solved problems', () => {
  const problems = [p(1, 'A', 1500), p(2, 'B', 1500)]
  const out = pickProblems(problems, 1500, new Set(['1A']))
  assert.equal(out.length, 1)
  assert.equal(out[0].contestId, 2)
})

test('drops problems with no rating', () => {
  const problems = [p(1, 'A', undefined), p(2, 'B', 1500)]
  const out = pickProblems(problems, 1500, new Set())
  assert.equal(out.length, 1)
  assert.equal(out[0].rating, 1500)
})

test('unrated user falls back to a band centered on 1200', () => {
  const problems = [p(1, 'A', 1100), p(2, 'B', 1800)]
  const out = pickProblems(problems, null, new Set())
  assert.deepEqual(out.map((x) => x.rating), [1100])
})

test('sorts ascending by rating and respects the limit', () => {
  const problems = [p(1, 'A', 1600), p(2, 'B', 1400), p(3, 'C', 1500)]
  const out = pickProblems(problems, 1500, new Set(), 2)
  assert.deepEqual(out.map((x) => x.rating), [1400, 1500])
})
