import { useEffect, useMemo, useReducer, useRef } from 'react'
import Sheet from '../Sheet.jsx'
import { parseCapture, TYPES } from './parse.js'
import { categoryInfo } from '../money/categories.js'
import { formatRupees } from '../money/format.js'
import { dateKey } from '../life/logic.js'
import { saveLastType } from './captureContext.js'
import { showToast } from '../toast.js'
import { AmountEditor, CategoryPicker, WhenPicker, RepeatPicker, PersonPicker } from './editors/index.js'
import HabitPanel from './panels/HabitPanel.jsx'
import SolvePanel from './panels/SolvePanel.jsx'
import MoodPanel from './panels/MoodPanel.jsx'
import { quickSolve } from './panels/logic.js'
import './capture.css'

// Capture sheet (DESIGN.md section 4): type chips, one text field, tappable parsed chips
// (each opens its editor), Habit / Solve / Mood panels, and the primary button.
// Props: open, onClose, defaultType,
//   onSubmit(draft) -> { ok: true, undo } | { ok: false, error } (see submitDraft); a throw also
//     counts as a failed save. On success the sheet closes and a toast offers Undo; on failure
//     the sheet stays open with the text intact.
//   data (optional): { habits, solvedToday, puzzleDone, mood, recentCategories, people, now }
//     feeding the panels and pickers.
//   returnFocusRef (optional): the plus button; focused after the sheet closes.

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

const EDITOR_FOR = { amount: 'amount', category: 'category', date: 'when', time: 'when', when: 'when', repeat: 'repeat', person: 'person' }
const EDITOR_TITLES = { amount: 'Amount', category: 'Category', when: 'When', repeat: 'Repeat', person: 'Person' }

// Parsed chips plus empty "add" chips so every editor can be reached.
export function editableChips(draft, now = new Date()) {
  const chips = draftChips(draft, now)
  const has = (k) => chips.some((c) => c.key === k)
  const add = (key, label) => chips.push({ key, label, tone: 'add' })
  if (draft.type === 'expense') {
    if (!has('amount')) add('amount', 'Amount')
    if (!has('date') && !has('time')) add('when', 'When')
    if (!has('person')) add('person', '+ Person')
  }
  if (draft.type === 'reminder' || draft.type === 'task') {
    if (!has('date') && !has('time')) add('when', 'When')
  }
  if (draft.type === 'reminder' && !has('repeat')) add('repeat', 'Repeat')
  return chips
}

// Pure state for the open sheet. `overrides` hold values picked in editors; they win over the parser.
export function initialSheetState(type = 'expense', text = '') {
  return { type, text, overrides: {}, editor: null, error: '', busy: false }
}

export function sheetReducer(state, action) {
  switch (action.type) {
    case 'open': return initialSheetState(action.captureType, action.text || '')
    case 'setType': return state.type === action.captureType ? state : { ...state, type: action.captureType, editor: null, error: '' }
    case 'setText': return { ...state, text: action.text, error: '' }
    case 'openEditor': return { ...state, editor: EDITOR_FOR[action.key] || null }
    case 'closeEditor': return { ...state, editor: null }
    case 'override': return { ...state, overrides: { ...state.overrides, ...action.patch }, error: '' }
    case 'busy': return { ...state, busy: true, error: '' }
    case 'failed': return { ...state, busy: false, error: action.error }
    case 'idle': return { ...state, busy: false }
    default: return state
  }
}

// Parsed draft with editor overrides applied.
export function effectiveDraft(text, now, state) {
  return { ...parseCapture(text, now, { type: state.type }), ...state.overrides }
}

export function savedMessage(draft) {
  if (draft.type === 'habit') return 'Habit checked in'
  if (draft.type === 'solve') return draft.puzzle ? 'Puzzle marked done' : 'Solve logged'
  if (draft.type === 'mood') return 'Mood logged'
  return `${TYPE_LABELS[draft.type] || 'Item'} added`
}

// Runs onSubmit and normalises the outcome:
//   { ok: true, message, undo? } -> caller closes the sheet and shows the toast
//   { ok: false, error }         -> caller keeps the sheet open
export async function finishCapture(draft, onSubmit) {
  try {
    const res = await onSubmit(draft)
    if (res && res.ok === false) return { ok: false, error: res.error || 'Could not save. Your text is kept.' }
    const undo = res && typeof res.undo === 'function' ? res.undo : undefined
    return { ok: true, message: savedMessage(draft), undo }
  } catch (err) {
    return { ok: false, error: err?.message || 'Could not save. Your text is kept.' }
  }
}

