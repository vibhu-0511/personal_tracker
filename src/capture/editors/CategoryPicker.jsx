import { sortCategories } from './logic.js'
import './editors.css'

// Grid of all 12 categories, most recently used first. `recent` = ids, newest first.
export default function CategoryPicker({ value, recent = [], onChange }) {
  return (
    <div className="cap-ed" role="group" aria-label="Category">
      <div className="cap-ed-grid">
        {sortCategories(recent).map((c) => (
          <button
            key={c.id}
            type="button"
            className="cap-ed-opt cap-ed-cat"
            data-cat={c.id}
            aria-pressed={value === c.id}
            onClick={() => onChange?.(c.id)}
          >
            <span className="cap-ed-emoji" aria-hidden="true">{c.emoji}</span>
            <span>{c.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
