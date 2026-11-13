import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { DndArea, DropList, SortableRow } from '../../dnd/Dnd.jsx'
import { placeItem } from '../../dnd/logic.js'
import { formatAdded } from '../../time.js'
import {
  dateKey,
  streaks,
  multiplier,
  earnings,
  petState,
  crossedMilestone,
  CATEGORY_LABELS,
  DOMAINS,
} from '../logic.js'
import { useLatest } from '../../useLatest.js'
import { deleteWithUndo } from '../../undo.js'
import { newId } from '../../id.js'
import { fireConfetti } from '../confetti.js'
import MasterDetail from '../ui/MasterDetail.jsx'
import HabitInspector from './HabitInspector.jsx'

const SPECIES = ['🐶', '🐱', '🐰', '🦊', '🐼', '🐧', '🐉']

// Dense rows plus the inspector start at the same 1024px container width as the shell's
// inspector pane (life.css `@container app (min-width: 1024px)`); below it the cards stay.
const INSPECTOR_MIN = 1024

function useWide() {
  const [wide, setWide] = useState(false)
  useEffect(() => {
    const el = typeof document === 'undefined' ? null : document.querySelector('.app-root')
    const measure = () => setWide((el ? el.clientWidth : window.innerWidth) >= INSPECTOR_MIN)
    measure()
    if (el && typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(measure)
      ro.observe(el)
      return () => ro.disconnect()
    }
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [])
  return wide
}

export default function HabitsView({ habits, onUpdate, now }) {
  const [showAdd, setShowAdd] = useState(false)
  const [name, setName] = useState('')
  const [category, setCategory] = useState('exercise')
  const [species, setSpecies] = useState(SPECIES[0])
  const [domain, setDomain] = useState('other')
  const [coinFlash, setCoinFlash] = useState({}) // habitId -> amount, for the floating +₹ animation
  const [editingId, setEditingId] = useState(null)
  const [editName, setEditName] = useState('')
  const [editCategory, setEditCategory] = useState('exercise')
  const [editDomain, setEditDomain] = useState('other')
  const [selectedId, setSelectedId] = useState(null)
  const wide = useWide()
  const habitsRef = useLatest(habits)

  function addHabit() {
    const n = name.trim()
    if (!n) return
    const habit = { id: newId(), name: n, category, species, domain, createdAt: Date.now(), checkins: [] }
    onUpdate([...habits, habit])
    setName('')
    setDomain('other')
    setShowAdd(false)
  }

  function removeHabit(id) {
    deleteWithUndo({
      list: habits, id, persist: onUpdate, ref: habitsRef,
      label: (habit) => `Deleted "${habit.name}"`,
    })
  }

  function startEditHabit(h) {
    setEditingId(h.id)
    setEditName(h.name)
    setEditCategory(h.category)
    setEditDomain(h.domain)
  }
  function cancelEditHabit() {
    setEditingId(null)
  }
  function saveEditHabit(id) {
    const n = editName.trim()
    if (!n) return
    onUpdate(habits.map((h) => (h.id === id ? { ...h, name: n, category: editCategory, domain: editDomain } : h)))
    setEditingId(null)
  }

  function patchHabit(id, patch) {
    onUpdate(habits.map((h) => (h.id === id ? { ...h, ...patch } : h)))
  }

  async function checkIn(habit) {
    const key = dateKey(now)
    const already = habit.checkins.includes(key)
    const nextCheckins = already ? habit.checkins.filter((c) => c !== key) : [...habit.checkins, key]
    const nextHabit = { ...habit, checkins: nextCheckins }
    await onUpdate(habits.map((h) => (h.id === habit.id ? nextHabit : h)))

    if (!already) {
      const amount = earnings(nextHabit, now).today
      setCoinFlash((f) => ({ ...f, [habit.id]: amount }))
      setTimeout(() => setCoinFlash((f) => { const n = { ...f }; delete n[habit.id]; return n }), 1000)

      const prevBest = streaks(habit.checkins, now).best
      const newBest = streaks(nextCheckins, now).best
      if (crossedMilestone(prevBest, newBest)) fireConfetti()
    }
  }

  const selectedHabit = wide ? habits.find((h) => h.id === selectedId) || null : null

  const body = wide ? (
    <MasterDetail
      hasSelection={selectedHabit != null}
      onBack={() => setSelectedId(null)}
      list={<div>
      <DndArea onMove={({ id, overId, after }) => onUpdate(placeItem(habits, id, overId, { after }))}>
      <DropList id="habits" type="habit" items={habits.map((h) => h.id)}>
        {habits.map((h) => {
          const pet = petState(h, now)
          const { current } = streaks(h.checkins, now)
          const money = earnings(h, now)
          const checkedToday = h.checkins.includes(dateKey(now))
          const selected = h.id === selectedId
          return (
            <SortableRow key={h.id} id={h.id} type="habit">
            {(handle) => (
              <div
                className={`habit-row${selected ? ' selected' : ''}`}
                data-selected={selected ? 'true' : 'false'}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', marginBottom: 6,
                  background: 'var(--surface)', borderRadius: 10, position: 'relative',
                  border: `1px solid ${selected ? 'var(--accent)' : 'var(--border)'}`,
                }}
              >
                {coinFlash[h.id] != null && <div className="coin-float">+₹{Math.round(coinFlash[h.id])}</div>}
                {handle}
                <button
                  type="button"
                  className="habit-row-open"
                  aria-pressed={selected}
                  aria-label={`Open ${h.name}`}
                  onClick={() => setSelectedId(selected ? null : h.id)}
                  style={{
                    flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left',
                    background: 'none', border: 'none', padding: 0, color: 'inherit', font: 'inherit', cursor: 'pointer',
                  }}
                >
                  <span className={`pet-avatar pet-mood-${pet.mood}`}>{h.species}</span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span className="habit-name" style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {h.name}
                    </span>
                    <span className="habit-meta" style={{ display: 'block' }}>
                      {current > 0 && <span className="habit-streak-flame">🔥</span>} {current}d · {pet.health}% · ₹{Math.round(money.total)}
                    </span>
                  </span>
                </button>
                <button
                  className={`habit-checkin-btn${checkedToday ? ' checked-in' : ''}`}
                  style={{ width: 'auto', marginTop: 0, padding: '6px 12px' }}
                  onClick={() => checkIn(h)}
                  aria-label={checkedToday ? `Undo check-in for ${h.name}` : `Check in ${h.name}`}
                >
                  {checkedToday ? '✓ Done' : 'Check in'}
                </button>
                <button className="life-icon-btn" title="Remove habit" aria-label="Remove habit" onClick={() => removeHabit(h.id)}>
                  🗑️
                </button>
              </div>
            )}
            </SortableRow>
          )
        })}
      </DropList>
      </DndArea>
      </div>}
      inspector={selectedHabit ? (
        <HabitInspector
          habit={selectedHabit}
          now={now}
          flash={coinFlash[selectedHabit.id]}
          onCheckIn={checkIn}
          onChange={patchHabit}
          onRemove={removeHabit}
          onClose={() => setSelectedId(null)}
        />
      ) : (
        <div className="empty-state">
          <div className="empty-icon">🐾</div>
          <div className="empty-text">Select a habit to see its pet.</div>
        </div>
      )}
    />
  ) : (
      <DndArea onMove={({ id, overId, after }) => onUpdate(placeItem(habits, id, overId, { after }))}>
      <DropList id="habits" type="habit" items={habits.map((h) => h.id)}>
      <AnimatePresence initial={false}>
        {habits.map((h) => {
          const pet = petState(h, now)
          const { current, best } = streaks(h.checkins, now)
          const money = earnings(h, now)
          const checkedToday = h.checkins.includes(dateKey(now))
          return (
            <SortableRow key={h.id} id={h.id} type="habit" disabled={editingId === h.id}>
            {(handle) => (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="habit-card"
            >
              {coinFlash[h.id] != null && <div className="coin-float">+₹{Math.round(coinFlash[h.id])}</div>}

              {editingId === h.id ? (
                <div className="habit-head" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
                  <input value={editName} onChange={(e) => setEditName(e.target.value)} autoFocus />
                  <select value={editCategory} onChange={(e) => setEditCategory(e.target.value)}>
                    {Object.keys(CATEGORY_LABELS).map((c) => (
                      <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
                    ))}
                  </select>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {DOMAINS.map((d) => (
                      <button
                        key={d.id}
                        className={`agent-pill${editDomain === d.id ? ' active' : ''}`}
                        onClick={() => setEditDomain(d.id)}
                      >
                        {d.label}
                      </button>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={() => saveEditHabit(h.id)}
                      disabled={!editName.trim()}
                    >
                      Save
                    </button>
                    <button className="btn btn-ghost btn-sm" onClick={cancelEditHabit}>Cancel</button>
                  </div>
                </div>
              ) : (
                <div className="habit-head">
                  {handle}
                  <span className={`pet-avatar pet-mood-${pet.mood}`}>
                    {h.species}
                    {pet.accessory && <span className="pet-accessory">{pet.accessory}</span>}
                  </span>
                  <div style={{ flex: 1 }}>
                    <div className="habit-name">{h.name}</div>
                    <div className="habit-meta">
                      {current > 0 && <span className="habit-streak-flame">🔥</span>} {current}-day streak
                      {best > current ? ` · best ${best}` : ''} ·{' '}
                      {CATEGORY_LABELS[h.category] || CATEGORY_LABELS.custom}
                    </div>
                    <div className="habit-meta">added {formatAdded(h.createdAt)}</div>
                  </div>
                  <button className="life-icon-btn" title="Edit habit" aria-label="Edit habit" onClick={() => startEditHabit(h)}>
                    ✎
                  </button>
                  <button className="life-icon-btn" title="Remove habit" aria-label="Remove habit" onClick={() => removeHabit(h.id)}>
                    🗑️
                  </button>
                </div>
              )}

              <div className="habit-health-bar">
                <div className="habit-health-fill" style={{ width: `${pet.health}%` }} />
              </div>

              <div className="habit-wallet-row">
                <span className="habit-wallet-amount">₹{Math.round(money.total)} earned</span>
                <span className="habit-multiplier-chip">×{multiplier(current)}</span>
              </div>

              <div className="habit-traits">
                {pet.traits.map((t) => (
                  <span key={t.days} className={`habit-trait${t.unlocked ? ' unlocked' : ''}`}>
                    {t.unlocked ? '✓ ' : '🔒 '}{t.label}
                  </span>
                ))}
              </div>

              <button
                className={`habit-checkin-btn${checkedToday ? ' checked-in' : ''}`}
                onClick={() => checkIn(h)}
              >
                {checkedToday ? '✓ Checked in today (tap to undo)' : 'Check in'}
              </button>
            </motion.div>
            )}
            </SortableRow>
          )
        })}
      </AnimatePresence>
      </DropList>
      </DndArea>

  )

  return (
    <div>
      {body}

      {habits.length === 0 && !showAdd && (
        <div className="empty-state">
          <div className="empty-icon">🐾</div>
          <div className="empty-text">No habits yet. Adopt a pet to start one.</div>
        </div>
      )}

      {showAdd ? (
        <div className="card" style={{ marginTop: 12 }}>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Habit name (e.g. Gym)" />
          <select style={{ marginTop: 8 }} value={category} onChange={(e) => setCategory(e.target.value)}>
            {Object.keys(CATEGORY_LABELS).map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            {SPECIES.map((s) => (
              <button
                key={s}
                className={`theme-swatch${species === s ? ' active' : ''}`}
                style={{ fontSize: 18, background: 'var(--surface-raised)' }}
                onClick={() => setSpecies(s)}
              >
                {s}
              </button>
            ))}
          </div>
          <div className="meta" style={{ marginTop: 10, marginBottom: 4 }}>Grows which stat?</div>
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
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button className="btn btn-primary btn-sm" onClick={addHabit} disabled={!name.trim()}>
              Adopt
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => setShowAdd(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button className="btn btn-primary btn-sm" style={{ marginTop: 12, width: '100%' }} onClick={() => setShowAdd(true)}>
          + New habit
        </button>
      )}
    </div>
  )
}
