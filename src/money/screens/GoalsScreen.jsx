import { useState } from 'react'
import { useMoney } from '../MoneyContext.jsx'
import { MAX_AMOUNT } from '../categories.js'
import { formatRupees } from '../format.js'
import { formatAdded } from '../../time.js'
import { deleteWithUndo } from '../../undo.js'
import { placeItem } from '../../dnd/logic.js'
import { DndArea, DropList, SortableRow } from '../../dnd/Dnd.jsx'
import GoalFormSheet from './GoalFormSheet.jsx'

// Savings goals: create, add funds, delete with undo, drag to reorder.
// Ports Expenses.jsx goals view. Array order is the only ordering data, so
// reorders go through placeItem and persist the whole array.

export default function GoalsScreen() {
  const { goals, goalsRef, persistGoals, saving, runSaving } = useMoney()
  const [showForm, setShowForm] = useState(false)
  const [fundGoalId, setFundGoalId] = useState(null)
  const [fundAmount, setFundAmount] = useState('')

  const fundVal = parseFloat(fundAmount)
  const fundValid = Boolean(fundVal) && fundVal > 0 && fundVal <= MAX_AMOUNT

  function closeFunding() {
    setFundGoalId(null)
    setFundAmount('')
  }

  async function addFunds() {
    if (saving || !fundValid || !fundGoalId) return
    const id = fundGoalId
    const saved = await runSaving(() =>
      persistGoals(goalsRef.current.map((g) => (g.id === id ? { ...g, saved: Math.max(0, g.saved + fundVal) } : g)))
    )
    if (saved) closeFunding()
  }

  function deleteGoal(id) {
    if (fundGoalId === id) closeFunding()
    deleteWithUndo({
      list: goals, id, persist: persistGoals, ref: goalsRef,
      label: (goal) => `Deleted "${goal.name}"`,
    })
  }

  return (
    <>
      <div className="section-header">
        <span className="section-title">Savings Goals</span>
        <button className="btn btn-sm btn-primary" onClick={() => setShowForm(true)}>
          + Goal
        </button>
      </div>

      <GoalFormSheet open={showForm} onClose={() => setShowForm(false)} />

      {goals.length === 0 && !showForm && (
        <div className="empty-state">
          <div className="empty-icon">🎯</div>
          <div className="empty-text">No goals yet. Set a savings target to start tracking.</div>
        </div>
      )}

      <DndArea onMove={({ id, overId, after }) => persistGoals(placeItem(goalsRef.current, id, overId, { after }))}>
        <DropList id="goals" type="goal" items={goals.map((g) => g.id)}>
          {goals.map((g) => {
            const pct = g.target > 0 ? Math.round((g.saved / g.target) * 100) : 0
            const done = pct >= 100
            const isFunding = fundGoalId === g.id
            return (
              <SortableRow key={g.id} id={g.id} type="goal">
                {(handle) => (
                  <div className="card" style={{ marginBottom: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                      {handle}
                      <span style={{ fontSize: 28 }}>{g.icon}</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, fontSize: 15 }}>{g.name}</div>
                        <div className="meta" style={{ fontSize: 13 }}>
                          {formatRupees(g.saved)} / {formatRupees(g.target)}
                        </div>
                        {g.createdAt && (
                          <div className="meta" style={{ fontSize: 11 }}>added {formatAdded(g.createdAt)}</div>
                        )}
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontWeight: 700, fontSize: 18, color: done ? 'var(--success)' : 'var(--accent)' }}>
                          {pct}%
                        </div>
                        <div className="meta" style={{ fontSize: 11 }}>
                          {done ? 'Done!' : `${formatRupees(g.target - g.saved)} left`}
                        </div>
                      </div>
                    </div>
                    <div className="exam-progress-bar" style={{ height: 8, marginBottom: 10 }}>
                      <div
                        className="exam-progress-fill"
                        style={{
                          width: `${Math.max(0, Math.min(100, pct))}%`,
                          background: done ? 'var(--success)' : 'var(--accent)',
                        }}
                      />
                    </div>
                    {isFunding ? (
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <input
                          type="number"
                          inputMode="decimal"
                          placeholder="Amount (₹)"
                          value={fundAmount}
                          onChange={(e) => setFundAmount(e.target.value)}
                          style={{ flex: 1, fontSize: 13, padding: '6px 10px' }}
                          autoFocus
                          max={MAX_AMOUNT}
                          onKeyDown={(e) => e.key === 'Enter' && addFunds()}
                        />
                        <button className="btn btn-success btn-sm" onClick={addFunds} disabled={!fundValid || saving}>
                          + Add
                        </button>
                        <button className="btn btn-ghost btn-sm" onClick={closeFunding} aria-label="Cancel">
                          ×
                        </button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          className="btn btn-sm"
                          style={{ flex: 1 }}
                          onClick={() => {
                            setFundGoalId(g.id)
                            setFundAmount('')
                          }}
                        >
                          + Add Funds
                        </button>
                        <button
                          className="btn btn-danger-ghost btn-sm"
                          onClick={() => deleteGoal(g.id)}
                          aria-label={`Delete ${g.name}`}
                        >
                          ×
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </SortableRow>
            )
          })}
        </DropList>
      </DndArea>
    </>
  )
}
