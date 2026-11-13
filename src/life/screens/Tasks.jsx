import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { showToast } from '../../toast.js'
import { DndArea, DropList, SortableRow, useDragging } from '../../dnd/Dnd.jsx'
import { placeItem, taskDropPatch, moveSubtask } from '../../dnd/logic.js'
import { formatAdded } from '../../time.js'
import { dateKey, parseQuick } from '../logic.js'
import { matchesUrgency, taskBuckets } from '../selectors.js'
import { useLatest } from '../../useLatest.js'
import { useCommand } from '../../shell/commands.js'
import { deleteWithUndo } from '../../undo.js'
import { newId } from '../../id.js'
import { fireConfetti } from '../confetti.js'
import MasterDetail from '../ui/MasterDetail.jsx'
import TaskInspector from './TaskInspector.jsx'
// MasterDetail's layout rules; nothing else imports them yet.
import '../life.css'

const URGENCY_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'urgent', label: 'Urgent' },
  { id: 'important', label: 'Important' },
  { id: 'not-important', label: 'Not important' },
  { id: 'extras', label: 'Extras' },
]

// The inspector pane starts at 1024px of `.app-root` (errata C-4), the same container
// MasterDetail and Inspector.jsx measure. Below it the same editor opens as a Sheet.
const INSPECTOR_MIN = 1024

function measureWide() {
  if (typeof document === 'undefined') return false
  const el = document.querySelector('.app-root')
  return (el ? el.clientWidth : window.innerWidth) >= INSPECTOR_MIN
}

