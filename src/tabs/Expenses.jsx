import { useEffect, useState } from 'react'
import { getExpenses, saveExpenses } from '../store.js'

const CATEGORIES = [
  { id: 'food', emoji: '🍔', label: 'Food' },
  { id: 'transport', emoji: '🚗', label: 'Transport' },
  { id: 'shopping', emoji: '🛍️', label: 'Shopping' },
  { id: 'bills', emoji: '📱', label: 'Bills' },
  { id: 'entertainment', emoji: '🎮', label: 'Fun' },
  { id: 'health', emoji: '💊', label: 'Health' },
  { id: 'education', emoji: '📚', label: 'Education' },
  { id: 'groceries', emoji: '🛒', label: 'Groceries' },
  { id: 'coffee', emoji: '☕', label: 'Coffee' },
  { id: 'subscriptions', emoji: '🔄', label: 'Subs' },
  { id: 'travel', emoji: '✈️', label: 'Travel' },
  { id: 'other', emoji: '📦', label: 'Other' },
]

const CAT_MAP = Object.fromEntries(CATEGORIES.map((c) => [c.id, c]))

function startOfDay(d) { const t = new Date(d); t.setHours(0, 0, 0, 0); return t.getTime() }
function startOfWeek(d) {
  const t = new Date(d); t.setHours(0, 0, 0, 0)
  t.setDate(t.getDate() - t.getDay())
  return t.getTime()
}
function startOfMonth(d) {
  const t = new Date(d); t.setHours(0, 0, 0, 0); t.setDate(1)
  return t.getTime()
}

function formatDate(ts) {
  const d = new Date(ts)
  const today = startOfDay(Date.now())
  const diff = today - startOfDay(ts)
  if (diff === 0) return 'Today'
  if (diff === 86400000) return 'Yesterday'
  return d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })
}

function groupByDate(expenses) {
  const groups = {}
  for (const e of expenses) {
    const key = startOfDay(e.date)
    if (!groups[key]) groups[key] = []
    groups[key].push(e)
  }
  return Object.entries(groups).sort((a, b) => b[0] - a[0])
}

