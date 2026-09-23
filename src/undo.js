import { showToast } from './toast.js'

// Delete `id` from `list` and persist it, offering an undo toast that restores
// the item into whatever the list looks like *at undo time* — via `ref`, a
// useLatest(list) — rather than the pre-delete snapshot. A plain snapshot
// closure would discard anything added between the delete and the undo.
export function deleteWithUndo({ list, id, persist, label, ref }) {
  const item = list.find((x) => x.id === id)
  if (!item) return
  persist(list.filter((x) => x.id !== id))
  showToast(label(item), { undo: () => persist([item, ...ref.current]) })
}
