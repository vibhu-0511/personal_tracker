import { MOODS } from './logic.js'
import './panels.css'

// The five moods. `value` is today's logged valence (0..100) or null; onPick(value) logs it.
export default function MoodPanel({ value = null, onPick }) {
  return (
    <div className="cap-panel cap-moods" role="radiogroup" aria-label="Mood today">
      {MOODS.map((m) => {
        const on = value === m.value
        return (
          <button key={m.value} type="button" role="radio" aria-checked={on} aria-label={m.label}
            data-selected={on ? 'true' : 'false'} className="cap-btn cap-mood" onClick={() => onPick && onPick(m.value)}>
            <span className="cap-mood-emoji" aria-hidden="true">{m.emoji}</span>
            <span className="cap-mood-label">{m.label}</span>
          </button>
        )
      })}
    </div>
  )
}
