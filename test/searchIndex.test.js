import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fuzzyScore, buildIndex, searchIndex, screenEntries } from '../src/shell/searchIndex.js'
import { ROUTES } from '../src/routes.js'

test('fuzzyScore: tiers and non-matches', () => {
  assert.equal(fuzzyScore('', 'anything'), 0)
  assert.equal(fuzzyScore('abc', ''), null)
  assert.equal(fuzzyScore('zzz', 'tasks'), null)
  const exact = fuzzyScore('tasks', 'Tasks')
  const prefix = fuzzyScore('tas', 'Tasks')
  const word = fuzzyScore('tas', 'Open tasks')
  const inner = fuzzyScore('ask', 'Tasks')
  const subseq = fuzzyScore('tsk', 'Tasks')
  assert.ok(exact > prefix && prefix > word && word > inner && inner > subseq && subseq > 0)
})

test('fuzzyScore: order matters for subsequences and consecutive runs score higher', () => {
  assert.equal(fuzzyScore('ts', 'st'), null)
  assert.ok(fuzzyScore('lgc', 'Logic') > fuzzyScore('lgc', 'Long gentle cat') - 1)
})

test('screenEntries: a tab entry and a sub-view entry for every route', () => {
  const entries = screenEntries()
  const expected = Object.values(ROUTES).reduce((n, r) => n + 1 + r.views.length, 0)
  assert.equal(entries.length, expected)
  assert.ok(entries.find((e) => e.path === '/today'))
  assert.ok(entries.find((e) => e.path === '/life/notes' && e.title === 'Life · Notes'))
  assert.ok(entries.find((e) => e.path === '/money/loans'))
  assert.equal(entries.find((e) => e.path === '/money/txns'), undefined)
})

const tasks = [
  { id: 't1', title: 'Pay electricity bill', done: false },
  { id: 't2', title: 'Book dentist', done: true },
  { id: 't3', title: '' },
  null,
]
const notes = [
  { id: 'n1', body: 'Groceries\nmilk, eggs, bread' },
  { id: 'n2', body: '   ' },
  { id: 'n3', body: 'Floss daily\nask the dentist about it' },
]

test('buildIndex: includes screens, tasks and notes; skips malformed rows', () => {
  const idx = buildIndex({ tasks, notes })
  const kinds = idx.reduce((m, e) => ({ ...m, [e.kind]: (m[e.kind] ?? 0) + 1 }), {})
  assert.equal(kinds.task, 2)
  assert.equal(kinds.note, 2)
  assert.ok(kinds.screen > 6)
  assert.equal(idx.find((e) => e.id === 'task:t2').subtitle, 'Task · done')
  assert.equal(idx.find((e) => e.id === 'note:n1').title, 'Groceries')
  assert.equal(idx.find((e) => e.id === 'task:t1').path, '/life/tasks')
  assert.equal(idx.find((e) => e.id === 'note:n3').path, '/life/notes')
})

test('buildIndex: tolerates missing or non-array input', () => {
  assert.ok(buildIndex().length > 0)
  assert.ok(buildIndex({ tasks: 'x', notes: {} }).every((e) => e.kind === 'screen'))
})

test('searchIndex: empty query lists screens only', () => {
  const out = searchIndex(buildIndex({ tasks, notes }), '', 100)
  assert.ok(out.length > 0 && out.every((e) => e.kind === 'screen'))
})

test('searchIndex: finds a task by title and a note by its body', () => {
  const idx = buildIndex({ tasks, notes })
  assert.equal(searchIndex(idx, 'electricity')[0].id, 'task:t1')
  assert.equal(searchIndex(idx, 'eggs')[0].id, 'note:n1')
})

test('searchIndex: title hits outrank body hits', () => {
  const idx = buildIndex({ tasks, notes })
  const out = searchIndex(idx, 'dentist').map((e) => e.id)
  assert.deepEqual(out.slice(0, 2), ['task:t2', 'note:n3'])
})

test('searchIndex: matches screens by name and honours the limit', () => {
  const idx = buildIndex({ tasks, notes })
  assert.equal(searchIndex(idx, 'invest learn')[0].path, '/invest/learn')
  assert.equal(searchIndex(idx, 'life', 3).length, 3)
  assert.deepEqual(searchIndex(idx, 'qqqqqq'), [])
})

test('searchIndex: an open reminder is found by title and navigates to the reminders view', () => {
  const reminders = [
    { id: 'r1', title: 'Call the plumber', at: 1, done: false },
    { id: 'r2', title: 'Renew passport', at: 2, done: true },
    { id: 'r3', title: '' },
    null,
  ]
  const idx = buildIndex({ tasks, notes, reminders })
  assert.equal(idx.filter((e) => e.kind === 'reminder').length, 2)
  const hit = searchIndex(idx, 'plumber')[0]
  assert.equal(hit.id, 'reminder:r1')
  assert.equal(hit.kind, 'reminder')
  assert.equal(hit.subtitle, 'Reminder')
  assert.equal(hit.path, '/life/reminders')
  assert.equal(searchIndex(idx, 'passport')[0].subtitle, 'Reminder · done')
  assert.ok(buildIndex({ reminders: 'x' }).every((e) => e.kind === 'screen'))
})
