import test from 'node:test'
import assert from 'node:assert/strict'
import { buildTimeline } from '../src/today/timeline.js'

const at = (d, h, m = 0) => new Date(2026, 10, d, h, m).getTime()
const NOW = new Date(2026, 10, 15, 12, 0)

const data = {
  reminders: [
    { id: 'r1', title: 'Standup', at: at(15, 9), done: true },
    { id: 'r2', title: 'Call mom', at: at(15, 18) },
    { id: 'r3', title: 'Later', at: at(15, 20), done: false },
    { id: 'r4', title: 'Tomorrow', at: at(16, 9) },
    { id: 'old2', title: 'Renew insurance', at: at(13, 10) },
    { id: 'old1', title: 'Pay rent', at: at(12, 8) },
  ],
  tasks: [
    { id: 't1', title: 'Gym', due: '2026-11-15', dueAt: at(15, 15), done: false },
    { id: 't2', title: 'No time', due: '2026-11-15', dueAt: null, done: false },
    { id: 'tOld', title: 'Old task', due: '2026-11-14', dueAt: null, done: false },
    { id: 'tDone', title: 'Done old', due: '2026-11-01', dueAt: null, done: true },
  ],
  expenses: [
    { id: 'e1', amount: 120, date: at(15, 8, 30), category: 'food' },
    { id: 'e2', amount: 5000, date: at(15, 10), category: 'pay', type: 'income' },
    { id: 'e3', amount: 50, date: at(14, 23), category: 'food' },
  ],
  notes: [
    { id: 'n1', text: '  Idea\nmore text', createdAt: at(15, 13) },
    { id: 'n2', text: 'yesterday', createdAt: at(14, 13) },
  ],
}

test('merges today in time order with one now marker', () => {
  const { items } = buildTimeline(data, NOW)
  assert.deepEqual(
    items.map((i) => i.id),
    ['e1', 'r1', 'now', 'n1', 't1', 'r2', 'r3'],
  )
  assert.equal(items.filter((i) => i.kind === 'now').length, 1)
  assert.equal(items.find((i) => i.id === 'n1').title, 'Idea')
  assert.equal(items.find((i) => i.id === 'r1').done, true)
})

test('nextUp is the earliest open reminder or timed task after now', () => {
  assert.equal(buildTimeline(data, NOW).nextUp.id, 't1')
  const later = buildTimeline(data, new Date(2026, 10, 15, 16, 0))
  assert.equal(later.nextUp.id, 'r2')
  const none = buildTimeline(data, new Date(2026, 10, 15, 23, 0))
  assert.equal(none.nextUp, null)
})

test('nextUp skips done items', () => {
  const d = { reminders: [{ id: 'a', title: 'A', at: at(15, 13), done: true }, { id: 'b', title: 'B', at: at(15, 14) }] }
  assert.equal(buildTimeline(d, NOW).nextUp.id, 'b')
})

test('overdue is separate, oldest first', () => {
  const { overdue, items } = buildTimeline(data, NOW)
  assert.deepEqual(overdue.map((i) => i.id), ['old1', 'old2', 'tOld'])
  assert.ok(!items.some((i) => ['old1', 'old2', 'tOld'].includes(i.id)))
})

test('empty input yields only the now marker', () => {
  const r = buildTimeline({}, NOW)
  assert.deepEqual(r.items.map((i) => i.kind), ['now'])
  assert.equal(r.nextUp, null)
  assert.deepEqual(r.overdue, [])
})

test('does not mutate inputs', () => {
  const copy = JSON.parse(JSON.stringify(data))
  buildTimeline(data, NOW)
  assert.deepEqual(data, copy)
})

test('note rows title from body, fall back to text, prefer explicit title', () => {
  const d = {
    notes: [
      { id: 'b', body: '  First line\nrest', createdAt: at(15, 9) },
      { id: 'x', text: 'Legacy\nmore', createdAt: at(15, 10) },
      { id: 't', title: 'Explicit', body: 'Body line', createdAt: at(15, 11) },
    ],
  }
  const t = (id) => buildTimeline(d, NOW).items.find((i) => i.id === id).title
  assert.equal(t('b'), 'First line')
  assert.equal(t('x'), 'Legacy')
  assert.equal(t('t'), 'Explicit')
})
