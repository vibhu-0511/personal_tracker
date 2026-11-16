// TaskInspector: the editor for one selected task (R2-10).
//
//   <TaskInspector task onChange onToggle onDelete onSubtasks onRemoveSubtask onClose />
//
// Rendered by Tasks.jsx in the MasterDetail inspector pane from 1024px, and as the
// detail Sheet below that. Title and due are drafts that commit on blur / Enter / pick,
// keyed by task id, so a sync refresh that re-renders the same task keeps the cursor and
// the open inspector. The subtask list lives here (it used to be the inline expander in
// the old task row) and relies on the screen's DndArea for sorting; Tasks.jsx owns the
// 'sub' drop handling.
import { useState } from 'react'
import { SortableRow, DropList } from '../../dnd/Dnd.jsx'
import { formatAdded } from '../../time.js'
import { newId } from '../../id.js'
import '../wellbeing.css'

// dueAt is epoch ms; the time field shows its local HH:MM and writes it back onto the due date.
function timeValue(dueAt) {
  if (dueAt == null) return ''
  const d = new Date(dueAt)
  if (Number.isNaN(d.getTime())) return ''
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function atOnDay(dayKey, hhmm) {
  const [y, m, d] = dayKey.split('-').map(Number)
  const [h, mi] = hhmm.split(':').map(Number)
  return new Date(y, m - 1, d, h, mi).getTime()
}

export default function TaskInspector({
  task, onChange, onToggle, onDelete, onSubtasks, onRemoveSubtask, onClose,
}) {
  // Re-key on the id so drafts reset when the selection moves to another task.
  return (
    <TaskEditor
      key={task.id}
      task={task}
      onChange={onChange}
      onToggle={onToggle}
      onDelete={onDelete}
      onSubtasks={onSubtasks}
      onRemoveSubtask={onRemoveSubtask}
      onClose={onClose}
    />
  )
}

function TaskEditor({ task, onChange, onToggle, onDelete, onSubtasks, onRemoveSubtask, onClose }) {
  const [title, setTitle] = useState(task.title)
  const [draft, setDraft] = useState('')
  const subtasks = task.subtasks || []

  function commitTitle() {
    const next = title.trim()
    if (!next) {
      setTitle(task.title) // an empty title is not allowed; revert
      return
    }
    if (next !== task.title) onChange(task.id, { title: next })
    if (next !== title) setTitle(next)
  }

  function commitDue(value) {
    const due = value || null
    if (due === (task.due || null)) return
    // Clearing the date also clears the time of day that hung off it.
    if (!due) {
      onChange(task.id, { due: null, dueAt: null })
      return
    }
    // A new day keeps the time of day the task already had.
    const t = timeValue(task.dueAt)
    onChange(task.id, t ? { due, dueAt: atOnDay(due, t) } : { due })
  }

  function commitTime(value) {
    if (!task.due) return
    if (!value) {
      if (task.dueAt != null) onChange(task.id, { dueAt: null })
      return
    }
    const dueAt = atOnDay(task.due, value)
    if (dueAt !== task.dueAt) onChange(task.id, { dueAt })
  }

  function addSub() {
    const text = draft.trim()
    if (!text) return
    onSubtasks(task.id, [...subtasks, { id: newId(), text, checked: false, createdAt: Date.now() }])
    setDraft('')
  }

  const doneCount = subtasks.filter((s) => s.checked).length

  return (
    <div className="task-inspector wb-stack">
      <div className="wb-head">
        <div className="life-section-label wb-label">Task</div>
        {onClose && (
          <button className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Close inspector">
            Close
          </button>
        )}
      </div>

      <label className="wb-field">
        <span className="wb-field-label">Title</span>
        <input
          aria-label="Task title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={commitTitle}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur()
            if (e.key === 'Escape') setTitle(task.title)
          }}
        />
      </label>

      <label className="wb-field">
        <span className="wb-field-label">Due</span>
        <div className="wb-field-row">
          <input
            type="date"
            aria-label="Due date"
            value={task.due || ''}
            onChange={(e) => commitDue(e.target.value)}
          />
          {task.due && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => commitDue('')}>
              Clear
            </button>
          )}
        </div>
      </label>

      <label className="wb-field">
        <span className="wb-field-label">Time of day</span>
        <div className="wb-field-row">
          <input
            type="time"
            aria-label="Due time"
            value={timeValue(task.dueAt)}
            disabled={!task.due}
            onChange={(e) => commitTime(e.target.value)}
          />
          {task.dueAt != null && task.due && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => commitTime('')}>
              Clear time
            </button>
          )}
        </div>
        {!task.due && <span className="wb-small">Pick a due date first.</span>}
      </label>

      <div className="wb-chip-row">
        <button
          type="button"
          className="wb-chip wb-chip-btn"
          aria-pressed={Boolean(task.urgent)}
          onClick={() => onChange(task.id, { urgent: !task.urgent })}
        >
          🔥 Urgent
        </button>
        <button
          type="button"
          className="wb-chip wb-chip-btn"
          aria-pressed={Boolean(task.important)}
          onClick={() => onChange(task.id, { important: !task.important })}
        >
          ⭐ Important
        </button>
      </div>

      <div>
        <div className="life-section-label wb-label">
          Subtasks{subtasks.length > 0 && ` (${doneCount}/${subtasks.length})`}
        </div>
        <DropList id={`sub:${task.id}`} type="sub" items={subtasks.map((s) => s.id)}>
          {subtasks.map((s) => (
            <SortableRow key={s.id} id={s.id} type="sub">
              {(handle) => (
                <div className="exam-topic-row wb-sub-row" data-checked={s.checked ? 'true' : 'false'}>
                  {handle}
                  <input
                    type="checkbox"
                    aria-label={`Done: ${s.text}`}
                    checked={s.checked}
                    onChange={() =>
                      onSubtasks(task.id, subtasks.map((x) => (x.id === s.id ? { ...x, checked: !x.checked } : x)))
                    }
                  />
                  <span className="wb-sub-text">
                    {s.text}
                    <span className="wb-meta">{formatAdded(s.createdAt)}</span>
                  </span>
                  <button
                    className="life-icon-btn wb-icon"
                    title="Delete item"
                    aria-label={`Delete subtask: ${s.text}`}
                    onClick={() => onRemoveSubtask(task.id, s.id)}
                  >
                    🗑️
                  </button>
                </div>
              )}
            </SortableRow>
          ))}
        </DropList>
        <div className="wb-field-row wb-field">
          <input
            aria-label="New subtask"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Add item.."
            onKeyDown={(e) => e.key === 'Enter' && addSub()}
          />
          <button className="btn btn-primary btn-sm" onClick={addSub} disabled={!draft.trim()}>
            Add
          </button>
        </div>
      </div>

      <div className="wb-actions">
        <button className="btn btn-primary btn-sm" onClick={() => onToggle(task.id)}>
          {task.done ? 'Mark not done' : 'Mark done'}
        </button>
        <button className="btn btn-ghost btn-sm" onClick={() => onDelete(task.id)}>
          Delete
        </button>
      </div>
      <div className="wb-small">added {formatAdded(task.createdAt)}</div>
    </div>
  )
}
