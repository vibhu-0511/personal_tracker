import EmptyState from '../../ui/EmptyState.jsx'
import { uncheckedHabits } from './logic.js'
import './panels.css'

// Habits not yet checked in today, one tap each.
// onCheckIn(habitId) does the write; the parent re-renders with fresh `habits`, so the row leaves the list.
export default function HabitPanel({ habits = [], now = Date.now(), onCheckIn }) {
  const open = uncheckedHabits(habits, now)
  if (habits.length === 0) {
    return <EmptyState className="cap-panel-empty" text="No habits yet. Add one in Life, then check in here." />
  }
  if (open.length === 0) {
    return <EmptyState className="cap-panel-empty" icon="✓" text="All habits are checked in today." />
  }
  return (
    <ul className="cap-panel cap-habits" aria-label="Habits to check in today">
      {open.map((h) => (
        <li key={h.id}>
          <button type="button" className="cap-btn cap-habit" onClick={() => onCheckIn && onCheckIn(h.id)}
            aria-label={`Check in ${h.name}`}>
            <span className="cap-habit-emoji" aria-hidden="true">{h.species}</span>
            <span className="cap-habit-name">{h.name}</span>
            <span className="cap-habit-cta" aria-hidden="true">Check in</span>
          </button>
        </li>
      ))}
    </ul>
  )
}
