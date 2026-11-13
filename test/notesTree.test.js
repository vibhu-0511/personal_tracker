import test from 'node:test'
import assert from 'node:assert/strict'
import { buildChildMap, sortSiblings, collectDescendantIds, countDescendants } from '../src/life/notesTree.js'

const N = (id, parentId, pinned = false) => ({ id, parentId, pinned })
// a
// ├─ b
// │  └─ d
// └─ c
// e (root)
const notes = [N('a', null), N('b', 'a'), N('c', 'a'), N('d', 'b'), N('e', undefined)]

test('buildChildMap groups by parent and treats missing parentId as root', () => {
  const m = buildChildMap(notes)
  assert.deepEqual(m[null].map((n) => n.id), ['a', 'e'])
  assert.deepEqual(m.a.map((n) => n.id), ['b', 'c'])
  assert.deepEqual(m.b.map((n) => n.id), ['d'])
  assert.equal(m.c, undefined)
  assert.deepEqual(buildChildMap([]), {})
})

test('sortSiblings puts pinned first, keeps order otherwise, does not mutate', () => {
  const list = [N('x', null), N('y', null, true), N('z', null), N('w', null, true)]
  assert.deepEqual(sortSiblings(list).map((n) => n.id), ['y', 'w', 'x', 'z'])
  assert.deepEqual(list.map((n) => n.id), ['x', 'y', 'z', 'w'])
  assert.deepEqual(sortSiblings([]), [])
})

test('collectDescendantIds walks the whole subtree', () => {
  const m = buildChildMap(notes)
  assert.deepEqual(collectDescendantIds('a', m), ['b', 'd', 'c'])
  assert.deepEqual(collectDescendantIds('b', m), ['d'])
  assert.deepEqual(collectDescendantIds('c', m), [])
  assert.deepEqual(collectDescendantIds('missing', m), [])
})

test('countDescendants counts the subtree, excluding the note itself', () => {
  const m = buildChildMap(notes)
  assert.equal(countDescendants('a', m), 3)
  assert.equal(countDescendants('b', m), 1)
  assert.equal(countDescendants('e', m), 0)
})
