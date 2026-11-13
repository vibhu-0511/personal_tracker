import { useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { showToast } from '../../toast.js'
import { DndArea, DropList, SortableRow, useDragging } from '../../dnd/Dnd.jsx'
import { placeItem, taskDropPatch, moveSubtask } from '../../dnd/logic.js'
import { formatAdded } from '../../time.js'
import { dateKey, parseQuick } from '../logic.js'
import { useLatest } from '../../useLatest.js'
import { deleteWithUndo } from '../../undo.js'
import { newId } from '../../id.js'
import { fireConfetti } from '../confetti.js'

const URGENCY_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'urgent', label: 'Urgent' },
  { id: 'important', label: 'Important' },
  { id: 'not-important', label: 'Not important' },
  { id: 'extras', label: 'Extras' },
]

function quadrantLabel(t) {
  if (t.urgent && t.important) return { label: 'Urgent', cls: 'chip' }
  if (t.important) return { label: 'Important', cls: 'chip' }
  if (t.urgent) return { label: 'Not important', cls: 'chip-muted' }
  return null
}

function matchesUrgency(t, f) {
  if (f === 'urgent') return t.urgent && t.important
  if (f === 'important') return t.important && !t.urgent
  if (f === 'not-important') return t.urgent && !t.important
  if (f === 'extras') return !t.urgent && !t.important
  return true
}

export default function TasksView({ tasks, onUpdate, now }) {
  const [quick, setQuick] = useState('')
  const [filter, setFilter] = useState('')
  const [urgencyFilter, setUrgencyFilter] = useState('all')
  const [editingId, setEditingId] = useState(null)
  const [editTitle, setEditTitle] = useState('')
  const [editDue, setEditDue] = useState('')
  const [newUrgent, setNewUrgent] = useState(false)
  const [newImportant, setNewImportant] = useState(false)
  const todayKey = dateKey(now)
  const tasksRef = useLatest(tasks)

  function addTask() {
    const text = quick.trim()
    if (!text) return
    const { title, date, at } = parseQuick(text, now)
    const task = {
      id: newId(),
      title: title || text,
      due: date ? dateKey(date) : null,
      dueAt: at ? at.getTime() : null,
      done: false,
      doneAt: null,
      createdAt: Date.now(),
      urgent: newUrgent,
      important: newImportant,
    }
    onUpdate([task, ...tasks])
    setQuick('')
    setNewUrgent(false)
    setNewImportant(false)
  }

  function toggleFlag(id, flag) {
    onUpdate(tasks.map((t) => (t.id === id ? { ...t, [flag]: !t[flag] } : t)))
  }

  async function toggle(id) {
    const task = tasks.find((t) => t.id === id)
    const wasDone = task.done
    const next = tasks.map((t) =>
      t.id === id ? { ...t, done: !t.done, doneAt: !t.done ? Date.now() : null } : t
    )
    await onUpdate(next)
    if (!wasDone) {
      const hadDueToday = tasks.some((t) => !t.done && t.due === todayKey)
      const stillDueToday = next.some((t) => !t.done && t.due === todayKey)
      if (hadDueToday && !stillDueToday) fireConfetti()
    }
  }

  function remove(id) {
    deleteWithUndo({
      list: tasks, id, persist: onUpdate, ref: tasksRef,
      label: (task) => `Deleted "${task.title}"`,
    })
  }

  function setSubtasks(id, subtasks) {
    onUpdate(tasks.map((t) => (t.id === id ? { ...t, subtasks } : t)))
  }
  function removeSubtask(id, subId) {
    const item = tasks.find((t) => t.id === id)?.subtasks?.find((s) => s.id === subId)
    onUpdate(tasks.map((t) => (t.id === id ? { ...t, subtasks: t.subtasks.filter((s) => s.id !== subId) } : t)))
    if (item) {
      showToast(`Deleted "${item.text}"`, {
        undo: () => onUpdate(
          tasksRef.current.map((t) => (t.id === id ? { ...t, subtasks: [item, ...(t.subtasks || [])] } : t))
        ),
      })
    }
  }

  function onMove({ type, id, from, to, overId, after }) {
    if (type === 'sub') {
      onUpdate(moveSubtask(tasks, id, from.slice(4), to.slice(4), overId, after))
      return
    }
    if (to === 'overdue' && from !== 'overdue') return
    if (to === 'upcoming' && from === 'upcoming') return
    const tomorrowKey = dateKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1))
    const patch = from === to ? {} : taskDropPatch(to, tasks.find((t) => t.id === id), todayKey, tomorrowKey)
    onUpdate(placeItem(tasks, id, overId, { patch, after }))
  }

  function startEdit(t) {
    setEditingId(t.id)
    setEditTitle(t.title)
    setEditDue(t.due || '')
  }
  function cancelEdit() {
    setEditingId(null)
  }
  function saveEdit(id) {
    const title = editTitle.trim()
    if (!title) return
    onUpdate(tasks.map((t) => (t.id === id ? { ...t, title, due: editDue || null } : t)))
    setEditingId(null)
  }

  const q = filter.trim().toLowerCase()
  let visible = q ? tasks.filter((t) => t.title.toLowerCase().includes(q)) : tasks
  if (urgencyFilter !== 'all') visible = visible.filter((t) => matchesUrgency(t, urgencyFilter))

  const overdue = visible.filter((t) => !t.done && t.due && t.due < todayKey)
  const dueToday = visible.filter((t) => !t.done && t.due === todayKey)
  const upcoming = visible
    .filter((t) => !t.done && t.due && t.due > todayKey)
    .sort((a, b) => a.due.localeCompare(b.due))
  const noDate = visible.filter((t) => !t.done && !t.due)
  const done = visible.filter((t) => t.done)

  const editProps = {
    editingId, editTitle, setEditTitle, editDue, setEditDue,
    onStartEdit: startEdit, onSaveEdit: saveEdit, onCancelEdit: cancelEdit,
    onSubtasks: setSubtasks, onRemoveSubtask: removeSubtask,
  }

  return (
    <div>
      <div className="life-quick-add">
        <input
          value={quick}
          onChange={(e) => setQuick(e.target.value)}
          placeholder='Add a task… "gym tomorrow 5pm"'
          onKeyDown={(e) => e.key === 'Enter' && addTask()}
        />
        <button
          className="life-icon-btn"
          title="Urgent"
          aria-label="New task urgent"
          style={{ opacity: newUrgent ? 1 : 0.3 }}
          onClick={() => setNewUrgent((v) => !v)}
        >
          🔥
        </button>
        <button
          className="life-icon-btn"
          title="Important"
          aria-label="New task important"
          style={{ opacity: newImportant ? 1 : 0.3 }}
          onClick={() => setNewImportant((v) => !v)}
        >
          ⭐
        </button>
        <button className="btn btn-primary btn-sm" onClick={addTask} disabled={!quick.trim()}>
          Add
        </button>
      </div>

      {tasks.length > 0 && (
        <>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
            {URGENCY_FILTERS.map((f) => (
              <button
                key={f.id}
                className={`chip${urgencyFilter === f.id ? '' : ' chip-muted'}`}
                style={{ cursor: 'pointer', border: 'none' }}
                onClick={() => setUrgencyFilter(f.id)}
              >
                {f.label}
              </button>
            ))}
          </div>
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="🔍 Filter tasks..."
            style={{ marginBottom: 12 }}
          />
        </>
      )}

      <DndArea onMove={onMove}>
        <TaskSection id="overdue" label="Overdue" items={overdue} overdue {...editProps} onToggle={toggle} onRemove={remove} onToggleFlag={toggleFlag} />
        <TaskSection id="today" label="Today" items={dueToday} {...editProps} onToggle={toggle} onRemove={remove} onToggleFlag={toggleFlag} />
        <TaskSection id="upcoming" label="Upcoming" items={upcoming} {...editProps} onToggle={toggle} onRemove={remove} onToggleFlag={toggleFlag} />
        <TaskSection id="nodate" label="No date" items={noDate} {...editProps} onToggle={toggle} onRemove={remove} onToggleFlag={toggleFlag} />
      </DndArea>
      {done.length > 0 && <DoneTaskSection items={done} onToggle={toggle} onRemove={remove} />}

      {visible.length === 0 && (
        <div className="empty-state">
          <div className="empty-icon">✅</div>
          <div className="empty-text">{tasks.length === 0 ? 'No tasks yet.' : 'No tasks match your filter.'}</div>
        </div>
      )}
    </div>
  )
}

