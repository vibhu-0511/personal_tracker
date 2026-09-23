import test from 'node:test'
import assert from 'node:assert/strict'
import { placeItem, taskDropPatch, canNest, moveSubtask } from '../src/dnd/logic.js'

const ids = (l) => l.map((x) => x.id).join('')
const L = () => ['a', 'b', 'c', 'd'].map((id) => ({ id }))

test('placeItem reorders before/after and appends', () => {
  assert.equal(ids(placeItem(L(), 'a', 'c', { after: true })), 'bcad')
  assert.equal(ids(placeItem(L(), 'd', 'b')), 'adbc')
  assert.equal(ids(placeItem(L(), 'a', null)), 'bcda')
  assert.equal(ids(placeItem(L(), 'zz', 'b')), 'abcd')
})

test('placeItem merges patch', () => {
  assert.equal(placeItem(L(), 'a', 'b', { patch: { parentId: 'x' } })[0].parentId, 'x')
})

test('taskDropPatch sets dates per section', () => {
  const t = { due: '2026-01-01', dueAt: 5 }
  assert.deepEqual(taskDropPatch('today', t, '2026-01-02', '2026-01-03'), { due: '2026-01-02', dueAt: null })
  assert.deepEqual(taskDropPatch('today', { due: '2026-01-02', dueAt: 5 }, '2026-01-02', 'x'), { due: '2026-01-02', dueAt: 5 })
  assert.deepEqual(taskDropPatch('nodate', t, 'a', 'b'), { due: null, dueAt: null })
  assert.deepEqual(taskDropPatch('upcoming', t, '2026-01-02', '2026-01-03'), { due: '2026-01-03', dueAt: null })
  assert.deepEqual(taskDropPatch('upcoming', { due: '2026-02-01' }, '2026-01-02', 'x'), {})
})

test('canNest blocks cycles', () => {
  const notes = [{ id: 'a', parentId: null }, { id: 'b', parentId: 'a' }, { id: 'c', parentId: 'b' }]
  assert.equal(canNest('a', 'c', notes), false)
  assert.equal(canNest('a', 'a', notes), false)
  assert.equal(canNest('c', 'a', notes), true)
  assert.equal(canNest('c', null, notes), true)
})

test('moveSubtask moves within and across tasks', () => {
  const tasks = [
    { id: 't1', subtasks: [{ id: 's1' }, { id: 's2' }, { id: 's3' }] },
    { id: 't2', subtasks: [{ id: 's4' }] },
    { id: 't3' },
  ]
  const same = moveSubtask(tasks, 's1', 't1', 't1', 's3', true)
  assert.deepEqual(same[0].subtasks.map((s) => s.id), ['s2', 's3', 's1'])
  const cross = moveSubtask(tasks, 's2', 't1', 't2', 's4', false)
  assert.deepEqual(cross[0].subtasks.map((s) => s.id), ['s1', 's3'])
  assert.deepEqual(cross[1].subtasks.map((s) => s.id), ['s2', 's4'])
  const toEmpty = moveSubtask(tasks, 's4', 't2', 't3', null, false)
  assert.deepEqual(toEmpty[2].subtasks.map((s) => s.id), ['s4'])
  assert.deepEqual(toEmpty[1].subtasks, [])
})
