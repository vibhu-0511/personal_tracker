import { useEffect, useMemo, useState } from 'react'
import { loadPuzzles } from '../puzzles.js'
import { getPuzzleProgress, savePuzzleProgress } from '../store.js'
import { useHydrate } from '../useHydrate.js'

const DIFFICULTIES = ['easy', 'medium', 'hard']

const DIFF_COLORS = {
  easy: 'var(--success)',
  medium: 'var(--warn)',
  hard: 'var(--danger)',
}

function shuffleDaily(arr, seed) {
  const copy = [...arr]
  let s = seed
  for (let i = copy.length - 1; i > 0; i--) {
    s = (s * 9301 + 49297) % 233280
    const j = s % (i + 1)
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

export default function Puzzles({ syncTick = 0 }) {
  const [puzzle, setPuzzle] = useState(null)
  const [puzzleError, setPuzzleError] = useState('')
  const [puzzles, setPuzzles] = useState([])
  const [category, setCategory] = useState('all')
  const [difficulty, setDifficulty] = useState('all')
  const [expanded, setExpanded] = useState({})
  const [showHint, setShowHint] = useState({})
  const [progress, setProgress] = useState({})

  useEffect(() => {
    fetch('/api/puzzle')
      .then((r) => r.json())
      .then((j) => (j.error ? setPuzzleError(j.error) : setPuzzle(j)))
      .catch((e) => setPuzzleError(e.message))
  }, [])

  useEffect(() => {
    loadPuzzles().then(setPuzzles)
  }, [])

  const categories = useMemo(() => [...new Set(puzzles.map((p) => p.category))].sort(), [puzzles])

  const { error: progressError } = useHydrate([() => getPuzzleProgress().then(setProgress)], [syncTick])

  const daySeed = Math.floor(Date.now() / 86400000)
  const filtered = puzzles.filter((p) => {
    if (category !== 'all' && p.category !== category) return false
    if (difficulty !== 'all' && p.difficulty !== difficulty) return false
    return true
  })
  // "Today's Picks" is seeded from the full bank, not the filtered view, so
  // changing category/difficulty filters doesn't change what "today" means.
  const daily = shuffleDaily(puzzles, daySeed).slice(0, 5)

  function toggleExpand(id) {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  function toggleHint(id) {
    setShowHint((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  function toggleSolved(id) {
    const next = { ...progress, [id]: !progress[id] }
    setProgress(next)
    savePuzzleProgress(next)
  }

  return (
    <div className="fade-in">
      {/* Lichess daily */}
      {puzzleError && <div className="banner-warn">Chess puzzle: {puzzleError}</div>}
      {progressError && <div className="banner-warn">Couldn't load your puzzle progress: {progressError}</div>}
      {!puzzle && !puzzleError && (
        <div className="loading">
          <span className="loading-dot" /><span className="loading-dot" /><span className="loading-dot" />
          Loading daily chess puzzle...
        </div>
      )}
      {puzzle && (
        <div className="puzzle-card">
          <div className="puzzle-icon">♟️</div>
          <div style={{ flex: 1 }}>
            <a className="puzzle-link" href={puzzle.url} target="_blank" rel="noreferrer">
              Daily Chess Puzzle
            </a>
            <div className="meta">
              Rating {puzzle.rating} · {puzzle.themes.slice(0, 3).join(', ')}
            </div>
          </div>
          <span className="meta" style={{ fontSize: 20 }}>→</span>
        </div>
      )}

      {/* Filters */}
      <div className="section-header">
        <span className="section-title">Today's Picks</span>
        <span className="meta">{daily.length} picks</span>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 12, overflowX: 'auto' }}>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          style={{ flex: 1, fontSize: 13 }}
        >
          <option value="all">All categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <select
          value={difficulty}
          onChange={(e) => setDifficulty(e.target.value)}
          style={{ flex: 1, fontSize: 13 }}
        >
          <option value="all">All levels</option>
          {DIFFICULTIES.map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
      </div>

      {/* Puzzle cards */}
      {daily.length === 0 && (
        <div className="empty-state">
          <div className="empty-icon">🧩</div>
          <div className="empty-text">No puzzles match your filters.</div>
        </div>
      )}

      {daily.map((p) => (
        <div className="card" key={p.id}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
            <div style={{ flex: 1 }}>
              <div className="h3" style={{ marginBottom: 4 }}>{p.title}</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                <span
                  className="chip"
                  style={{
                    background: `color-mix(in srgb, ${DIFF_COLORS[p.difficulty]} 15%, transparent)`,
                    color: DIFF_COLORS[p.difficulty],
                  }}
                >
                  {p.difficulty}
                </span>
                <span className="chip chip-muted">{p.category}</span>
                <span className="meta">{p.source}</span>
              </div>
            </div>
            <button
              className={`btn btn-sm${progress[p.id] ? ' btn-success' : ''}`}
              onClick={() => toggleSolved(p.id)}
              style={{ flexShrink: 0 }}
              title={progress[p.id] ? 'Solved (tap to unmark)' : 'Mark solved'}
            >
              {progress[p.id] ? '✓' : '☐'}
            </button>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => toggleExpand(p.id)}
              style={{ flexShrink: 0 }}
            >
              {expanded[p.id] ? '▲' : '▼'}
            </button>
          </div>

          {expanded[p.id] && (
            <div style={{ marginTop: 12 }} className="fade-in">
              <div className="note-body" style={{ marginBottom: 10 }}>{p.description}</div>

              {p.hint && (
                <div style={{ marginBottom: 8 }}>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => toggleHint(p.id)}
                    style={{ padding: '4px 8px', fontSize: 12 }}
                  >
                    {showHint[p.id] ? '🔓 Hint' : '🔒 Show hint'}
                  </button>
                  {showHint[p.id] && (
                    <div className="meta" style={{ marginTop: 6, fontStyle: 'italic' }}>
                      {p.hint}
                    </div>
                  )}
                </div>
              )}

              {p.solution && (
                <details style={{ marginTop: 4 }}>
                  <summary className="meta" style={{ cursor: 'pointer' }}>Show solution</summary>
                  <div className="small" style={{ marginTop: 6, padding: '8px 12px', background: 'var(--bg)', borderRadius: 'var(--radius-xs)' }}>
                    {p.solution}
                  </div>
                </details>
              )}

              {p.url && (
                <a
                  href={p.url}
                  target="_blank"
                  rel="noreferrer"
                  className="btn btn-sm"
                  style={{ marginTop: 10, display: 'inline-flex', textDecoration: 'none' }}
                >
                  Open source →
                </a>
              )}
            </div>
          )}
        </div>
      ))}

      {/* Browse all */}
      <div className="section-header" style={{ marginTop: 8 }}>
        <span className="section-title">Browse All ({filtered.length})</span>
      </div>

      {filtered
        .filter((p) => !daily.some((d) => d.id === p.id))
        .map((p) => (
          <div className="card" key={p.id} style={{ padding: '12px 14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <span className="h3" style={{ fontSize: 14 }}>{p.title}</span>
                <div style={{ display: 'flex', gap: 4, marginTop: 2 }}>
                  <span
                    className="chip"
                    style={{
                      fontSize: 11,
                      padding: '1px 8px',
                      background: `color-mix(in srgb, ${DIFF_COLORS[p.difficulty]} 15%, transparent)`,
                      color: DIFF_COLORS[p.difficulty],
                    }}
                  >
                    {p.difficulty}
                  </span>
                  <span className="chip chip-muted" style={{ fontSize: 11, padding: '1px 8px' }}>{p.category}</span>
                </div>
              </div>
              <button
                className={`btn btn-sm${progress[p.id] ? ' btn-success' : ''}`}
                onClick={() => toggleSolved(p.id)}
                title={progress[p.id] ? 'Solved (tap to unmark)' : 'Mark solved'}
              >
                {progress[p.id] ? '✓' : '☐'}
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => toggleExpand(p.id)}>
                {expanded[p.id] ? '▲' : '▼'}
              </button>
            </div>

            {expanded[p.id] && (
              <div style={{ marginTop: 10 }} className="fade-in">
                <div className="note-body" style={{ marginBottom: 8 }}>{p.description}</div>
                {p.hint && (
                  <div style={{ marginBottom: 6 }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => toggleHint(p.id)} style={{ padding: '4px 8px', fontSize: 12 }}>
                      {showHint[p.id] ? '🔓 Hint' : '🔒 Show hint'}
                    </button>
                    {showHint[p.id] && <div className="meta" style={{ marginTop: 4, fontStyle: 'italic' }}>{p.hint}</div>}
                  </div>
                )}
                {p.solution && (
                  <details>
                    <summary className="meta" style={{ cursor: 'pointer' }}>Show solution</summary>
                    <div className="small" style={{ marginTop: 6, padding: '8px 12px', background: 'var(--bg)', borderRadius: 'var(--radius-xs)' }}>{p.solution}</div>
                  </details>
                )}
                {p.url && (
                  <a href={p.url} target="_blank" rel="noreferrer" className="btn btn-sm" style={{ marginTop: 8, display: 'inline-flex', textDecoration: 'none' }}>
                    Open source →
                  </a>
                )}
              </div>
            )}
          </div>
        ))}

      {/* Source links */}
      <div className="card" style={{ marginTop: 12, textAlign: 'center' }}>
        <div className="meta" style={{ marginBottom: 8 }}>More puzzle sources</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
          <a href="https://www.puzzledquant.com/" target="_blank" rel="noreferrer" className="btn btn-sm" style={{ textDecoration: 'none' }}>PuzzledQuant</a>
          <a href="https://www.janestreet.com/puzzles/" target="_blank" rel="noreferrer" className="btn btn-sm" style={{ textDecoration: 'none' }}>Jane Street</a>
          <a href="https://puzzles.nigelcoldwell.co.uk/" target="_blank" rel="noreferrer" className="btn btn-sm" style={{ textDecoration: 'none' }}>Nigel Coldwell</a>
          <a href="https://www.reddit.com/r/mathriddles/" target="_blank" rel="noreferrer" className="btn btn-sm" style={{ textDecoration: 'none' }}>r/mathriddles</a>
        </div>
      </div>
    </div>
  )
}