export default function CaptureSheet({ open, onClose, defaultType = 'expense', onSubmit, data = {}, returnFocusRef }) {
  const startType = TYPES.includes(defaultType) ? defaultType : 'expense'
  const [state, dispatch] = useReducer(sheetReducer, startType, (t) => initialSheetState(t))
  const { type, text, error, busy, editor, overrides } = state
  const fieldRef = useRef(null)
  const chipsRef = useRef(null)
  const busyRef = useRef(false)

  // Each opening starts fresh on the default type.
  useEffect(() => {
    if (open) dispatch({ type: 'open', captureType: startType })
  }, [open, startType])

  useEffect(() => {
    if (!open) return
    const id = requestAnimationFrame(() => {
      if (fieldRef.current) fieldRef.current.focus()
      else chipsRef.current?.querySelector('[aria-pressed="true"]')?.focus()
    })
    return () => cancelAnimationFrame(id)
  }, [open, type])

  const now = useMemo(() => new Date(), [open, text]) // eslint-disable-line react-hooks/exhaustive-deps
  const draft = useMemo(() => effectiveDraft(text, now, state), [text, now, type, overrides]) // eslint-disable-line react-hooks/exhaustive-deps
  const chips = editableChips(draft, now)
  const hasPanel = PANEL_TYPES.includes(type)
  const ready = canSubmit(draft) && !busy

  function close() {
    onClose?.()
    requestAnimationFrame(() => returnFocusRef?.current?.focus?.())
  }

  async function commit(d) {
    if (!onSubmit || busyRef.current) return
    busyRef.current = true
    dispatch({ type: 'busy' })
    const res = await finishCapture(d, onSubmit)
    busyRef.current = false
    if (!res.ok) { dispatch({ type: 'failed', error: res.error }); return }
    dispatch({ type: 'idle' })
    close()
    showToast(res.message, res.undo ? { undo: async () => { await res.undo() } } : undefined)
  }

  function submit(e) {
    e?.preventDefault()
    if (ready) commit(draft)
  }

  function chooseType(t) {
    saveLastType(t)
    dispatch({ type: 'setType', captureType: t })
  }

  const setWhen = (ms) => dispatch({ type: 'override', patch: { at: new Date(ms), date: dateKey(new Date(ms)) } })

  function renderEditor() {
    if (editor === 'amount') {
      return <AmountEditor value={draft.amount} autoFocus onChange={(v) => dispatch({ type: 'override', patch: { amount: v } })} />
    }
    if (editor === 'category') {
      return (
        <CategoryPicker
          value={draft.category}
          recent={data.recentCategories}
          onChange={(c) => { dispatch({ type: 'override', patch: { category: c } }); dispatch({ type: 'closeEditor' }) }}
        />
      )
    }
    if (editor === 'when') {
      return <WhenPicker value={draft.at ? draft.at.getTime() : null} now={now.getTime()} onChange={setWhen} />
    }
    if (editor === 'repeat') {
      return <RepeatPicker value={draft.repeat} at={draft.at ? draft.at.getTime() : undefined} onChange={(r) => dispatch({ type: 'override', patch: { repeat: r } })} />
    }
    if (editor === 'person') {
      return <PersonPicker value={draft.person} people={data.people} onChange={(p) => dispatch({ type: 'override', patch: { person: p } })} />
    }
    return null
  }

  function renderPanel() {
    const stamp = data.now ?? now.getTime()
    if (type === 'habit') {
      return <HabitPanel habits={data.habits} now={stamp} onCheckIn={(id) => commit({ type: 'habit', title: '', habitId: id })} />
    }
    if (type === 'solve') {
      return (
        <SolvePanel
          solvedToday={data.solvedToday}
          puzzleDone={data.puzzleDone}
          onSolved={() => commit({ type: 'solve', title: '', problem: { id: quickSolve(stamp).id } })}
          onPuzzleDone={() => commit({ type: 'solve', title: '', puzzle: true })}
        />
      )
    }
    return <MoodPanel value={data.mood ?? null} onPick={(v) => commit({ type: 'mood', title: '', mood: v })} />
  }

  return (
    <Sheet open={open} onClose={close} className="capture-sheet">
      <form className="capture" onSubmit={submit}>
        <div className="capture-types" role="group" aria-label="Type" ref={chipsRef}>
          {TYPES.map((t) => (
            <button key={t} type="button" className="capture-type" aria-pressed={t === type} onClick={() => chooseType(t)}>
              {TYPE_LABELS[t]}
            </button>
          ))}
        </div>

        {hasPanel ? (
          <div className="capture-panel-host" data-type={type}>{renderPanel()}</div>
        ) : (
          <input
            ref={fieldRef}
            className="capture-field"
            type="text"
            value={text}
            onChange={(e) => dispatch({ type: 'setText', text: e.target.value })}
            placeholder={PLACEHOLDERS[type]}
            aria-label={`${TYPE_LABELS[type]} details`}
            autoComplete="off"
            enterKeyHint="done"
          />
        )}

        {!hasPanel && (
          <div className="capture-parsed" aria-live="polite">
            {chips.map((c) => (
              <button
                key={c.key}
                type="button"
                className="capture-chip"
                data-tone={c.tone || 'default'}
                data-chip={c.key}
                aria-expanded={editor === EDITOR_FOR[c.key]}
                onClick={() => dispatch({ type: 'openEditor', key: c.key })}
              >
                {c.label}
              </button>
            ))}
          </div>
        )}

        {!hasPanel && editor && (
          <div className="capture-editor" role="group" aria-label={`Edit ${EDITOR_TITLES[editor]}`}>
            {renderEditor()}
            <button type="button" className="capture-type" onClick={() => dispatch({ type: 'closeEditor' })}>Done</button>
          </div>
        )}

        {error && <p className="capture-error" role="alert">{error}</p>}

        <div className="capture-foot">
          <span className="capture-hint">{hasPanel ? 'Tap an option to log it' : 'Tap a chip to change it'}</span>
          {!hasPanel && (
            <button type="submit" className="capture-primary" disabled={!ready}>
              {primaryLabel(type)}
            </button>
          )}
        </div>
      </form>
    </Sheet>
  )
}
