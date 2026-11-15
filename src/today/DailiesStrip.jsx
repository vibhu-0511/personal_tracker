import DailyCell from '../ui/DailyCell.jsx'
import './dailies.css'

const SKELETON_COUNT = 5

// The five Today dailies in one row. Each cell links to its screen.
// Props: `items` from computeDailies(...).items; `loading` shows five skeleton cells (no spinner);
// `onOpenMood` (optional) lets the Mood cell open capture instead of just navigating.
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
        const opensCapture = d.id === 'mood' && typeof onOpenMood === 'function'
        const onClick = opensCapture ? (e) => { e.preventDefault(); onOpenMood() } : undefined
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
