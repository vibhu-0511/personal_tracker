import { useEffect, useState } from 'react'
import { getInvestProgress, saveInvestProgress, getWatchlist, saveWatchlist } from '../store.js'
import { PHASES, CONTENT, QUIZZES, TASKS, GLOSSARY } from '../invest/course.js'
import { STOCK_CHECKLIST, MF_CHECKLIST, IPO_CHECKLIST, OSS_TOOLS, LINKS } from '../invest/research.js'

const ALL_MODS = PHASES.flatMap((p) => p.mods)
const VIEWS = [
  { id: 'learn', icon: '📘', label: 'Learn' },
  { id: 'research', icon: '🔍', label: 'Research' },
  { id: 'watch', icon: '⭐', label: 'Watchlist' },
]

function modIndex(id) {
  return ALL_MODS.findIndex((m) => m.id === id)
}
function isUnlocked(done, id) {
  const i = modIndex(id)
  if (i <= 0) return true
  return !!done[ALL_MODS[i - 1].id]
}

export default function Invest() {
  const [view, setView] = useState('learn')
  const [progress, setProgress] = useState({ done: {}, quiz: {}, tasks: {}, current: null })
  const [watchlist, setWatchlist] = useState([])
  const [watchIntent, setWatchIntent] = useState(null)

  useEffect(() => {
    getInvestProgress().then((p) => setProgress({ current: ALL_MODS[0].id, ...p }))
    getWatchlist().then(setWatchlist)
  }, [])

  async function updateProgress(next) {
    setProgress(next)
    await saveInvestProgress(next)
  }

  async function updateWatchlist(next) {
    setWatchlist(next)
    await saveWatchlist(next)
  }

  return (
    <div className="fade-in">
      <div className="invest-disclaimer">
        Educational only — not SEBI-registered investment advice. No buy/sell recommendations.
      </div>

      <div className="agent-bar">
        {VIEWS.map((v) => (
          <button key={v.id} className={`agent-pill${view === v.id ? ' active' : ''}`} onClick={() => setView(v.id)}>
            <span className="agent-pill-icon">{v.icon}</span>
            {v.label}
          </button>
        ))}
      </div>

      {view === 'learn' && <Learn progress={progress} onUpdate={updateProgress} />}
      {view === 'research' && (
        <Research onGoToWatch={(type) => { setWatchIntent(type); setView('watch') }} />
      )}
      {view === 'watch' && (
        <Watchlist
          items={watchlist}
          onUpdate={updateWatchlist}
          initialType={watchIntent}
          onConsumeInitialType={() => setWatchIntent(null)}
        />
      )}
    </div>
  )
}

// ───────────────────────── Learn ─────────────────────────

