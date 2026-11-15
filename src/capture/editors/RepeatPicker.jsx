import { normalizeRepeat, REPEAT_TYPES } from '../../life/reminderLogic.js'
import './editors.css'

const LABELS = { none: 'Never', daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly' }
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

// Repeat editor. value = repeat rule (object or string); onChange(normalised rule).
// `at` (epoch ms, optional) anchors weekly and monthly defaults.
export default function RepeatPicker({ value, onChange, at }) {
  const r = normalizeRepeat(value)
  const anchor = at != null ? new Date(at) : null
  const pick = (type) => {
    if (type === 'weekly') return onChange?.(normalizeRepeat({ type, days: anchor ? [anchor.getDay()] : [] }))
    if (type === 'monthly') return onChange?.(normalizeRepeat({ type, day: anchor?.getDate() }))
    onChange?.({ type })
  }
  const toggle = (d) => {
    const days = new Set(r.days || [])
    if (days.has(d)) days.delete(d); else days.add(d)
    onChange?.(normalizeRepeat({ type: 'weekly', days: [...days] }))
  }
  return (
    <div className="cap-ed" role="group" aria-label="Repeat">
      <div className="cap-ed-row">
        {REPEAT_TYPES.map((t) => (
          <button key={t} type="button" className="cap-ed-opt" aria-pressed={r.type === t} onClick={() => pick(t)}>
            {LABELS[t]}
          </button>
        ))}
      </div>
      {r.type === 'weekly' && (
        <div className="cap-ed-row" role="group" aria-label="Days of the week">
          {DAYS.map((name, d) => (
            <button key={name} type="button" className="cap-ed-opt cap-ed-day" aria-pressed={(r.days || []).includes(d)} onClick={() => toggle(d)}>
              {name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
