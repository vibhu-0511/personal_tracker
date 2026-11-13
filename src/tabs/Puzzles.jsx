import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { loadPuzzles } from '../puzzles.js'
import { getPuzzleProgress, savePuzzleProgress } from '../store.js'
import { useHydrate } from '../useHydrate.js'
import { fetchJson, isCancelled } from '../logic/apiClient.js'
import { localDaySeed, shuffleDaily } from '../logic/stats.js'
import { useSplit } from '../logic/useSplit.js'
import Sheet from '../Sheet.jsx'
import Row from '../ui/Row.jsx'
import Check from '../ui/Check.jsx'
import Chip from '../ui/Chip.jsx'
import '../logic/logic.css'
import '../logic/puzzles.css'

const DIFFICULTIES = ['easy', 'medium', 'hard']
const DIFF_TONE = { easy: 'success', medium: 'warn', hard: 'hot' }
const PICKS = 5

const SOURCES = [
  ['PuzzledQuant', 'https://www.puzzledquant.com/'],
  ['Jane Street', 'https://www.janestreet.com/puzzles/'],
  ['Nigel Coldwell', 'https://puzzles.nigelcoldwell.co.uk/'],
  ['r/mathriddles', 'https://www.reddit.com/r/mathriddles/'],
]

// The one row used for both Today's Picks and Browse All. Memoised with stable
// callbacks from the parent so toggling one puzzle re-renders one row, not 145.
export const PuzzleRow = memo(function PuzzleRow({ puzzle, solved, selected, onSelect, onToggleSolved }) {
  const { id, title, difficulty, category, source } = puzzle
  return (
    <Row
      className="pz-row"
      dense
      selected={selected}
      done={solved}
      onSelect={() => onSelect(id)}
      lead={
        <Check
          checked={solved}
          onChange={() => onToggleSolved(id)}
          label={solved ? `Solved: ${title} (unmark)` : `Mark ${title} solved`}
        />
      }
      title={title}
      sub={source ? `${category} · ${source}` : category}
      trail={<Chip tone={DIFF_TONE[difficulty] || 'muted'}>{difficulty}</Chip>}
    />
  )
})

function PuzzleDetail({ puzzle, solved, onToggleSolved, onClose }) {
  const [hintOpen, setHintOpen] = useState(false)
  const { id, title, difficulty, category, source, description, hint, solution, url } = puzzle
  return (
    <div className="pz-detail fade-in">
      <div className="pz-detail-head">
        <h2 className="h3 pz-detail-title">{title}</h2>
        {onClose && (
          <button type="button" className="inspector-close" onClick={onClose} aria-label="Close">×</button>
        )}
      </div>
      <div className="pz-detail-chips">
        <Chip tone={DIFF_TONE[difficulty] || 'muted'}>{difficulty}</Chip>
        <Chip tone="muted">{category}</Chip>
        {source && <span className="meta">{source}</span>}
      </div>

      <div className="note-body pz-detail-desc">{description}</div>

      {hint && (
        <div className="pz-detail-block">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            aria-expanded={hintOpen}
            onClick={() => setHintOpen((v) => !v)}
          >
            {hintOpen ? '🔓 Hint' : '🔒 Show hint'}
          </button>
          {hintOpen && <div className="meta pz-hint">{hint}</div>}
        </div>
      )}

      {solution && (
        <details className="pz-detail-block">
          <summary className="meta pz-summary">Show solution</summary>
          <div className="small pz-solution">{solution}</div>
        </details>
      )}

      <div className="pz-detail-actions">
        <button
          type="button"
          className={`btn btn-sm${solved ? ' btn-success' : ''}`}
          role="switch"
          aria-checked={solved}
          onClick={() => onToggleSolved(id)}
        >
          {solved ? '✓ Solved' : '☐ Mark solved'}
        </button>
        {url && (
          <a href={url} target="_blank" rel="noreferrer" className="btn btn-sm pz-link">
            Open source →
          </a>
        )}
      </div>
    </div>
  )
}

function LichessDaily({ state, onRetry }) {
  if (state.status === 'loading') {
    return (
      <div className="loading" role="status">
        <span className="loading-dot" /><span className="loading-dot" /><span className="loading-dot" />
        Loading daily chess puzzle...
      </div>
    )
  }
  if (state.status === 'error') {
    return (
      <div className="banner-warn pz-banner" role="alert">
        <span>Chess puzzle: {state.message}</span>
        <button type="button" className="btn btn-sm" onClick={onRetry}>Retry</button>
      </div>
    )
  }
  const p = state.data
  const themes = Array.isArray(p.themes) ? p.themes.slice(0, 3).join(', ') : ''
  return (
    <div className="puzzle-card">
      <div className="puzzle-icon">♟️</div>
      <div className="pz-grow">
        <a className="puzzle-link" href={p.url} target="_blank" rel="noreferrer">Daily Chess Puzzle</a>
        <div className="meta">Rating {p.rating}{themes ? ` · ${themes}` : ''}</div>
      </div>
      <span className="meta pz-arrow">→</span>
    </div>
  )
}

