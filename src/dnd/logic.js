// Move `id` next to `overId` (end of list when overId is null), merging `patch` into it.
export function placeItem(list, id, overId, { patch = {}, after = false } = {}) {
  const item = list.find((x) => x.id === id)
  if (!item) return list
  const rest = list.filter((x) => x.id !== id)
  const moved = { ...item, ...patch }
  const i = overId == null ? -1 : rest.findIndex((x) => x.id === overId)
  if (i < 0) return [...rest, moved]
  rest.splice(after ? i + 1 : i, 0, moved)
  return rest
}

// Due-date change implied by dropping a task into a section. `today`/`tomorrow` are date keys.
export function taskDropPatch(section, task, today, tomorrow) {
  if (section === 'today') return { due: today, dueAt: task.due === today ? task.dueAt : null }
  if (section === 'nodate') return { due: null, dueAt: null }
  if (section === 'upcoming') return task.due && task.due > today ? {} : { due: tomorrow, dueAt: null }
  return {}
}

// A note can't be nested under itself or one of its own descendants.
export function canNest(id, parentId, notes) {
  let p = parentId
  while (p) {
    if (p === id) return false
    p = notes.find((n) => n.id === p)?.parentId || null
  }
  return true
}

// Move subtask `subId` from task `fromId` to task `toId` (may be the same), next to `overId`.
export function moveSubtask(tasks, subId, fromId, toId, overId, after) {
  const sub = tasks.find((t) => t.id === fromId)?.subtasks?.find((s) => s.id === subId)
  if (!sub) return tasks
  return tasks.map((t) => {
    let subs = t.subtasks || []
    if (t.id === fromId) subs = subs.filter((s) => s.id !== subId)
    if (t.id === toId) {
      const i = overId == null ? -1 : subs.findIndex((s) => s.id === overId)
      subs = [...subs]
      subs.splice(i < 0 ? subs.length : after ? i + 1 : i, 0, sub)
    }
    return t.id === fromId || t.id === toId ? { ...t, subtasks: subs } : t
  })
}
