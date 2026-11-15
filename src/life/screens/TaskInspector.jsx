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

const field = { display: 'flex', flexDirection: 'column', gap: 4 }
const fieldLabel = { fontSize: 12, opacity: 0.7 }

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
    onChange(task.id, due ? { due } : { due: null, dueAt: null })
  }

  function addSub() {
    const text = draft.trim()
    if (!text) return
    onSubtasks(task.id, [...subtasks, { id: newId(), text, checked: false, createdAt: Date.now() }])
    setDraft('')
  }

  const doneCount = subtasks.filter((s) => s.checked).length

  return (
    <div className="task-inspector" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div className="life-section-label" style={{ flex: 1, margin: 0 }}>Task</div>
        {onClose && (
          <button className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Close inspector">
            Close
          </button>
        )}
      </div>

      <label style={field}>
        <span style={fieldLabel}>Title</span>
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

      <label style={field}>
        <span style={fieldLabel}>Due</span>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            type="date"
            aria-label="Due date"
            value={task.due || ''}
            onChange={(e) => commitDue(e.target.value)}
            style={{ flex: 1 }}
          />
          {task.due && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => commitDue('')}>
              Clear
            </button>
          )}
        </div>
      </label>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button
          type="button"
          className={`chip${task.urgent ? '' : ' chip-muted'}`}
          style={{ cursor: 'pointer', border: 'none' }}
          aria-pressed={Boolean(task.urgent)}
          onClick={() => onChange(task.id, { urgent: !task.urgent })}
        >
          🔥 Urgent
        </button>
        <button
          type="button"
          className={`chip${task.important ? '' : ' chip-muted'}`}
          style={{ cursor: 'pointer', border: 'none' }}
          aria-pressed={Boolean(task.important)}
          onClick={() => onChange(task.id, { important: !task.important })}
        >
          ⭐ Important
        </button>
      </div>

      <div>
        <div className="life-section-label">
          Subtasks{subtasks.length > 0 && ` (${doneCount}/${subtasks.length})`}
        </div>
        <DropList id={`sub:${task.id}`} type="sub" items={subtasks.map((s) => s.id)}>
          {subtasks.map((s) => (
            <SortableRow key={s.id} id={s.id} type="sub">
              {(handle) => (
                <div className="exam-topic-row">
                  {handle}
                  <input
                    type="checkbox"
                    aria-label={`Done: ${s.text}`}
                    checked={s.checked}
                    onChange={() =>
                      onSubtasks(task.id, subtasks.map((x) => (x.id === s.id ? { ...x, checked: !x.checked } : x)))
                    }
                  />
                  <span style={{ flex: 1, textDecoration: s.checked ? 'line-through' : 'none', opacity: s.checked ? 0.5 : 1 }}>
                    {s.text}
                    <span className="meta" style={{ fontSize: 11, marginLeft: 6 }}>{formatAdded(s.createdAt)}</span>
                  </span>
                  <button
                    className="life-icon-btn"
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
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <input
            aria-label="New subtask"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Add item..."
            style={{ flex: 1 }}
            onKeyDown={(e) => e.key === 'Enter' && addSub()}
          />
          <button className="btn btn-primary btn-sm" onClick={addSub} disabled={!draft.trim()}>
            Add
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button className="btn btn-primary btn-sm" onClick={() => onToggle(task.id)}>
          {task.done ? 'Mark not done' : 'Mark done'}
        </button>
        <button className="btn btn-ghost btn-sm" onClick={() => onDelete(task.id)}>
          Delete
        </button>
      </div>
      <div className="meta" style={{ fontSize: 11 }}>added {formatAdded(task.createdAt)}</div>
    </div>
  )
}