function Learn({ progress, onUpdate }) {
  const [showGlossary, setShowGlossary] = useState(false)
  const [glossQuery, setGlossQuery] = useState('')

  const currentId = progress.current || ALL_MODS[0].id
  const currentMod = ALL_MODS.find((m) => m.id === currentId) || ALL_MODS[0]
  const doneCount = Object.values(progress.done).filter(Boolean).length
  const pct = Math.round((doneCount / ALL_MODS.length) * 100)

  const filteredGlossary = GLOSSARY.filter(
    ([term, def]) =>
      term.toLowerCase().includes(glossQuery.toLowerCase()) || def.toLowerCase().includes(glossQuery.toLowerCase())
  )

  return (
    <div>
      <div className="card" style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
          <span className="h3">Course Progress</span>
          <span className="meta">{doneCount}/{ALL_MODS.length} modules</span>
        </div>
        <div className="exam-progress-bar">
          <div className="exam-progress-fill" style={{ width: `${pct}%`, background: 'var(--accent)' }} />
        </div>
      </div>

      <div className="agent-bar">
        <button className={`agent-pill${!showGlossary ? ' active' : ''}`} onClick={() => setShowGlossary(false)}>
          Modules
        </button>
        <button className={`agent-pill${showGlossary ? ' active' : ''}`} onClick={() => setShowGlossary(true)}>
          <span className="agent-pill-icon">📖</span>Glossary
        </button>
      </div>

      {showGlossary ? (
        <div className="card">
          <input
            value={glossQuery}
            onChange={(e) => setGlossQuery(e.target.value)}
            placeholder="Search terms…"
            style={{ marginBottom: 12, width: '100%' }}
          />
          {filteredGlossary.map(([term, def]) => (
            <div key={term} style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
              <div style={{ fontWeight: 700, color: 'var(--accent)' }}>{term}</div>
              <div className="meta">{def}</div>
            </div>
          ))}
        </div>
      ) : (
        <>
          {PHASES.map((phase) => (
            <div key={phase.id} style={{ marginBottom: 10 }}>
              <div className="meta" style={{ marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                {phase.name}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {phase.mods.map((m) => {
                  const unlocked = isUnlocked(progress.done, m.id)
                  const done = !!progress.done[m.id]
                  const curr = m.id === currentId
                  return (
                    <button
                      key={m.id}
                      className={`invest-mod-btn${curr ? ' active' : ''}`}
                      disabled={!unlocked}
                      onClick={() => onUpdate({ ...progress, current: m.id })}
                    >
                      <span className={`invest-dot${done ? ' done' : curr ? ' curr' : !unlocked ? ' lock' : ''}`} />
                      <span style={{ flex: 1, textAlign: 'left' }}>{m.t}</span>
                      <span className="meta">{done ? `${progress.quiz[m.id]}%` : unlocked ? '' : '🔒'}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          ))}

          <ModuleView mod={currentMod} progress={progress} onUpdate={onUpdate} />
        </>
      )}

      <ResourcesCard />
    </div>
  )
}

function ModuleView({ mod, progress, onUpdate }) {
  const idx = modIndex(mod.id)
  const prev = idx > 0 ? ALL_MODS[idx - 1] : null
  const next = idx < ALL_MODS.length - 1 ? ALL_MODS[idx + 1] : null
  const tasks = TASKS[mod.id] || []
  const done = !!progress.done[mod.id]

  function toggleTask(key) {
    onUpdate({ ...progress, tasks: { ...progress.tasks, [key]: !progress.tasks[key] } })
  }

  function markDone(pct) {
    onUpdate({
      ...progress,
      done: { ...progress.done, [mod.id]: true },
      quiz: { ...progress.quiz, [mod.id]: pct },
    })
  }

  return (
    <div style={{ marginTop: 12 }}>
      <div className="meta" style={{ marginBottom: 4 }}>{mod.meta} · Module {idx + 1}/{ALL_MODS.length}</div>
      <div className="h3" style={{ fontSize: 19, marginBottom: 12 }}>{mod.t}</div>

      <div className="invest-content" dangerouslySetInnerHTML={{ __html: CONTENT[mod.body] }} />

      {tasks.length > 0 && (
        <div className="card" style={{ marginTop: 12 }}>
          <div className="h3" style={{ marginBottom: 10 }}>Practice Tasks</div>
          {tasks.map((task, j) => {
            const key = `${mod.id}_${j}`
            const checked = !!progress.tasks[key]
            return (
              <label key={key} className="exam-topic-row">
                <input type="checkbox" checked={checked} onChange={() => toggleTask(key)} />
                <span style={{ textDecoration: checked ? 'line-through' : 'none', opacity: checked ? 0.5 : 1 }}>
                  {task}
                </span>
              </label>
            )
          })}
        </div>
      )}

      <Quiz modId={mod.id} done={done} quizPct={progress.quiz[mod.id]} onPass={markDone} />

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 14 }}>
        <button className="btn btn-ghost btn-sm" disabled={!prev} onClick={() => prev && onUpdate({ ...progress, current: prev.id })}>
          ‹ {prev ? prev.t : 'Start'}
        </button>
        <button
          className="btn btn-primary btn-sm"
          disabled={!next || !done}
          onClick={() => next && onUpdate({ ...progress, current: next.id })}
        >
          {next ? 'Next ›' : 'End'}
        </button>
      </div>
    </div>
  )
}

function Quiz({ modId, done, quizPct, onPass }) {
  const qs = QUIZZES[modId] || []
  const [picks, setPicks] = useState({})
  const [result, setResult] = useState(null)

  useEffect(() => {
    setPicks({})
    setResult(null)
  }, [modId])

  if (!qs.length) {
    return (
      <div className="card" style={{ marginTop: 12 }}>
        <div className="meta" style={{ marginBottom: 10 }}>No quiz for this module.</div>
        <button className="btn btn-primary btn-sm" onClick={() => onPass(100)} disabled={done}>
          {done ? 'Completed ✓' : 'Mark complete ✓'}
        </button>
      </div>
    )
  }

  function grade() {
    let correct = 0
    qs.forEach((q, i) => { if (picks[i] === q.a) correct++ })
    const pct = Math.round((correct / qs.length) * 100)
    const pass = pct >= 80
    setResult({ correct, pct, pass })
    if (pass) onPass(pct)
  }

  return (
    <div className="card" style={{ marginTop: 12 }}>
      <div className="h3" style={{ marginBottom: 12 }}>Module Quiz · pass ≥80% to unlock next</div>
      {qs.map((q, i) => (
        <div key={i} style={{ marginBottom: 16 }}>
          <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 14 }}>{i + 1}. {q.q}</div>
          {q.o.map((opt, j) => {
            const selected = picks[i] === j
            let cls = 'invest-opt'
            if (selected) cls += ' sel'
            if (result && j === q.a) cls += ' correct'
            if (result && selected && j !== q.a) cls += ' wrong'
            return (
              <button
                key={j}
                className={cls}
                disabled={!!result}
                onClick={() => setPicks({ ...picks, [i]: j })}
              >
                {opt}
              </button>
            )
          })}
        </div>
      ))}
      {!result && (
        <button
          className="btn btn-primary btn-sm"
          disabled={Object.keys(picks).length < qs.length}
          onClick={grade}
        >
          Submit answers
        </button>
      )}
      {result && (
        <div className={`invest-quiz-result ${result.pass ? 'pass' : 'fail'}`}>
          {result.pass ? '✓ PASS' : '✗ RETRY'} — {result.correct}/{qs.length} ({result.pct}%)
          {!result.pass && (
            <button className="btn btn-ghost btn-sm" style={{ marginLeft: 10 }} onClick={() => { setPicks({}); setResult(null) }}>
              Retry
            </button>
          )}
        </div>
      )}
      {done && <div className="meta" style={{ marginTop: 8 }}>Best score: {quizPct}%</div>}
    </div>
  )
}

function ResourcesCard() {
  return (
    <div className="card" style={{ marginTop: 12 }}>
      <div className="h3" style={{ marginBottom: 10 }}>Free Resources</div>
      <ul style={{ paddingLeft: 18, color: 'var(--text-secondary)', fontSize: 13.5, lineHeight: 1.8 }}>
        <li><a href="https://zerodha.com/varsity/modules/" target="_blank" rel="noreferrer">Zerodha Varsity</a> — free modules. Suggested order: 1 → 3 → 11 → 7 → 15 → 9 → 2 → 10.</li>
        <li><a href="https://investor.sebi.gov.in" target="_blank" rel="noreferrer">SEBI Investor Website</a> &amp; Saa₹thi app — free tools, calculators, registration checks.</li>
        <li><a href="https://www.nism.ac.in/certifications/" target="_blank" rel="noreferrer">NISM certifications</a> — Series V-A (Mutual Funds), Series VIII (Equity Derivatives) before trading F&amp;O.</li>
        <li>Books: <em>Let's Talk Money</em> (Halan), <em>Coffee Can Investing</em> (Mukherjea), <em>The Psychology of Money</em> (Housel), <em>The Intelligent Investor</em> (Graham).</li>
      </ul>
    </div>
  )
}

// ───────────────────────── Research ─────────────────────────

function ChecklistTable({ items }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="invest-checklist">
        <thead><tr><th>Metric</th><th>Rule of thumb</th><th>Why</th><th>Where</th></tr></thead>
        <tbody>
          {items.map((it) => (
            <tr key={it.metric}>
              <td>{it.metric}</td>
              <td>{it.rule}</td>
              <td className="meta">{it.why}</td>
              <td className="meta">{it.where}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Research({ onGoToWatch }) {
  return (
    <div>
      <div className="card" style={{ marginBottom: 10 }}>
        <div className="h3" style={{ marginBottom: 6 }}>How to Screen — Not What to Buy</div>
        <div className="meta">Educational criteria experienced investors use. Nothing here is a recommendation.</div>
      </div>

      <div className="section-header"><span className="section-title">Stocks</span></div>
      {STOCK_CHECKLIST.map((g) => (
        <div key={g.group} className="card" style={{ marginBottom: 8 }}>
          <div className="h3" style={{ marginBottom: 8 }}>{g.group}</div>
          <ChecklistTable items={g.items} />
        </div>
      ))}
      <button className="btn btn-ghost btn-sm" style={{ marginBottom: 16 }} onClick={() => onGoToWatch('stock')}>
        + Track a stock
      </button>

      <div className="section-header" style={{ paddingTop: 4 }}><span className="section-title">Mutual Funds</span></div>
      <div className="card" style={{ marginBottom: 8 }}><ChecklistTable items={MF_CHECKLIST} /></div>
      <button className="btn btn-ghost btn-sm" style={{ marginBottom: 16 }} onClick={() => onGoToWatch('mf')}>
        + Track a fund
      </button>

      <div className="section-header" style={{ paddingTop: 4 }}><span className="section-title">IPOs</span></div>
      <div className="card" style={{ marginBottom: 8 }}><ChecklistTable items={IPO_CHECKLIST} /></div>
      <button className="btn btn-ghost btn-sm" style={{ marginBottom: 16 }} onClick={() => onGoToWatch('ipo')}>
        + Track an IPO
      </button>

      <div className="section-header" style={{ paddingTop: 4 }}><span className="section-title">Open-Source Tools</span></div>
      <div className="card" style={{ marginBottom: 8 }}>
        {OSS_TOOLS.map((t) => (
          <div key={t.name} style={{ padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
            <a href={t.url} target="_blank" rel="noreferrer" style={{ fontWeight: 600 }}>{t.name}</a>
            <div className="meta">{t.use}</div>
          </div>
        ))}
      </div>

      <div className="section-header" style={{ paddingTop: 4 }}><span className="section-title">Free Data &amp; Tools</span></div>
      <div className="card">
        {LINKS.map((l) => (
          <div key={l.name} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', gap: 8 }}>
            <a href={l.url} target="_blank" rel="noreferrer">{l.name}</a>
            <span className="meta" style={{ textAlign: 'right' }}>{l.note}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ───────────────────────── Watchlist ─────────────────────────

function Watchlist({ items, onUpdate, initialType, onConsumeInitialType }) {
  const [quotes, setQuotes] = useState({})
  const [navs, setNavs] = useState({})
  const [addType, setAddType] = useState(null)

  useEffect(() => {
    if (initialType) {
      setAddType(initialType)
      onConsumeInitialType?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialType])

  const stockSymbols = items.filter((i) => i.type === 'stock').map((i) => i.symbol)
  const mfItems = items.filter((i) => i.type === 'mf')

  useEffect(() => {
    if (stockSymbols.length === 0) { setQuotes({}); return }
    fetch(`/api/quote?symbols=${stockSymbols.join(',')}`)
      .then((r) => r.json())
      .then((data) => {
        const map = {}
        ;(data.quotes || []).forEach((q) => { map[q.symbol] = q })
        ;(data.errors || []).forEach((e) => { map[e.symbol] = { error: e.error } })
        setQuotes(map)
      })
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items])

  useEffect(() => {
    if (mfItems.length === 0) { setNavs({}); return }
    Promise.all(
      mfItems.map((i) =>
        fetch(`https://api.mfapi.in/mf/${i.schemeCode}/latest`)
          .then((r) => r.json())
          .then((d) => ({ code: i.schemeCode, nav: d?.data?.[0]?.nav, date: d?.data?.[0]?.date }))
          .catch(() => ({ code: i.schemeCode, error: true }))
      )
    ).then((results) => {
      const map = {}
      results.forEach((r) => { map[r.code] = r })
      setNavs(map)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items])

  async function addItem(item) {
    await onUpdate([...items, { id: Date.now(), addedAt: Date.now(), note: '', ...item }])
    setAddType(null)
  }

  async function removeItem(id) {
    await onUpdate(items.filter((i) => i.id !== id))
  }

  async function updateNote(id, note) {
    await onUpdate(items.map((i) => (i.id === id ? { ...i, note } : i)))
  }

  const sorted = [...items].sort((a, b) => {
    if (a.type === 'ipo' && b.type !== 'ipo') return -1
    if (b.type === 'ipo' && a.type !== 'ipo') return 1
    if (a.type === 'ipo' && b.type === 'ipo') return (a.ipo?.open || '').localeCompare(b.ipo?.open || '')
    return b.addedAt - a.addedAt
  })

  return (
    <div>
      <div className="agent-bar">
        <button className={`agent-pill${addType === 'stock' ? ' active' : ''}`} onClick={() => setAddType(addType === 'stock' ? null : 'stock')}>
          + Stock
        </button>
        <button className={`agent-pill${addType === 'mf' ? ' active' : ''}`} onClick={() => setAddType(addType === 'mf' ? null : 'mf')}>
          + Fund
        </button>
        <button className={`agent-pill${addType === 'ipo' ? ' active' : ''}`} onClick={() => setAddType(addType === 'ipo' ? null : 'ipo')}>
          + IPO
        </button>
      </div>

      {addType === 'stock' && <AddStockForm onAdd={addItem} onCancel={() => setAddType(null)} />}
      {addType === 'mf' && <AddMfForm onAdd={addItem} onCancel={() => setAddType(null)} />}
      {addType === 'ipo' && <AddIpoForm onAdd={addItem} onCancel={() => setAddType(null)} />}

      {sorted.length === 0 && (
        <div className="empty-state" style={{ padding: '24px 16px' }}>
          <div className="empty-text">Your watchlist is empty. Add a stock, fund, or IPO to track.</div>
        </div>
      )}

      {sorted.map((item) => (
        <WatchlistRow
          key={item.id}
          item={item}
          quote={item.type === 'stock' ? quotes[item.symbol] : null}
          nav={item.type === 'mf' ? navs[item.schemeCode] : null}
          onDelete={() => removeItem(item.id)}
          onNote={(note) => updateNote(item.id, note)}
        />
      ))}
    </div>
  )
}

function WatchlistRow({ item, quote, nav, onDelete, onNote }) {
  const [editing, setEditing] = useState(false)
  const [noteText, setNoteText] = useState(item.note || '')
  const [confirmDelete, setConfirmDelete] = useState(false)

  function saveNote() {
    onNote(noteText.trim())
    setEditing(false)
  }

  const screenerUrl = item.type === 'stock'
    ? `https://www.screener.in/company/${item.symbol.replace(/\.(NS|BO)$/, '')}/`
    : null

  return (
    <div className="card" style={{ marginBottom: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
        <div>
          <div className="h3" style={{ fontSize: 15 }}>
            {screenerUrl ? <a href={screenerUrl} target="_blank" rel="noreferrer">{item.name}</a> : item.name}
          </div>
          <div className="meta">
            {item.type === 'stock' && item.symbol}
            {item.type === 'mf' && 'Mutual Fund'}
            {item.type === 'ipo' && `IPO · ${item.ipo?.open || '?'} – ${item.ipo?.close || '?'}`}
          </div>
        </div>

        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          {item.type === 'stock' && (
            quote ? (
              quote.error ? (
                <span className="meta">price unavailable</span>
              ) : (
                <>
                  <div style={{ fontWeight: 700 }}>{quote.price != null ? `₹${quote.price.toFixed(2)}` : '—'}</div>
                  {quote.changePct != null && (
                    <div className={quote.changePct >= 0 ? 'up' : 'down'} style={{ fontSize: 12 }}>
                      {quote.changePct >= 0 ? '+' : ''}{quote.changePct.toFixed(2)}%
                    </div>
                  )}
                  {quote.low52 != null && quote.high52 != null && (
                    <div className="meta" style={{ fontSize: 11 }}>52w ₹{quote.low52}–₹{quote.high52}</div>
                  )}
                </>
              )
            ) : <span className="meta">loading…</span>
          )}
          {item.type === 'mf' && (
            nav ? (
              nav.error ? <span className="meta">NAV unavailable</span> : (
                <>
                  <div style={{ fontWeight: 700 }}>₹{nav.nav}</div>
                  <div className="meta" style={{ fontSize: 11 }}>{nav.date}</div>
                </>
              )
            ) : <span className="meta">loading…</span>
          )}
          {item.type === 'ipo' && item.ipo?.priceBand && <div className="meta">₹{item.ipo.priceBand}</div>}
        </div>
      </div>

      {editing ? (
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <input
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            placeholder="Why are you watching this?"
            style={{ flex: 1 }}
            onKeyDown={(e) => e.key === 'Enter' && saveNote()}
          />
          <button className="btn btn-primary btn-sm" onClick={saveNote}>Save</button>
        </div>
      ) : item.note ? (
        <div className="meta" style={{ marginTop: 8, cursor: 'pointer' }} onClick={() => setEditing(true)}>{item.note}</div>
      ) : (
        <button className="btn btn-ghost btn-sm" style={{ marginTop: 8 }} onClick={() => setEditing(true)}>+ Add note</button>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
        {item.type === 'ipo' && item.ipo?.link ? (
          <a href={item.ipo.link} target="_blank" rel="noreferrer" className="meta">RHP / NSE page →</a>
        ) : <span />}
        {confirmDelete ? (
          <span style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-danger-ghost btn-sm" onClick={onDelete}>Confirm delete</button>
            <button className="btn btn-ghost btn-sm" onClick={() => setConfirmDelete(false)}>Cancel</button>
          </span>
        ) : (
          <button className="btn btn-danger-ghost btn-sm" onClick={() => setConfirmDelete(true)}>Delete</button>
        )}
      </div>
    </div>
  )
}

function AddStockForm({ onAdd, onCancel }) {
  const [symbol, setSymbol] = useState('')
  const [exch, setExch] = useState('NS')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit() {
    const sym = symbol.trim().toUpperCase()
    if (!sym) return
    const full = `${sym}.${exch}`
    setBusy(true)
    setError('')
    try {
      const r = await fetch(`/api/quote?symbols=${full}`)
      const data = await r.json()
      if (!data.quotes?.length) throw new Error(data.errors?.[0]?.error || data.error || 'Symbol not found')
      const q = data.quotes[0]
      await onAdd({ type: 'stock', symbol: full, name: q.name || sym })
      setSymbol('')
    } catch (e) {
      setError(String(e.message || e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card" style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          value={symbol}
          onChange={(e) => setSymbol(e.target.value)}
          placeholder="Symbol, e.g. RELIANCE"
          style={{ flex: 1 }}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
        />
        <select value={exch} onChange={(e) => setExch(e.target.value)}>
          <option value="NS">NSE</option>
          <option value="BO">BSE</option>
        </select>
      </div>
      {error && <div className="meta" style={{ color: 'var(--danger)', marginTop: 6 }}>{error}</div>}
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <button className="btn btn-primary btn-sm" disabled={!symbol.trim() || busy} onClick={submit}>
          {busy ? 'Checking…' : 'Add'}
        </button>
        <button className="btn btn-ghost btn-sm" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  )
}

function AddMfForm({ onAdd, onCancel }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const q = query.trim()
    if (q.length < 3) { setResults([]); return }
    const t = setTimeout(() => {
      setBusy(true)
      fetch(`https://api.mfapi.in/mf/search?q=${encodeURIComponent(q)}`)
        .then((r) => r.json())
        .then((data) => setResults((data || []).slice(0, 15)))
        .catch(() => setResults([]))
        .finally(() => setBusy(false))
    }, 400)
    return () => clearTimeout(t)
  }, [query])

  async function pick(scheme) {
    await onAdd({ type: 'mf', schemeCode: scheme.schemeCode, name: scheme.schemeName })
    setQuery('')
    setResults([])
  }

  return (
    <div className="card" style={{ marginBottom: 10 }}>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search a fund, e.g. Parag Parikh Flexi Cap"
        style={{ width: '100%' }}
      />
      {busy && <div className="meta" style={{ marginTop: 6 }}>Searching…</div>}
      {results.map((r) => (
        <button key={r.schemeCode} className="invest-mod-btn" style={{ marginTop: 6 }} onClick={() => pick(r)}>
          <span style={{ flex: 1, textAlign: 'left', fontSize: 13 }}>{r.schemeName}</span>
        </button>
      ))}
      <div style={{ marginTop: 10 }}>
        <button className="btn btn-ghost btn-sm" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  )
}

function AddIpoForm({ onAdd, onCancel }) {
  const [name, setName] = useState('')
  const [open, setOpen] = useState('')
  const [close, setClose] = useState('')
  const [priceBand, setPriceBand] = useState('')
  const [link, setLink] = useState('')

  async function submit() {
    if (!name.trim()) return
    await onAdd({ type: 'ipo', name: name.trim(), ipo: { open, close, priceBand: priceBand.trim(), link: link.trim() } })
    setName('')
    setOpen('')
    setClose('')
    setPriceBand('')
    setLink('')
  }

  return (
    <div className="card" style={{ marginBottom: 10 }}>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Company / IPO name" style={{ width: '100%', marginBottom: 8 }} />
      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        <input type="date" value={open} onChange={(e) => setOpen(e.target.value)} style={{ flex: 1 }} />
        <input type="date" value={close} onChange={(e) => setClose(e.target.value)} style={{ flex: 1 }} />
      </div>
      <input value={priceBand} onChange={(e) => setPriceBand(e.target.value)} placeholder="Price band, e.g. 96-101" style={{ width: '100%', marginBottom: 8 }} />
      <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="NSE/BSE/RHP link" style={{ width: '100%', marginBottom: 8 }} />
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn btn-primary btn-sm" disabled={!name.trim()} onClick={submit}>Add</button>
        <button className="btn btn-ghost btn-sm" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  )
}
