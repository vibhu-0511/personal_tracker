// ReminderInspector: the editor for one selected reminder (R2-11).
//
//   <ReminderInspector reminder onChange onToggle onDelete icsHref onClose />
//
// Rendered by Reminders.jsx in the MasterDetail inspector pane from 1024px, and as the
// detail Sheet below that. Title and time are drafts that commit on blur / Enter / Save,
// keyed by reminder id, so a sync refresh that re-renders the same reminder keeps the
// cursor and the open inspector. `onChange(id, { title?, at? })` is responsible for
// re-sorting the list by `at`. Time, repeat and snooze go through the LifeData actions
// (onReschedule(id, at), onRepeat(id, repeat), onSnooze(id, preset)), which own undo.
import { useState } from 'react'
import Icon from '../../ui/Icon.jsx'
import { normalizeRepeat, REPEAT_TYPES, SNOOZE_PRESETS } from '../reminderLogic.js'

const REPEAT_LABEL = { none: 'Never', daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly' }
const SNOOZE_LABEL = { '1h': 'In 1 hour', tonight: 'Tonight', tomorrow: 'Tomorrow' }

const WEEKDAYS = [
  { d: 0, short: 'S', name: 'Sunday' },
  { d: 1, short: 'M', name: 'Monday' },
  { d: 2, short: 'T', name: 'Tuesday' },
  { d: 3, short: 'W', name: 'Wednesday' },
  { d: 4, short: 'T', name: 'Thursday' },
  { d: 5, short: 'F', name: 'Friday' },
  { d: 6, short: 'S', name: 'Saturday' },
]

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

export default function ReminderInspector({ reminder, onChange, onReschedule, onRepeat, onSnooze, onToggle, onDelete, icsHref, onClose }) {
  // Re-key on the id so drafts reset when the selection moves to another reminder.
  return (
    <ReminderEditor
      key={reminder.id}
      reminder={reminder}
      onChange={onChange}
      onReschedule={onReschedule}
      onRepeat={onRepeat}
      onSnooze={onSnooze}
      onToggle={onToggle}
      onDelete={onDelete}
      icsHref={icsHref}
      onClose={onClose}
    />
  )
}

function ReminderEditor({ reminder, onChange, onReschedule, onRepeat, onSnooze, onToggle, onDelete, icsHref, onClose }) {
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
    if (Object.keys(patch).length) onChange(reminder.id, patch)
    if (nextAt != null && when !== savedWhen) onReschedule(reminder.id, nextAt)
    if (!nextTitle) setTitle(reminder.title)
    else if (nextTitle !== title) setTitle(nextTitle)
    if (nextAt == null) setWhen(savedWhen)
  }

  const repeat = normalizeRepeat(reminder.repeat)
  const repeatType = repeat.type
  // Chosen weekdays; with none saved, the weekday of the reminder time (what the logic assumes).
  const fallbackDay = new Date(reminder.at).getDay()
  const weekdays = repeat.days?.length ? repeat.days : [fallbackDay]

  function pickRepeat(type) {
    onRepeat(reminder.id, type === 'weekly' ? { type: 'weekly', days: [fallbackDay] } : { type })
  }

  // At least one weekday always stays selected.
  function toggleDay(d) {
    const on = weekdays.includes(d)
    if (on && weekdays.length === 1) return
    const days = (on ? weekdays.filter((x) => x !== d) : [...weekdays, d]).sort((a, b) => a - b)
    onRepeat(reminder.id, { type: 'weekly', days })
  }

  return (
    <div className="reminder-inspector rem-inspector">
      <div className="rem-insp-head">
        <div className="life-section-label rem-insp-label">Reminder</div>
        {onClose && (
          <button className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Close inspector">
            Close
          </button>
        )}
      </div>

      <label className="rem-field">
        <span className="rem-field-label">Title</span>
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

      <label className="rem-field">
        <span className="rem-field-label">When</span>
        <input
          className="rem-mono"
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

      <label className="rem-field">
        <span className="rem-field-label">Repeat</span>
        <select
          aria-label="Repeat"
          value={repeatType}
          onChange={(e) => pickRepeat(e.target.value)}
        >
          {REPEAT_TYPES.map((t) => (
            <option key={t} value={t}>{REPEAT_LABEL[t]}</option>
          ))}
        </select>
      </label>

      {repeatType === 'weekly' && (
        <div className="rem-field" role="group" aria-label="Repeat on weekdays">
          <span className="rem-field-label">Repeat on</span>
          <div className="rem-snooze">
            {WEEKDAYS.map(({ d, short, name }) => {
              const on = weekdays.includes(d)
              return (
                <button
                  key={d}
                  type="button"
                  className="rem-chip"
                  data-day={d}
                  aria-pressed={on}
                  aria-label={name}
                  style={{
                    minWidth: 44,
                    background: on ? 'var(--accent-dim)' : undefined,
                    borderColor: on ? 'var(--accent)' : undefined,
                  }}
                  onClick={() => toggleDay(d)}
                >
                  {short}
                </button>
              )
            })}
          </div>
        </div>
      )}

      <div className="rem-field" role="group" aria-label="Snooze">
        <span className="rem-field-label">Snooze</span>
        <div className="rem-snooze">
          {SNOOZE_PRESETS.map((p) => (
            <button key={p} className="rem-chip" data-snooze={p} onClick={() => onSnooze(reminder.id, p)}>
              {SNOOZE_LABEL[p]}
            </button>
          ))}
        </div>
      </div>

      <div className="rem-actions">
        <button className="btn btn-primary btn-sm" onClick={commit} disabled={!dirty}>
          Save
        </button>
        <button className="btn btn-ghost btn-sm" onClick={() => onToggle(reminder.id)}>
          {reminder.done ? 'Mark not done' : 'Mark done'}
        </button>
        {icsHref && (
          <a className="btn btn-ghost btn-sm" href={icsHref(reminder)} aria-label="Add to Calendar">
            <Icon name="calendar" size={16} /> Add to Calendar
          </a>
        )}
        <button className="btn btn-ghost btn-sm rem-delete" onClick={() => onDelete(reminder.id)}>
          Delete
        </button>
      </div>
    </div>
  )
}
