// HabitInspector: the pet card for one selected habit (R2-13).
//
//   <HabitInspector habit now flash onCheckIn onChange onRemove onClose />
//
// Rendered by Habits.jsx in the MasterDetail inspector pane from 1024px. Shows the pet, the
// 7-day health bar, traits, earnings and the last-30-days grid, plus check-in, edit and
// remove. Edit drafts are keyed by habit id (like TaskInspector) so a sync refresh of the
// same habit keeps the cursor, and they commit on Save.
import { useState } from 'react'
import { formatAdded } from '../../time.js'
import {
  dateKey, streaks, multiplier, earnings, petState, CATEGORY_LABELS, DOMAINS,
} from '../logic.js'
import { lastNDays, checkedCount } from '../habitView.js'

const DAYS = 30

export default function HabitInspector(props) {
  // Re-key on the id so the edit draft resets when the selection moves to another habit.
  return <HabitCard key={props.habit.id} {...props} />
}

function HabitCard({ habit, now, flash, onCheckIn, onChange, onRemove, onClose }) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(habit.name)
  const [category, setCategory] = useState(habit.category)
  const [domain, setDomain] = useState(habit.domain)

  const pet = petState(habit, now)
  const { current, best } = streaks(habit.checkins, now)
  const money = earnings(habit, now)
  const checkedToday = habit.checkins.includes(dateKey(now))
  const days = lastNDays(habit.checkins, now, DAYS)

  function startEdit() {
    setName(habit.name)
    setCategory(habit.category)
    setDomain(habit.domain)
    setEditing(true)
  }
  function save() {
    const n = name.trim()
    if (!n) return
    onChange(habit.id, { name: n, category, domain })
    setEditing(false)
  }

  return (
    <div className="habit-inspector" style={{ display: 'flex', flexDirection: 'column', gap: 14, position: 'relative' }}>
      {flash != null && <div className="coin-float">+₹{Math.round(flash)}</div>}

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div className="life-section-label" style={{ flex: 1, margin: 0 }}>Habit</div>
        {onClose && (
          <button className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Close inspector">Close</button>
        )}
      </div>

      {editing ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <input value={name} onChange={(e) => setName(e.target.value)} aria-label="Habit name" autoFocus />
          <select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Category">
            {Object.keys(CATEGORY_LABELS).map((c) => (
              <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
            ))}
          </select>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {DOMAINS.map((d) => (
              <button
                key={d.id}
                className={`agent-pill${domain === d.id ? ' active' : ''}`}
                onClick={() => setDomain(d.id)}
              >
                {d.label}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary btn-sm" onClick={save} disabled={!name.trim()}>Save</button>
            <button className="btn btn-ghost btn-sm" onClick={() => setEditing(false)}>Cancel</button>
          </div>
        </div>
      ) : (
        <div className="habit-head">
          <span className={`pet-avatar pet-mood-${pet.mood}`} style={{ fontSize: 40 }}>
            {habit.species}
            {pet.accessory && <span className="pet-accessory">{pet.accessory}</span>}
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="habit-name">{habit.name}</div>
            <div className="habit-meta">
              {current > 0 && <span className="habit-streak-flame">🔥</span>} {current}-day streak
              {best > current ? ` · best ${best}` : ''} · {CATEGORY_LABELS[habit.category] || CATEGORY_LABELS.custom}
            </div>
            <div className="habit-meta">
              {pet.stage} · mood {pet.mood} · added {formatAdded(habit.createdAt)}
            </div>
          </div>
        </div>
      )}

      <div>
        <div className="habit-meta" style={{ marginTop: 0 }}>Health (last 7 days) · {pet.health}%</div>
        <div className="habit-health-bar" style={{ marginTop: 4 }}>
          <div className="habit-health-fill" style={{ width: `${pet.health}%` }} />
        </div>
      </div>

      <div className="habit-wallet-row" style={{ marginTop: 0 }}>
        <span className="habit-wallet-amount">₹{Math.round(money.total)} earned</span>
        <span className="habit-multiplier-chip">×{multiplier(current)}</span>
      </div>
      <div className="habit-meta" style={{ marginTop: -8 }}>
        ₹{Math.round(money.today)} today
        {money.nextMultiplierIn != null ? ` · next multiplier in ${money.nextMultiplierIn} day${money.nextMultiplierIn === 1 ? '' : 's'}` : ''}
      </div>

      <div className="habit-traits" style={{ marginTop: 0 }}>
        {pet.traits.map((t) => (
          <span key={t.days} className={`habit-trait${t.unlocked ? ' unlocked' : ''}`}>
            {t.unlocked ? '✓ ' : '🔒 '}{t.label}
          </span>
        ))}
      </div>

      <div>
        <div className="habit-meta" style={{ marginTop: 0, marginBottom: 6 }}>
          Last {DAYS} days · {checkedCount(days)} checked in
        </div>
        <div
          className="habit-grid"
          role="img"
          aria-label={`${checkedCount(days)} of the last ${DAYS} days checked in`}
          style={{ display: 'grid', gridTemplateColumns: 'repeat(10, minmax(0, 1fr))', gap: 4 }}
        >
          {days.map((d) => (
            <span
              key={d.date}
              title={`${d.date}${d.checked ? ' ✓' : ''}`}
              data-date={d.date}
              data-checked={d.checked ? 'true' : 'false'}
              style={{
                aspectRatio: '1',
                borderRadius: 4,
                background: d.checked ? 'var(--success)' : 'var(--border)',
                outline: d.date === dateKey(now) ? '2px solid var(--accent)' : 'none',
                outlineOffset: 1,
              }}
            />
          ))}
        </div>
      </div>

      <button
        className={`habit-checkin-btn${checkedToday ? ' checked-in' : ''}`}
        onClick={() => onCheckIn(habit)}
      >
        {checkedToday ? '✓ Checked in today (tap to undo)' : 'Check in'}
      </button>

      {!editing && (
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-ghost btn-sm" onClick={startEdit}>✎ Edit</button>
          <button className="btn btn-ghost btn-sm" onClick={() => onRemove(habit.id)}>🗑️ Remove</button>
        </div>
      )}
    </div>
  )
}
