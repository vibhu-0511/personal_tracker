// ReminderInspector: the editor for one selected reminder (R2-11).
//
//   <ReminderInspector reminder onChange onToggle onDelete icsHref onClose />
//
// Rendered by Reminders.jsx in the MasterDetail inspector pane from 1024px, and as the
// detail Sheet below that. Title and time are drafts that commit on blur / Enter / Save,
// keyed by reminder id, so a sync refresh that re-renders the same reminder keeps the
// cursor and the open inspector. `onChange(id, { title?, at? })` is responsible for
// re-sorting the list by `at`.
import { useState } from 'react'

const field = { display: 'flex', flexDirection: 'column', gap: 4 }
const fieldLabel = { fontSize: 12, opacity: 0.7 }
const pad = (n) => String(n).padStart(2, '0')

// ms -> value for <input type="datetime-local"> in the viewer's local time zone.
export function toLocalInput(ms) {
  const d = new Date(ms)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// datetime-local value -> ms, or null when it is empty or not a valid date.
export function fromLocalInput(value) {
  if (!value) return null
  const ms = new Date(value).getTime()
  return Number.isNaN(ms) ? null : ms
}

export default function ReminderInspector({ reminder, onChange, onToggle, onDelete, icsHref, onClose }) {
  // Re-key on the id so drafts reset when the selection moves to another reminder.
  return (
    <ReminderEditor
      key={reminder.id}
      reminder={reminder}
      onChange={onChange}
      onToggle={onToggle}
      onDelete={onDelete}
      icsHref={icsHref}
      onClose={onClose}
    />
  )
}

function ReminderEditor({ reminder, onChange, onToggle, onDelete, icsHref, onClose }) {
  const [title, setTitle] = useState(reminder.title)
  const [when, setWhen] = useState(toLocalInput(reminder.at))

  const savedWhen = toLocalInput(reminder.at)
  const nextTitle = title.trim()
  const nextAt = fromLocalInput(when)
  const dirty = (nextTitle && nextTitle !== reminder.title) || (nextAt != null && when !== savedWhen)

  // Commits whichever drafts are valid and changed; an invalid draft reverts.
  function commit() {
    const patch = {}
    if (nextTitle && nextTitle !== reminder.title) patch.title = nextTitle
    if (nextAt != null && when !== savedWhen) patch.at = nextAt
    if (Object.keys(patch).length) onChange(reminder.id, patch)
    if (!nextTitle) setTitle(reminder.title)
    else if (nextTitle !== title) setTitle(nextTitle)
    if (nextAt == null) setWhen(savedWhen)
  }

  return (
    <div className="reminder-inspector" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div className="life-section-label" style={{ flex: 1, margin: 0 }}>Reminder</div>
        {onClose && (
          <button className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Close inspector">
            Close
          </button>
        )}
      </div>

      <label style={field}>
        <span style={fieldLabel}>Title</span>
        <input
          aria-label="Reminder title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur()
            if (e.key === 'Escape') setTitle(reminder.title)
          }}
        />
      </label>

      <label style={field}>
        <span style={fieldLabel}>When</span>
        <input
          type="datetime-local"
          aria-label="Reminder time"
          value={when}
          onChange={(e) => setWhen(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur()
          }}
        />
      </label>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button className="btn btn-primary btn-sm" onClick={commit} disabled={!dirty}>
          Save
        </button>
        <button className="btn btn-ghost btn-sm" onClick={() => onToggle(reminder.id)}>
          {reminder.done ? 'Mark not done' : 'Mark done'}
        </button>
        {icsHref && (
          <a className="btn btn-ghost btn-sm" href={icsHref(reminder)} aria-label="Add to Calendar">
            📅 Add to Calendar
          </a>
        )}
        <button className="btn btn-ghost btn-sm" onClick={() => onDelete(reminder.id)}>
          Delete
        </button>
      </div>
    </div>
  )
}