function useInspectorPane() {
  const [wide, setWide] = useState(measureWide)
  useEffect(() => {
    const el = typeof document === 'undefined' ? null : document.querySelector('.app-root')
    const measure = () => setWide(measureWide())
    measure()
    if (el && typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(measure)
      ro.observe(el)
      return () => ro.disconnect()
    }
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [])
  return wide
}

function quadrantLabel(t) {
  if (t.urgent && t.important) return { label: 'Urgent', cls: 'chip' }
  if (t.important) return { label: 'Important', cls: 'chip' }
  if (t.urgent) return { label: 'Not important', cls: 'chip-muted' }
  return null
}

// Props:
//   tasks, onUpdate, now   as before
//   selectedId, onSelect   the selected task id lives in the props (a route param later) so a
//                          sync refresh that swaps `tasks` keeps the inspector open. Until the
//                          parent passes them, the screen keeps the id in its own top-level state
//                          (never in the inspector or the rows).
export default function TasksView({ tasks, onUpdate, now, selectedId, onSelect }) {
  const [quick, setQuick] = useState('')
  const [filter, setFilter] = useState('')
  const [urgencyFilter, setUrgencyFilter] = useState('all')
  const [newUrgent, setNewUrgent] = useState(false)
  const [newImportant, setNewImportant] = useState(false)
  const [localSelected, setLocalSelected] = useState(null)
  const todayKey = dateKey(now)
  const tasksRef = useLatest(tasks)
  const wide = useInspectorPane()

  const controlled = selectedId !== undefined
  const currentId = controlled ? selectedId : localSelected
  const selected = currentId ? tasks.find((t) => t.id === currentId) || null : null
  function select(id) {
    if (!controlled) setLocalSelected(id)
    onSelect?.(id)
  }

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

  function patchTask(id, patch) {
    onUpdate(tasksRef.current.map((t) => (t.id === id ? { ...t, ...patch } : t)))
  }

  async function toggle(id) {
    const task = tasks.find((t) => t.id === id)
    if (!task) return
    const wasDone = task.done
    const next = tasks.map((t) =>
      t.id === id ? { ...t, done: !t.done, doneAt: !t.done ? Date.now() : null } : t
    )
    if (!wasDone && id === currentId) select(null) // a completed row leaves the open list
    await onUpdate(next)
    if (!wasDone) {
      const hadDueToday = tasks.some((t) => !t.done && t.due === todayKey)
      const stillDueToday = next.some((t) => !t.done && t.due === todayKey)
      if (hadDueToday && !stillDueToday) fireConfetti()
    }
  }

  // X (the shell's plain-key shortcut) completes the selected task. Registered only while an
  // open task is selected, so X does nothing otherwise.
  useCommand(selected && !selected.done ? 'complete' : null, 'Complete selected task', () => {
    if (selected) toggle(selected.id)
  })

  function remove(id) {
    if (id === currentId) select(null)
    deleteWithUndo({
      list: tasks, id, persist: onUpdate, ref: tasksRef,
      label: (task) => `Deleted "${task.title}"`,
    })
  }

  function setSubtasks(id, subtasks) {
    patchTask(id, { subtasks })
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

  const q = filter.trim().toLowerCase()
  let visible = q ? tasks.filter((t) => t.title.toLowerCase().includes(q)) : tasks
  if (urgencyFilter !== 'all') visible = visible.filter((t) => matchesUrgency(t, urgencyFilter))

  const { overdue, dueToday, upcoming, noDate, done } = taskBuckets(visible, todayKey)

  const rowProps = { selectedId: selected?.id ?? null, onSelect: select, onToggle: toggle, onRemove: remove }

  const list = (
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

      <TaskSection id="overdue" label="Overdue" items={overdue} overdue {...rowProps} />
      <TaskSection id="today" label="Today" items={dueToday} {...rowProps} />
      <TaskSection id="upcoming" label="Upcoming" items={upcoming} {...rowProps} />
      <TaskSection id="nodate" label="No date" items={noDate} {...rowProps} />
      {done.length > 0 && <DoneTaskSection items={done} onToggle={toggle} onRemove={remove} />}

      {visible.length === 0 && (
        <div className="empty-state">
          <div className="empty-icon">✅</div>
          <div className="empty-text">{tasks.length === 0 ? 'No tasks yet.' : 'No tasks match your filter.'}</div>
        </div>
      )}
    </div>
  )

  const editor = selected && (
    <TaskInspector
      task={selected}
      onChange={patchTask}
      onToggle={toggle}
      onDelete={remove}
      onSubtasks={setSubtasks}
      onRemoveSubtask={removeSubtask}
      onClose={wide ? () => select(null) : undefined}
    />
  )

  // The editor is mounted in exactly one place: the inspector pane from 1024px, otherwise the
  // detail Sheet (MasterDetail decides inline vs Sheet at 1280, so `detail` stays empty while
  // the inspector pane is showing).
  return (
    <DndArea onMove={onMove}>
      <MasterDetail
        list={list}
        inspector={wide ? (editor || <div className="meta">Select a task to edit it.</div>) : null}
        detail={wide ? null : editor}
        hasSelection={Boolean(selected)}
        onBack={() => select(null)}
      />
    </DndArea>
  )
}

function TaskSection({ id, label, items, overdue, selectedId, onSelect, onToggle, onRemove }) {
  const dragging = useDragging()
  if (items.length === 0 && !(dragging?.type === 'task' && id !== 'overdue')) return null

  return (
    <>
      <div className="life-section-label">{label}</div>
      <DropList id={id} type="task" items={items.map((t) => t.id)} dropDisabled={id === 'overdue'}>
      <AnimatePresence initial={false}>
        {items.map((t) => {
          const isSelected = t.id === selectedId
          const subs = t.subtasks || []
          return (
            <SortableRow key={t.id} id={t.id} type="task">
            {(handle) => (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: 40 }}
              >
              <div
                className={`life-row${overdue ? ' overdue' : ''}`}
                data-task-id={t.id}
                data-selected={isSelected ? 'true' : undefined}
                aria-current={isSelected ? 'true' : undefined}
                tabIndex={0}
                style={{
                  cursor: 'pointer',
                  ...(isSelected ? { boxShadow: 'inset 0 0 0 2px var(--accent)' } : null),
                }}
                onClick={(e) => {
                  if (e.target.closest('button, input, a')) return
                  onSelect(t.id)
                }}
                onKeyDown={(e) => {
                  if (e.target !== e.currentTarget) return
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    onSelect(t.id)
                  }
                }}
              >
                {handle}
                <button className="life-check" onClick={() => onToggle(t.id)} aria-label="Mark done" />
                <div className="life-row-title">
                  {t.title}
                  <div className="meta" style={{ fontSize: 11 }}>added {formatAdded(t.createdAt)}</div>
                </div>
                {subs.length > 0 && (
                  <span className="meta" style={{ fontSize: 12, flexShrink: 0 }} title="Subtasks done">
                    {subs.filter((s) => s.checked).length}/{subs.length}
                  </span>
                )}
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
                <button className="life-icon-btn" title="Delete" aria-label="Delete" onClick={() => onRemove(t.id)}>
                  🗑️
                </button>
              </div>
              </motion.div>
            )}
            </SortableRow>
          )
        })}
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