// `fetchDaily` and `loadBank` are injectable so tests can run without a network.
export default function Puzzles({
  syncTick = 0,
  onChange,
  fetchDaily = fetchJson,
  loadBank = loadPuzzles,
}) {
  const rootRef = useRef(null)
  const split = useSplit(rootRef)

  const [daily, setDaily] = useState({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const [puzzles, setPuzzles] = useState([])
  const [bankError, setBankError] = useState('')
  const [saveError, setSaveError] = useState('')
  const [category, setCategory] = useState('all')
  const [difficulty, setDifficulty] = useState('all')
  const [selectedId, setSelectedId] = useState(null)
  const [progress, setProgress] = useState({})
  const progressRef = useRef(progress)
  progressRef.current = progress

  // Lichess daily: loading -> ok | error (with Retry). Aborted on unmount so the
  // StrictMode double mount does not leave a stale request behind.
  useEffect(() => {
    const ctrl = new AbortController()
    setDaily({ status: 'loading' })
    fetchDaily('/api/puzzle', { signal: ctrl.signal })
      .then((j) => {
        if (isCancelled(j)) return
        if (j && j.error) setDaily({ status: 'error', message: String(j.error) })
        else setDaily({ status: 'ok', data: j })
      })
      .catch((e) => {
        if (ctrl.signal.aborted) return
        setDaily({ status: 'error', message: e?.message || 'Could not load the daily puzzle.' })
      })
    return () => ctrl.abort()
  }, [attempt, fetchDaily])
  const retryDaily = useCallback(() => setAttempt((n) => n + 1), [])

  useEffect(() => {
    let alive = true
    Promise.resolve()
      .then(loadBank)
      .then((list) => { if (alive) setPuzzles(Array.isArray(list) ? list : []) })
      .catch((e) => { if (alive) setBankError(e?.message || 'Failed to load puzzles') })
    return () => { alive = false }
  }, [loadBank])

  const { error: progressError } = useHydrate([() => getPuzzleProgress().then(setProgress)], [syncTick])

  const categories = useMemo(() => [...new Set(puzzles.map((p) => p.category))].sort(), [puzzles])

  // Today's Picks depend only on the bank and the local day, never on filters.
  const picks = useMemo(
    () => shuffleDaily(puzzles, localDaySeed()).slice(0, PICKS),
    [puzzles]
  )
  const pickIds = useMemo(() => new Set(picks.map((p) => p.id)), [picks])

  const browse = useMemo(
    () => puzzles.filter((p) => (
      !pickIds.has(p.id)
      && (category === 'all' || p.category === category)
      && (difficulty === 'all' || p.difficulty === difficulty)
    )),
    [puzzles, pickIds, category, difficulty]
  )

  const selected = useMemo(
    () => (selectedId == null ? null : puzzles.find((p) => p.id === selectedId) || null),
    [puzzles, selectedId]
  )

  const select = useCallback((id) => setSelectedId(id), [])
  const closeSelected = useCallback(() => setSelectedId(null), [])

  const toggleSolved = useCallback((id) => {
    const prev = progressRef.current
    const next = { ...prev, [id]: !prev[id] }
    progressRef.current = next
    setProgress(next)
    setSaveError('')
    savePuzzleProgress(next)
      .then(() => onChange?.())
      .catch((e) => {
        progressRef.current = prev
        setProgress(prev)
        setSaveError(e?.message || 'Failed to save')
      })
  }, [onChange])

  const renderRow = (p) => (
    <PuzzleRow
      key={p.id}
      puzzle={p}
      solved={!!progress[p.id]}
      selected={p.id === selectedId}
      onSelect={select}
      onToggleSolved={toggleSolved}
    />
  )

  const detail = selected && (
    <PuzzleDetail
      key={selected.id}
      puzzle={selected}
      solved={!!progress[selected.id]}
      onToggleSolved={toggleSolved}
      onClose={split ? null : closeSelected}
    />
  )

  return (
    <div className="fade-in" ref={rootRef}>
      {bankError && <div className="banner-warn">Couldn't load the puzzle bank: {bankError}</div>}
      {progressError && <div className="banner-warn">Couldn't load your puzzle progress: {progressError}</div>}
      {saveError && <div className="banner-warn" role="alert">Couldn't save your progress: {saveError}</div>}

      <div className="logic-split">
        <div className="logic-list">
          <LichessDaily state={daily} onRetry={retryDaily} />

          <div className="section-header">
            <span className="section-title">Today's Picks</span>
            <span className="meta">{picks.length} picks</span>
          </div>
          <ul className="pz-list">{picks.map(renderRow)}</ul>

          <div className="section-header pz-browse-head">
            <span className="section-title">Browse All ({browse.length})</span>
          </div>
          <div className="pz-filters">
            <select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Category">
              <option value="all">All categories</option>
              {categories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <select value={difficulty} onChange={(e) => setDifficulty(e.target.value)} aria-label="Difficulty">
              <option value="all">All levels</option>
              {DIFFICULTIES.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>

          {puzzles.length > 0 && browse.length === 0 && (
            <div className="empty-state">
              <div className="empty-icon">🧩</div>
              <div className="empty-text">No puzzles match your filters.</div>
            </div>
          )}
          <ul className="pz-list">{browse.map(renderRow)}</ul>

          <div className="card pz-sources">
            <div className="meta">More puzzle sources</div>
            <div className="pz-source-links">
              {SOURCES.map(([label, href]) => (
                <a key={href} href={href} target="_blank" rel="noreferrer" className="btn btn-sm pz-link">{label}</a>
              ))}
            </div>
          </div>
        </div>

        {split && (
          <aside className="logic-inspector card" aria-label="Puzzle details">
            {detail || <div className="logic-empty">Select a puzzle to see its details.</div>}
          </aside>
        )}
      </div>

      {!split && (
        <Sheet open={!!selected} onClose={closeSelected} variant="side">
          {detail}
        </Sheet>
      )}
    </div>
  )
}
