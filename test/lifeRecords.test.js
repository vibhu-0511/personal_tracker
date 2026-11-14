import test from 'node:test'
import assert from 'node:assert/strict'
import { stampUpdated, mergeCheckins, mergeMoodLog } from '../src/life/records.js'

test('stampUpdated: stamps new and changed records only', () => {
  const prev = [
    { id: 'a', title: 'one', updatedAt: 5 },
    { id: 'b', title: 'two', updatedAt: 6 },
    { id: 'c', title: 'three', subtasks: [{ id: 's', text: 'x' }], updatedAt: 7 },
  ]
  const next = [
    prev[0],
    { id: 'b', title: 'two!', updatedAt: 6 },
    { id: 'c', title: 'three', subtasks: [{ id: 's', text: 'x' }], updatedAt: 7 },
    { id: 'd', title: 'new' },
  ]
  const out = stampUpdated(prev, next, 100)
  assert.equal(out[0], prev[0])
  assert.equal(out[0].updatedAt, 5)
  assert.equal(out[1].updatedAt, 100)
  assert.equal(out[2].updatedAt, 7)
  assert.equal(out[3].updatedAt, 100)
  assert.equal(next[3].updatedAt, undefined, 'does not mutate input')
})

test('stampUpdated: nested change stamps; ignoring updatedAt when comparing; carries old stamp', () => {
  const prev = [{ id: 'h', checkins: ['2026-01-01'], updatedAt: 9 }]
  assert.equal(stampUpdated(prev, [{ id: 'h', checkins: ['2026-01-01', '2026-01-02'], updatedAt: 9 }], 50)[0].updatedAt, 50)
  assert.equal(stampUpdated(prev, [{ id: 'h', checkins: ['2026-01-01'] }], 50)[0].updatedAt, 9)
})

test('stampUpdated: no prev stamps everything; mood entries are keyed by date', () => {
  assert.deepEqual(stampUpdated(undefined, [{ id: 'a' }], 1), [{ id: 'a', updatedAt: 1 }])
  const prev = [{ date: '2026-01-01', valence: 50, source: 'derived' }]
  const out = stampUpdated(prev, [{ date: '2026-01-01', valence: 75, source: 'logged' }], 3)
  assert.equal(out[0].updatedAt, 3)
  assert.equal(stampUpdated(prev, [prev[0]], 3)[0], prev[0])
})

test('mergeCheckins: sorted unique union', () => {
  assert.deepEqual(
    mergeCheckins(['2026-01-03', '2026-01-01'], ['2026-01-02', '2026-01-03']),
    ['2026-01-01', '2026-01-02', '2026-01-03'],
  )
  assert.deepEqual(mergeCheckins(undefined, ['2026-01-01']), ['2026-01-01'])
  assert.deepEqual(mergeCheckins([], []), [])
})

test('mergeMoodLog: one per date, prefers logged, sorted', () => {
  const a = [
    { date: '2026-01-02', valence: 50, source: 'derived' },
    { date: '2026-01-01', valence: 75, source: 'logged' },
  ]
  const b = [
    { date: '2026-01-01', valence: 25, source: 'derived' },
    { date: '2026-01-02', valence: 100, source: 'logged' },
    { date: '2026-01-03', valence: 50, source: 'derived' },
  ]
  for (const out of [mergeMoodLog(a, b), mergeMoodLog(b, a)]) {
    assert.deepEqual(out.map((e) => e.date), ['2026-01-01', '2026-01-02', '2026-01-03'])
    assert.equal(out[0].source, 'logged')
    assert.equal(out[0].valence, 75)
    assert.equal(out[1].source, 'logged')
    assert.equal(out[1].valence, 100)
  }
  assert.deepEqual(mergeMoodLog(null, undefined), [])
})
