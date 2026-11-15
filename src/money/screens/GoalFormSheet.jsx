import { useState } from 'react'
import Sheet from '../../Sheet.jsx'
import { newId } from '../../id.js'
import { useMoney } from '../MoneyContext.jsx'
import { GOAL_ICONS, MAX_AMOUNT } from '../categories.js'

// Create a savings goal. Ports Expenses.jsx addGoal and the "New Goal" sheet.
// New goals append to the end of the array: array position is the only order data.

function GoalForm({ onClose }) {
  const { goals, persistGoals, saving, runSaving } = useMoney()
  const [icon, setIcon] = useState('🎯')
  const [name, setName] = useState('')
  const [targetText, setTargetText] = useState('')

  const target = parseFloat(targetText)
  const trimmed = name.trim()
  const valid = Boolean(trimmed) && Boolean(target) && target > 0 && target <= MAX_AMOUNT

  async function handleCreate() {
    if (saving || !valid) return
    const saved = await runSaving(() =>
      persistGoals([...goals, { id: newId(), name: trimmed, target, saved: 0, icon, createdAt: Date.now() }])
    )
    if (saved) onClose()
  }

  return (
    <>
      <div className="h3" style={{ marginBottom: 10 }}>New Goal</div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
        {GOAL_ICONS.map((i) => (
          <button
            key={i}
            className={`expense-cat-btn${icon === i ? ' active' : ''}`}
            style={{ padding: 6, width: 40, height: 40 }}
            onClick={() => setIcon(i)}
          >
            <span style={{ fontSize: 18 }}>{i}</span>
          </button>
        ))}
      </div>
      <input
        placeholder="Goal name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        style={{ marginBottom: 8 }}
      />
      <input
        type="number"
        inputMode="decimal"
        placeholder="Target amount (₹)"
        value={targetText}
        onChange={(e) => setTargetText(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
        max={MAX_AMOUNT}
      />
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <button
          className="btn btn-primary btn-sm"
          style={{ flex: 1 }}
          onClick={handleCreate}
          disabled={!valid || saving}
        >
          Create
        </button>
        <button className="btn btn-ghost btn-sm" onClick={onClose}>
          Cancel
        </button>
      </div>
    </>
  )
}

export default function GoalFormSheet({ open, onClose }) {
  return (
    <Sheet open={open} onClose={onClose}>
      {/* Mounted only while open so every opening starts from a blank form. */}
      {open && <GoalForm onClose={onClose} />}
    </Sheet>
  )
}
