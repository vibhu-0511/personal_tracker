import { useEffect, useState } from 'react'
import { useMoney } from '../MoneyContext.jsx'
import { MAX_AMOUNT } from '../categories.js'
import { formatRupees } from '../format.js'
import { formatAdded } from '../../time.js'
import { deleteWithUndo } from '../../undo.js'
import { placeItem } from '../../dnd/logic.js'
import { DndArea, DropList, SortableRow } from '../../dnd/Dnd.jsx'
import { useInspector } from '../../shell/inspectorContext.js'
import GoalFormSheet from './GoalFormSheet.jsx'

// Savings goals: create, drag to reorder, and a detail (add funds, delete with undo) that opens
// through useInspector(): the right-hand pane from 1024px, the Sheet below. Ports Expenses.jsx
// goals view. Array order is the only ordering data, so reorders go through placeItem and
// persist the whole array.

function goalPct(g) {
  return g.target > 0 ? Math.round((g.saved / g.target) * 100) : 0
}

function ProgressBar({ pct, done }) {
  return (
    <div className="exam-progress-bar" style={{ height: 8 }}>
      <div
        className="exam-progress-fill"
        style={{
          width: `${Math.max(0, Math.min(100, pct))}%`,
          background: done ? 'var(--success)' : 'var(--accent)',
        }}
      />
    </div>
  )
}

// Inspector body for one goal. Reads the live record by id and closes itself when it is deleted.
export function GoalDetail({ id }) {
  const { goals, goalsRef, persistGoals, saving, runSaving } = useMoney()
  const { close } = useInspector()
  const [fundAmount, setFundAmount] = useState('')
  const g = goals.find((x) => x.id === id)

  useEffect(() => {
    if (!g) close()
  }, [g, close])

  if (!g) return null

  const pct = goalPct(g)
  const done = pct >= 100
  const fundVal = parseFloat(fundAmount)
  const fundValid = Boolean(fundVal) && fundVal > 0 && fundVal <= MAX_AMOUNT

  async function addFunds() {
    if (saving || !fundValid) return
    const saved = await runSaving(() =>
      persistGoals(goalsRef.current.map((x) => (x.id === id ? { ...x, saved: Math.max(0, x.saved + fundVal) } : x)))
    )
    if (saved) setFundAmount('')
  }

  function deleteGoal() {
    deleteWithUndo({
      list: goals, id, persist: persistGoals, ref: goalsRef,
      label: (goal) => `Deleted "${goal.name}"`,
    })
    close()
  }

  return (
    <div className="money-detail">
      <div className="money-detail-head">
        <span className="money-detail-icon" aria-hidden="true">{g.icon}</span>
        <h3 className="money-detail-title">{g.name}</h3>
      </div>
      <div>
        <div className="money-detail-amount">{pct}%</div>
        <div className="money-small">{formatRupees(g.saved)} / {formatRupees(g.target)}</div>
        <div className="money-small">{done ? 'Done!' : `${formatRupees(g.target - g.saved)} left`}</div>
      </div>
      <ProgressBar pct={pct} done={done} />
      <div className="money-detail-fund">
        <input
          type="number"
          inputMode="decimal"
          placeholder="Amount (₹)"
          aria-label={`Add funds to ${g.name}`}
          value={fundAmount}
          onChange={(e) => setFundAmount(e.target.value)}
          max={MAX_AMOUNT}
          onKeyDown={(e) => e.key === 'Enter' && addFunds()}
        />
        <button type="button" className="btn btn-success btn-sm" onClick={addFunds} disabled={!fundValid || saving}>
          + Add
        </button>
      </div>
      <div className="money-detail-actions">
        <button type="button" className="btn btn-danger-ghost btn-sm" onClick={deleteGoal}>
          Delete goal
        </button>
      </div>
      {g.createdAt && <div className="money-detail-note">added {formatAdded(g.createdAt)}</div>}
    </div>
  )
}

export default function GoalsScreen() {
  const { goals, goalsRef, persistGoals } = useMoney()
  const { node, open } = useInspector()
  const [showForm, setShowForm] = useState(false)
  const selectedId = node?.type === GoalDetail ? node.props.id : null

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
            const pct = goalPct(g)
            const done = pct >= 100
            const selected = selectedId === g.id
            return (
              <SortableRow key={g.id} id={g.id} type="goal">
                {(handle) => (
                  <div className="card money-goal-card" data-selected={selected ? '' : undefined}>
                    <div className="money-goal-head">
                      {handle}
                      <button
                        type="button"
                        className="money-goal-main"
                        aria-current={selected ? 'true' : undefined}
                        onClick={() => open(<GoalDetail key={g.id} id={g.id} />)}
                      >
                        <span className="money-goal-icon" aria-hidden="true">{g.icon}</span>
                        <span className="money-goal-text">
                          <span className="money-goal-name">{g.name}</span>
                          <span className="money-small">{formatRupees(g.saved)} / {formatRupees(g.target)}</span>
                          {g.createdAt && <span className="money-tiny">added {formatAdded(g.createdAt)}</span>}
                        </span>
                        <span className="money-goal-side">
                          <span className="money-goal-pct" data-done={done ? '' : undefined}>{pct}%</span>
                          <span className="money-tiny">{done ? 'Done!' : `${formatRupees(g.target - g.saved)} left`}</span>
                        </span>
                      </button>
                    </div>
                    <ProgressBar pct={pct} done={done} />
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