export default function Expenses() {
  const [expenses, setExpenses] = useState([])
  const [showAdd, setShowAdd] = useState(false)
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState('')
  const [note, setNote] = useState('')
  const [editId, setEditId] = useState(null)
  const [filter, setFilter] = useState('all')

  useEffect(() => { getExpenses().then(setExpenses) }, [])

  async function persist(next) {
    setExpenses(next)
    await saveExpenses(next)
  }

  function openAdd() {
    setAmount('')
    setCategory('')
    setNote('')
    setEditId(null)
    setShowAdd(true)
  }

  function openEdit(e) {
    setAmount(String(e.amount))
    setCategory(e.category)
    setNote(e.note || '')
    setEditId(e.id)
    setShowAdd(true)
  }

  function duplicate(e) {
    const entry = { id: Date.now(), amount: e.amount, category: e.category, note: e.note, date: Date.now() }
    persist([entry, ...expenses])
  }

  async function handleSave() {
    const val = parseFloat(amount)
    if (!val || val <= 0 || !category) return
    if (editId) {
      const next = expenses.map((e) =>
        e.id === editId ? { ...e, amount: val, category, note: note.trim() } : e
      )
      await persist(next)
    } else {
      const entry = { id: Date.now(), amount: val, category, note: note.trim(), date: Date.now() }
      await persist([entry, ...expenses])
    }
    setShowAdd(false)
  }

  async function handleDelete(id) {
    await persist(expenses.filter((e) => e.id !== id))
  }

  const now = Date.now()
  const weekStart = startOfWeek(now)
  const monthStart = startOfMonth(now)
  const todayStart = startOfDay(now)
  const weekTotal = expenses.filter((e) => e.date >= weekStart).reduce((s, e) => s + e.amount, 0)
  const monthTotal = expenses.filter((e) => e.date >= monthStart).reduce((s, e) => s + e.amount, 0)
  const todayTotal = expenses.filter((e) => e.date >= todayStart).reduce((s, e) => s + e.amount, 0)

  const topCats = {}
  expenses.filter((e) => e.date >= monthStart).forEach((e) => {
    topCats[e.category] = (topCats[e.category] || 0) + e.amount
  })
  const topCatsSorted = Object.entries(topCats).sort((a, b) => b[1] - a[1]).slice(0, 4)

  const visible = filter === 'all' ? expenses : expenses.filter((e) => e.category === filter)
  const groups = groupByDate(visible)

  return (
    <div className="fade-in">
      {/* Summary */}
      <div className="stat-row">
        <div className="stat-card">
          <div className="stat-value" style={{ color: todayTotal > 0 ? 'var(--danger)' : 'var(--text-tertiary)', fontSize: 22 }}>
            {todayTotal > 0 ? `₹${todayTotal.toLocaleString('en-IN')}` : '—'}
          </div>
          <div className="stat-label">Today</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: 'var(--warn)', fontSize: 22 }}>
            ₹{weekTotal.toLocaleString('en-IN')}
          </div>
          <div className="stat-label">This week</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: 'var(--accent)', fontSize: 22 }}>
            ₹{monthTotal.toLocaleString('en-IN')}
          </div>
          <div className="stat-label">This month</div>
        </div>
      </div>

      {/* Top categories this month */}
      {topCatsSorted.length > 0 && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 12, overflowX: 'auto' }}>
          {topCatsSorted.map(([catId, total]) => {
            const c = CAT_MAP[catId]
            return (
              <div
                key={catId}
                className="chip"
                style={{ cursor: 'pointer', background: filter === catId ? 'var(--accent-dim)' : 'rgba(139,149,168,0.1)', color: filter === catId ? 'var(--accent)' : 'var(--text-secondary)' }}
                onClick={() => setFilter(filter === catId ? 'all' : catId)}
              >
                {c?.emoji} ₹{Math.round(total).toLocaleString('en-IN')}
              </div>
            )
          })}
          {filter !== 'all' && (
            <div className="chip chip-muted" style={{ cursor: 'pointer' }} onClick={() => setFilter('all')}>
              Clear
            </div>
          )}
        </div>
      )}

      {/* Quick-add modal */}
      {showAdd && (
        <div className="card" style={{ marginBottom: 12, animation: 'slideDown 0.2s ease-out' }}>
          <div className="h3" style={{ marginBottom: 10 }}>{editId ? 'Edit Expense' : 'Add Expense'}</div>

          <input
            type="number"
            inputMode="decimal"
            placeholder="Amount (₹)"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSave()}
            autoFocus
            style={{ fontSize: 24, fontWeight: 700, textAlign: 'center', marginBottom: 12, letterSpacing: '-0.02em' }}
          />

          <div className="expense-cat-grid">
            {CATEGORIES.map((c) => (
              <button
                key={c.id}
                className={`expense-cat-btn${category === c.id ? ' active' : ''}`}
                onClick={() => setCategory(c.id)}
              >
                <span style={{ fontSize: 20 }}>{c.emoji}</span>
                <span style={{ fontSize: 10, fontWeight: 600 }}>{c.label}</span>
              </button>
            ))}
          </div>

          <input
            placeholder="Note (optional)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSave()}
            style={{ marginTop: 10, fontSize: 13 }}
          />

          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button
              className="btn btn-primary btn-sm"
              style={{ flex: 1 }}
              onClick={handleSave}
              disabled={!amount || !category || parseFloat(amount) <= 0}
            >
              {editId ? 'Save' : 'Add'}
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => setShowAdd(false)}>Cancel</button>
          </div>
        </div>
      )}

      {/* Section header */}
      <div className="section-header">
        <span className="section-title">
          {filter !== 'all' ? `${CAT_MAP[filter]?.emoji} ${CAT_MAP[filter]?.label}` : 'Recent'}
        </span>
        <span className="meta">{visible.length} entries</span>
      </div>

      {/* Expense list grouped by day */}
      {groups.length === 0 && (
        <div className="empty-state">
          <div className="empty-icon">💸</div>
          <div className="empty-text">No expenses yet. Tap + to start tracking.</div>
        </div>
      )}

      {groups.map(([dayKey, items]) => (
        <div key={dayKey}>
          <div className="meta" style={{ padding: '6px 0 4px', fontSize: 12, fontWeight: 600 }}>
            {formatDate(Number(dayKey))}
          </div>
          {items.map((e) => {
            const c = CAT_MAP[e.category]
            return (
              <div className="card" key={e.id} style={{ padding: '10px 14px', marginBottom: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 22 }}>{c?.emoji || '📦'}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                      <span style={{ fontWeight: 600, fontSize: 14 }}>{c?.label || e.category}</span>
                      <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--danger)', whiteSpace: 'nowrap' }}>
                        ₹{e.amount.toLocaleString('en-IN')}
                      </span>
                    </div>
                    {e.note && <div className="meta" style={{ fontSize: 12, marginTop: 1 }}>{e.note}</div>}
                  </div>
                  <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => duplicate(e)} title="Repeat" style={{ padding: '4px 6px', fontSize: 14 }}>
                      🔄
                    </button>
                    <button className="btn btn-ghost btn-sm" onClick={() => openEdit(e)} title="Edit" style={{ padding: '4px 6px', fontSize: 14 }}>
                      ✏️
                    </button>
                    <button className="btn btn-danger-ghost btn-sm" onClick={() => handleDelete(e.id)} title="Delete" style={{ padding: '4px 6px', fontSize: 14 }}>
                      ×
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      ))}

      {/* FAB */}
      {!showAdd && (
        <button className="expense-fab" onClick={openAdd}>+</button>
      )}
    </div>
  )
}
