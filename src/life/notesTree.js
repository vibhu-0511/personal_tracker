// Pure helpers for the parentId note tree. A note is `{ id, parentId, pinned, ... }`.

// Group notes by parent id. Root notes (no parentId) live under the `null` key.
export function buildChildMap(notes) {
  const map = {}
  for (const n of notes) {
    const p = n.parentId || null
    ;(map[p] ||= []).push(n)
  }
  return map
}

// Pinned notes first; otherwise keeps the incoming order (stable sort). Does not mutate.
export function sortSiblings(list) {
  return [...list].sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0))
}

// Ids of every descendant of `id` (depth-first, children before their own descendants).
export function collectDescendantIds(id, childMap) {
  const kids = childMap[id] || []
  return kids.flatMap((k) => [k.id, ...collectDescendantIds(k.id, childMap)])
}

// Number of descendants of `id`, used for the cascade-delete confirmation.
export function countDescendants(id, childMap) {
  return collectDescendantIds(id, childMap).length
}
