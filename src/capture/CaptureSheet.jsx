import { useEffect, useMemo, useRef, useState } from 'react'
import Sheet from '../Sheet.jsx'
import { parseCapture, TYPES } from './parse.js'
import { categoryInfo } from '../money/categories.js'
import { formatRupees } from '../money/format.js'
import { dateKey } from '../life/logic.js'
import './capture.css'

// Capture sheet frame (DESIGN.md section 4): type chips, one text field, parsed chips,
// hint and the primary button named after the type. Editors for the chips and the
// Habit / Solve / Mood panels are separate tasks; this file owns the frame.
// Props: open, onClose, defaultType, onSubmit(draft) (may be async; a throw keeps the sheet).

export const TYPE_LABELS = {
  expense: 'Expense', note: 'Note', reminder: 'Reminder', task: 'Task',
  habit: 'Habit', solve: 'Solve', mood: 'Mood',
}
const PANEL_TYPES = ['habit', 'solve', 'mood']
const PLACEHOLDERS = {
  expense: '450 coffee with raj',
  note: 'Write a note',
  reminder: 'call mom tomorrow 6pm',
  task: 'What needs doing?',
}

export function primaryLabel(type) {
  if (type === 'solve') return 'Log solve'
  if (type === 'mood') return 'Log mood'
  if (type === 'habit') return 'Check in habit'
  return `Add ${type}`
}

function dayLabel(key, now) {
  if (!key) return null
  if (key === dateKey(now)) return 'Today'
  const d = new Date(`${key}T00:00:00`)
  if (Number.isNaN(d.getTime())) return key
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
}

// draft -> [{ key, label, tone }]; tone 'warn' marks a chip the user must fill.
export function draftChips(draft, now = new Date()) {
  const out = []
  if (draft.type === 'expense') {
    if (draft.amount != null) out.push({ key: 'amount', label: formatRupees(draft.amount) })
    if (draft.category) {
      const c = categoryInfo(draft.category)
      out.push({ key: 'category', label: `${c.emoji} ${c.label}` })
    } else if (draft.amount != null) {
      out.push({ key: 'category', label: 'Pick category', tone: 'warn' })
    }
  }
  if (draft.type === 'expense' || draft.type === 'reminder' || draft.type === 'task') {
    const day = dayLabel(draft.date, now)
    if (day) out.push({ key: 'date', label: day })
    if (draft.at) {
      out.push({ key: 'time', label: draft.at.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) })
    }
  }
  if (draft.type === 'reminder' && draft.repeat) {
    out.push({ key: 'repeat', label: draft.repeat === 'never' ? 'Never' : draft.repeat[0].toUpperCase() + draft.repeat.slice(1) })
  }
  if (draft.type === 'expense' && draft.person) out.push({ key: 'person', label: `With ${draft.person}` })
  return out
}

export function canSubmit(draft) {
  if (draft.type === 'expense') return draft.amount != null && Boolean(draft.category)
  if (PANEL_TYPES.includes(draft.type)) return false // panels submit themselves
  return draft.title.trim().length > 0
}

export default function CaptureSheet({ open, onClose, defaultType = 'expense', onSubmit }) {
  const [type, setType] = useState(defaultType)
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const fieldRef = useRef(null)
  const chipsRef = useRef(null)

  // Each opening starts fresh on the default type; focus goes to the field.
  useEffect(() => {
    if (!open) return
    setType(TYPES.includes(defaultType) ? defaultType : 'expense')
    setText('')
    setError('')
    setBusy(false)
  }, [open, defaultType])

  useEffect(() => {
    if (!open) return
    const id = requestAnimationFrame(() => {
      if (fieldRef.current) fieldRef.current.focus()
      else chipsRef.current?.querySelector('[aria-pressed="true"]')?.focus()
    })
    return () => cancelAnimationFrame(id)
  }, [open, type])

  const now = useMemo(() => new Date(), [open, text]) // eslint-disable-line react-hooks/exhaustive-deps
  const draft = useMemo(() => parseCapture(text, now, { type }), [text, now, type])
  const chips = draftChips(draft, now)
  const hasPanel = PANEL_TYPES.includes(type)
  const ready = canSubmit(draft) && !busy

  async function submit(e) {
    e?.preventDefault()
    if (!ready || !onSubmit) return
    setBusy(true)
    setError('')
    try {
      await onSubmit(draft)
      onClose?.()
    } catch (err) {
      setError(err?.message || 'Could not save. Your text is kept.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet open={open} onClose={onClose} className="capture-sheet">
      <form className="capture" onSubmit={submit}>
        <div className="capture-types" role="group" aria-label="Type" ref={chipsRef}>
          {TYPES.map((t) => (
            <button
              key={t}
              type="button"
              className="capture-type"
              aria-pressed={t === type}
              onClick={() => setType(t)}
            >
              {TYPE_LABELS[t]}
            </button>
          ))}
        </div>

        {hasPanel ? (
          <div className="capture-panel" data-type={type}>
            {TYPE_LABELS[type]}
          </div>
        ) : (
          <input
            ref={fieldRef}
            className="capture-field"
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={PLACEHOLDERS[type]}
            aria-label={`${TYPE_LABELS[type]} details`}
            autoComplete="off"
            enterKeyHint="done"
          />
        )}

        {!hasPanel && (
          <div className="capture-parsed" aria-live="polite">
            {chips.map((c) => (
              <span key={c.key} className="capture-chip" data-tone={c.tone || 'default'}>{c.label}</span>
            ))}
          </div>
        )}

        {error && <p className="capture-error" role="alert">{error}</p>}

        <div className="capture-foot">
          <span className="capture-hint">Tap a chip to change it</span>
          <button type="submit" className="capture-primary" disabled={!ready}>
            {primaryLabel(type)}
          </button>
        </div>
      </form>
    </Sheet>
  )
}
