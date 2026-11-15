import DailyCell from '../ui/DailyCell.jsx'
import './dailies.css'

const SKELETON_COUNT = 5

// Opens capture on Mood through a cancelable window event the app's capture host claims with
// preventDefault(). Returns true when claimed; otherwise the cell just follows its link.
export const OPEN_CAPTURE_EVENT = 'forge:open-capture'
function requestMoodCapture() {
  try {
    return window.dispatchEvent(new CustomEvent(OPEN_CAPTURE_EVENT, { cancelable: true, detail: { type: 'mood' } })) === false
  } catch { return false }
}

// The five Today dailies in one row. Each cell links to its screen.
// Props: `items` from computeDailies(...).items; `loading` shows five skeleton cells (no spinner);
// `onOpenMood` (optional) overrides how the Mood cell opens capture; by default it asks the
// app's capture host (event above) and falls back to its link when no host is mounted.
export default function DailiesStrip({ items = [], loading = false, onOpenMood, className = '' }) {
  const cls = `dailies-strip ${className}`.trim()
  if (loading) {
    return (
      <div className={cls} aria-busy="true" aria-label="Loading dailies">
        {Array.from({ length: SKELETON_COUNT }, (_, i) => (
          <div key={i} className="dailies-skel" data-skeleton="true" aria-hidden="true">
            <span className="dailies-skel-bar dailies-skel-label" />
            <span className="dailies-skel-bar dailies-skel-value" />
          </div>
        ))}
      </div>
    )
  }
  return (
    <nav className={cls} aria-label="Dailies">
      {items.map((d) => {
        const onClick = d.id !== 'mood' ? undefined : (e) => {
          if (typeof onOpenMood === 'function') { e.preventDefault(); onOpenMood(); return }
          if (requestMoodCapture()) e.preventDefault()
        }
        return (
          <DailyCell
            key={d.id}
            className="dailies-cell"
            label={d.label}
            value={d.value}
            done={d.done}
            href={d.href}
            onClick={onClick}
            data-daily={d.id}
          />
        )
      })}
    </nav>
  )
}
