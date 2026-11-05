import { useState } from 'react'
import { getTokenUsage, saveTokenUsage, getTokenBudget, saveTokenBudget } from '../store.js'
import { useHydrate } from '../useHydrate.js'
import { useLatest } from '../useLatest.js'
import { deleteWithUndo } from '../undo.js'
import { newId } from '../id.js'
import Sheet from '../Sheet.jsx'
import {
  SOURCES, entryTotal, startOfDay, startOfWeek, totalsSince, dailySeries, bySource,
  formatTokens, parseTokens,
} from '../usage/logic.js'

const SRC_LABEL = Object.fromEntries(SOURCES.map((s) => [s.id, s.label]))
const MODELS = ['Fable 5.1', 'Opus 5.5', 'Sonnet 5.5', 'Haiku 5.5']

export default function Tokens({ syncTick = 0 }) {
  const [entries, setEntries] = useState([])
  const [budget, setBudget] = useState({ weekly: 0 })
  const [showAdd, setShowAdd] = useState(false)
  const [showBudget, setShowBudget] = useState(false)
  const [budgetDraft, setBudgetDraft] = useState('')

  const [source, setSource] = useState('claude-code')
  const [model, setModel] = useState('Sonnet 5.5')
  const [input, setInput] = useState('')
  const [output, setOutput] = useState('')
  const [cacheRead, setCacheRead] = useState('')
  const [cacheWrite, setCacheWrite] = useState('')
  const [note, setNote] = useState('')
  const [formErr, setFormErr] = useState('')

  const entriesRef = useLatest(entries)

  const { ready, error } = useHydrate([
    () => getTokenUsage().then(setEntries),
    () => getTokenBudget().then(setBudget),
  ], [syncTick])

  async function persist(next) {
    setEntries(next)
    await saveTokenUsage(next)
  }

  function openAdd() {
    setInput(''); setOutput(''); setCacheRead(''); setCacheWrite(''); setNote(''); setFormErr('')
    setShowAdd(true)
  }

  async function add() {
    const vals = [input, output, cacheRead, cacheWrite].map(parseTokens)
    if (vals.some((v) => v === null)) return setFormErr('Use numbers like 12000 or 12k')
    const [i, o, cr, cw] = vals
    if (i + o + cr + cw === 0) return setFormErr('Enter at least one token count')
    const entry = {
      id: newId(), date: Date.now(), source, model, input: i, output: o,
      cacheRead: cr, cacheWrite: cw, note: note.trim(),
    }
    setShowAdd(false)
    await persist([entry, ...entriesRef.current])
  }

  async function saveBudgetValue() {
    const v = parseTokens(budgetDraft)
    if (v === null) return
    const next = { weekly: v }
    setBudget(next)
    setShowBudget(false)
    await saveTokenBudget(next)
  }

  if (error) return <div className="banner-warn">{error}</div>
  if (!ready) {
    return <div className="loading"><span className="loading-dot" /><span className="loading-dot" /><span className="loading-dot" /></div>
  }

  const now = Date.now()
  const today = totalsSince(entries, startOfDay(now))
  const week = totalsSince(entries, startOfWeek(now))
  const month = totalsSince(entries, new Date(new Date(now).getFullYear(), new Date(now).getMonth(), 1).getTime())
  const series = dailySeries(entries, 7, now)
  const maxDay = Math.max(1, ...series.map((s) => s.total))
  const sources = bySource(entries.filter((e) => e.date >= startOfWeek(now)))
  const pct = budget.weekly > 0 ? Math.min(100, Math.round((week / budget.weekly) * 100)) : 0
  const over = budget.weekly > 0 && week > budget.weekly
  const sorted = [...entries].sort((a, b) => b.date - a.date)

  return (
    <>
      <div className="stat-row">
        <div className="stat-card"><div className="stat-value">{formatTokens(today)}</div><div className="stat-label">Today</div></div>
        <div className="stat-card"><div className="stat-value">{formatTokens(week)}</div><div className="stat-label">This week</div></div>
        <div className="stat-card"><div className="stat-value">{formatTokens(month)}</div><div className="stat-label">This month</div></div>
      </div>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="h3">Weekly budget</div>
          <button className="btn btn-ghost btn-sm" onClick={() => { setBudgetDraft(budget.weekly ? String(budget.weekly) : ''); setShowBudget(true) }}>
            {budget.weekly ? 'Edit' : 'Set'}
          </button>
        </div>
        {budget.weekly > 0 ? (
          <>
            <div style={{ height: 8, borderRadius: 4, background: 'var(--border)', margin: '10px 0 6px', overflow: 'hidden' }}>
              <div style={{ width: `${pct}%`, height: '100%', background: over ? 'var(--danger)' : pct >= 80 ? 'var(--warn)' : 'var(--accent)' }} />
            </div>
            <div className="meta" style={over ? { color: 'var(--danger)' } : undefined}>
              {formatTokens(week)} / {formatTokens(budget.weekly)} ({pct}%){over ? ' — over budget' : ''}
            </div>
          </>
        ) : (
          <div className="meta" style={{ marginTop: 6 }}>No limit set</div>
        )}
      </div>

      <div className="card">
        <div className="h3" style={{ marginBottom: 12 }}>Last 7 days</div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 100 }}>
          {series.map((s) => (
            <div key={s.day} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%' }}>
              <div className="meta" style={{ fontSize: 10, marginBottom: 2 }}>{s.total ? formatTokens(s.total) : ''}</div>
              <div style={{ width: '100%', height: `${Math.max(2, (s.total / maxDay) * 70)}%`, background: s.total ? 'var(--accent)' : 'var(--border)', borderRadius: 4 }} />
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
          {series.map((s) => (
            <div key={s.day} className="meta" style={{ flex: 1, textAlign: 'center', fontSize: 11 }}>
              {new Date(s.day).toLocaleDateString('en-IN', { weekday: 'narrow' })}
            </div>
          ))}
        </div>
        {sources.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
            {sources.map(([id, n]) => (
              <span key={id} className="chip">{SRC_LABEL[id] || id} · {formatTokens(n)}</span>
            ))}
          </div>
        )}
      </div>

      <button className="btn btn-primary" style={{ width: '100%', marginBottom: 10 }} onClick={openAdd}>
        + Log usage
      </button>

      {sorted.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">{'🪙'}</div>
          <div className="empty-text">No usage logged yet. Copy token counts from Claude Code's /cost or /usage, or your API console.</div>
        </div>
      ) : (
        sorted.map((e) => (
          <div key={e.id} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <div style={{ minWidth: 0 }}>
              <div className="h3">{formatTokens(entryTotal(e))} tokens</div>
              <div className="meta">
                {SRC_LABEL[e.source] || e.source} · {e.model} · {new Date(e.date).toLocaleString('en-IN', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
              </div>
              <div className="meta">
                in {formatTokens(e.input || 0)} · out {formatTokens(e.output || 0)}
                {(e.cacheRead || e.cacheWrite) ? ` · cache r ${formatTokens(e.cacheRead || 0)} / w ${formatTokens(e.cacheWrite || 0)}` : ''}
              </div>
              {e.note && <div className="meta" style={{ fontStyle: 'italic' }}>{e.note}</div>}
            </div>
            <button
              className="btn btn-danger-ghost btn-sm"
              aria-label="Delete entry"
              onClick={() => deleteWithUndo({
                list: entries, id: e.id, persist, ref: entriesRef,
                label: () => 'Usage entry deleted',
              })}
            >
              {'✕'}
            </button>
          </div>
        ))
      )}

      <Sheet open={showAdd} onClose={() => setShowAdd(false)}>
        <div className="h3" style={{ marginBottom: 10 }}>Log usage</div>
        <label className="meta" htmlFor="tk-src">Source</label>
        <select id="tk-src" value={source} onChange={(e) => setSource(e.target.value)} style={{ marginTop: 4, marginBottom: 10 }}>
          {SOURCES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
        <label className="meta" htmlFor="tk-model">Model</label>
        <select id="tk-model" value={model} onChange={(e) => setModel(e.target.value)} style={{ marginTop: 4, marginBottom: 10 }}>
          {MODELS.map((m) => <option key={m}>{m}</option>)}
        </select>
        {[
          ['tk-in', 'Input tokens', input, setInput],
          ['tk-out', 'Output tokens', output, setOutput],
          ['tk-cr', 'Cache read (optional)', cacheRead, setCacheRead],
          ['tk-cw', 'Cache write (optional)', cacheWrite, setCacheWrite],
        ].map(([id, label, val, set]) => (
          <div key={id} style={{ marginBottom: 10 }}>
            <label className="meta" htmlFor={id}>{label}</label>
            <input id={id} inputMode="text" placeholder="e.g. 12k or 12000" value={val} onChange={(e) => set(e.target.value)} style={{ marginTop: 4 }} />
          </div>
        ))}
        <label className="meta" htmlFor="tk-note">Note (optional)</label>
        <input id="tk-note" value={note} onChange={(e) => setNote(e.target.value)} style={{ marginTop: 4 }} />
        {formErr && <div className="err" style={{ marginTop: 8 }}>{formErr}</div>}
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button className="btn btn-primary btn-sm" onClick={add}>Save</button>
          <button className="btn btn-ghost btn-sm" onClick={() => setShowAdd(false)}>Cancel</button>
        </div>
      </Sheet>

      <Sheet open={showBudget} onClose={() => setShowBudget(false)}>
        <div className="h3" style={{ marginBottom: 10 }}>Weekly token budget</div>
        <input
          inputMode="text" placeholder="e.g. 5m (0 = no limit)" value={budgetDraft}
          onChange={(e) => setBudgetDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && saveBudgetValue()}
        />
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button className="btn btn-primary btn-sm" onClick={saveBudgetValue}>Save</button>
          <button className="btn btn-ghost btn-sm" onClick={() => setShowBudget(false)}>Cancel</button>
        </div>
      </Sheet>
    </>
  )
}