function TaskSection({
  id, label, items, overdue, onToggle, onRemove, onToggleFlag,
  editingId, editTitle, setEditTitle, editDue, setEditDue, onStartEdit, onSaveEdit, onCancelEdit,
  onSubtasks, onRemoveSubtask,
}) {
  const [open, setOpen] = useState({})
  const [drafts, setDrafts] = useState({})
  const dragging = useDragging()
  if (items.length === 0 && !(dragging?.type === 'task' && id !== 'overdue')) return null

  function addSub(t) {
    const text = (drafts[t.id] || '').trim()
    if (!text) return
    onSubtasks(t.id, [...(t.subtasks || []), { id: newId(), text, checked: false, createdAt: Date.now() }])
    setDrafts((d) => ({ ...d, [t.id]: '' }))
  }
  return (
    <>
      <div className="life-section-label">{label}</div>
      <DropList id={id} type="task" items={items.map((t) => t.id)} dropDisabled={id === 'overdue'}>
      <AnimatePresence initial={false}>
        {items.map((t) => (
          <SortableRow key={t.id} id={t.id} type="task" disabled={editingId === t.id}>
          {(handle) => editingId === t.id ? (
            <motion.div className="life-row">
              <input
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                autoFocus
                style={{ flex: 1 }}
                onKeyDown={(e) => e.key === 'Enter' && onSaveEdit(t.id)}
              />
              <input
                type="date"
                value={editDue}
                onChange={(e) => setEditDue(e.target.value)}
                style={{ width: 140 }}
              />
              <button
                className="btn btn-primary btn-sm"
                onClick={() => onSaveEdit(t.id)}
                disabled={!editTitle.trim()}
              >
                Save
              </button>
              <button className="btn btn-ghost btn-sm" onClick={onCancelEdit}>Cancel</button>
            </motion.div>
          ) : (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, x: 40 }}
            >
            <div className={`life-row${overdue ? ' overdue' : ''}`}>
              {handle}
              <button className="life-check" onClick={() => onToggle(t.id)} aria-label="Mark done" />
              <div className="life-row-title">
                {t.title}
                <div className="meta" style={{ fontSize: 11 }}>added {formatAdded(t.createdAt)}</div>
              </div>
              {quadrantLabel(t) && (
                <span className={quadrantLabel(t).cls} style={{ flexShrink: 0 }}>
                  {quadrantLabel(t).label}
                </span>
              )}
              {t.due && (
                <div className="life-row-due">
                  {t.due}
                  {t.dueAt && ` · ${new Date(t.dueAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`}
                </div>
              )}
              <button
                className="life-icon-btn"
                title="Urgent"
                aria-label="Toggle urgent"
                style={{ opacity: t.urgent ? 1 : 0.3 }}
                onClick={() => onToggleFlag(t.id, 'urgent')}
              >
                🔥
              </button>
              <button
                className="life-icon-btn"
                title="Important"
                aria-label="Toggle important"
                style={{ opacity: t.important ? 1 : 0.3 }}
                onClick={() => onToggleFlag(t.id, 'important')}
              >
                ⭐
              </button>
              <button
                className="life-icon-btn"
                title="Subtasks"
                aria-label="Toggle subtasks"
                style={{ opacity: t.subtasks?.length ? 1 : 0.4, fontSize: 12 }}
                onClick={() => setOpen((o) => ({ ...o, [t.id]: !o[t.id] }))}
              >
                {t.subtasks?.length ? `${t.subtasks.filter((s) => s.checked).length}/${t.subtasks.length}` : '☰'} {open[t.id] ? '▴' : '▾'}
              </button>
              <button className="life-icon-btn" title="Edit" aria-label="Edit" onClick={() => onStartEdit(t)}>
                ✎
              </button>
              <button className="life-icon-btn" title="Delete" aria-label="Delete" onClick={() => onRemove(t.id)}>
                🗑️
              </button>
            </div>
            {open[t.id] && (
              <div style={{ padding: '2px 12px 10px 40px' }}>
                <DropList id={`sub:${t.id}`} type="sub" items={(t.subtasks || []).map((s) => s.id)}>
                  {(t.subtasks || []).map((s) => (
                    <SortableRow key={s.id} id={s.id} type="sub">
                      {(subHandle) => (
                        <div className="exam-topic-row">
                          {subHandle}
                          <input
                            type="checkbox"
                            checked={s.checked}
                            onChange={() =>
                              onSubtasks(t.id, t.subtasks.map((x) => (x.id === s.id ? { ...x, checked: !x.checked } : x)))
                            }
                          />
                          <span style={{ flex: 1, textDecoration: s.checked ? 'line-through' : 'none', opacity: s.checked ? 0.5 : 1 }}>
                            {s.text}
                            <span className="meta" style={{ fontSize: 11, marginLeft: 6 }}>{formatAdded(s.createdAt)}</span>
                          </span>
                          <button className="life-icon-btn" title="Delete item" onClick={() => onRemoveSubtask(t.id, s.id)}>
                            🗑️
                          </button>
                        </div>
                      )}
                    </SortableRow>
                  ))}
                </DropList>
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <input
                    value={drafts[t.id] || ''}
                    onChange={(e) => setDrafts((d) => ({ ...d, [t.id]: e.target.value }))}
                    placeholder="Add item..."
                    style={{ flex: 1 }}
                    onKeyDown={(e) => e.key === 'Enter' && addSub(t)}
                  />
                  <button className="btn btn-primary btn-sm" onClick={() => addSub(t)} disabled={!(drafts[t.id] || '').trim()}>
                    Add
                  </button>
                </div>
              </div>
            )}
            </motion.div>
          )}
          </SortableRow>
        ))}
      </AnimatePresence>
      </DropList>
    </>
  )
}

function DoneTaskSection({ items, onToggle, onRemove }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        className="life-section-label"
        style={{ background: 'none', border: 'none', cursor: 'pointer' }}
        onClick={() => setOpen((v) => !v)}
      >
        {open ? '▾' : '▸'} Done ({items.length})
      </button>
      {open && (
        <AnimatePresence initial={false}>
          {items.map((t) => (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="life-row done"
            >
              <button className="life-check done" aria-label="Mark not done" onClick={() => onToggle(t.id)}>
                ✓
              </button>
              <div className="life-row-title">{t.title}</div>
              <button className="life-icon-btn" title="Delete" aria-label="Delete" onClick={() => onRemove(t.id)}>
                🗑️
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      )}
    </>
  )
}
