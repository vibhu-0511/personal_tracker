import test from 'node:test'
import assert from 'node:assert/strict'
import { deleteWithUndo } from '../src/undo.js'
import { onToastsChange } from '../src/toast.js'

function fakeRef(initial) {
  return { current: initial }
}

test('deleteWithUndo removes the item and persists the filtered list', () => {
  const list = [{ id: 1 }, { id: 2 }, { id: 3 }]
  let persisted
  deleteWithUndo({ list, id: 2, persist: (next) => { persisted = next }, label: () => 'x', ref: fakeRef(list) })
  assert.deepEqual(persisted.map((x) => x.id), [1, 3])
})

test('deleteWithUndo does nothing when the id is not found', () => {
  const list = [{ id: 1 }]
  let called = false
  deleteWithUndo({ list, id: 999, persist: () => { called = true }, label: () => 'x', ref: fakeRef(list) })
  assert.equal(called, false)
})

test('undo restores into the list as it stands at undo time, not the pre-delete snapshot', () => {
  const ref = fakeRef([{ id: 1 }, { id: 2 }])
  let persisted
  const persist = (next) => { persisted = next; ref.current = next }

  let latestToasts = []
  const unsubscribe = onToastsChange((toasts) => { latestToasts = toasts })

  deleteWithUndo({ list: ref.current, id: 1, persist, label: () => 'deleted', ref })
  assert.deepEqual(persisted.map((x) => x.id), [2])

  // an item is added to the list after the delete but before undo is clicked
  ref.current = [...ref.current, { id: 3 }]

  const toast = latestToasts[latestToasts.length - 1]
  toast.undo()

  assert.deepEqual(persisted.map((x) => x.id).sort(), [1, 2, 3])
  unsubscribe()
})
