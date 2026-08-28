import { useEffect, useState } from 'react'
import { getProgress, markProblem } from '../store.js'

const CORE_TAGS = [
  'dp', 'graphs', 'greedy', 'math', 'data structures',
  'binary search', 'strings', 'trees', 'dfs and similar', 'sortings',
]

function leastPracticedTag(tagCounts) {
  const ranked = CORE_TAGS
    .map((t) => [t, tagCounts[t] || 0])
    .sort((a, b) => a[1] - b[1])
  return ranked[0]
}

function solvedToday(progress) {
  const start = new Date().setHours(0, 0, 0, 0)
  return Object.values(progress).filter(
    (p) => p.status === 'solved' && p.updatedAt >= start
  ).length
}

export default function Today({ cfHandle }) {
  const [cf, setCf] = useState(null)
  const [cfError, setCfError] = useState('')
  const [puzzle, setPuzzle] = useState(null)
  const [puzzleError, setPuzzleError] = useState('')
  const [progress, setProgress] = useState({})

  useEffect(() => {
    getProgress().then(setProgress)
    fetch('/api/puzzle')
      .then((r) => r.json())
      .then((j) => (j.error ? setPuzzleError(j.error) : setPuzzle(j)))
      .catch((e) => setPuzzleError(e.message))
  }, [])

  useEffect(() => {
    setCf(null)
    setCfError('')
    if (!cfHandle) return
    fetch(`/api/cf?handle=${encodeURIComponent(cfHandle)}`)
      .then((r) => r.json())
      .then((j) => (j.error ? setCfError(j.error) : setCf(j)))
      .catch((e) => setCfError(e.message))
  }, [cfHandle])

  async function mark(problem, status) {
    setProgress(await markProblem(problem.id, status, problem.tags))
  }

  const weak = cf ? leastPracticedTag(cf.tagCounts) : null
  const todayCount = solvedToday(progress)

  return (
    <div className="fade-in">
      {/* Stats row */}
      <div className="stat-row">
        <div className="stat-card">
          <div className="stat-value" style={{ color: todayCount > 0 ? 'var(--success)' : 'var(--text-tertiary)' }}>
            {todayCount}
          </div>
          <div className="stat-label">Solved today</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: 'var(--accent)' }}>
            {cf ? (cf.rating ?? '—') : '—'}
          </div>
          <div className="stat-label">CF Rating</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: 'var(--warn)', fontSize: 16 }}>
            {weak ? weak[0] : '—'}
          </div>
          <div className="stat-label">Least practiced</div>
        </div>
      </div>

      {/* Daily puzzle */}
      {puzzleError && <div className="banner-warn">Puzzle: {puzzleError}</div>}
      {!puzzle && !puzzleError && (
        <div className="loading">
          <span className="loading-dot" /><span className="loading-dot" /><span className="loading-dot" />
          Loading daily puzzle...
        </div>
      )}
      {puzzle && (
        <div className="puzzle-card">
          <div className="puzzle-icon">♟️</div>
          <div style={{ flex: 1 }}>
            <a className="puzzle-link" href={puzzle.url} target="_blank" rel="noreferrer">
              Daily Puzzle
            </a>
            <div className="meta">
              Rating {puzzle.rating} · {puzzle.themes.slice(0, 3).join(', ')}
            </div>
          </div>
          <span className="meta" style={{ fontSize: 20 }}>→</span>
        </div>
      )}

      {/* Problems */}
      <div className="section-header">
        <span className="section-title">
          {cf ? `${cf.problems.length} problems for you` : 'Problems'}
        </span>
      </div>

      {!cfHandle && (
        <div className="empty-state">
          <div className="empty-icon">🎯</div>
          <div className="empty-text">Set your Codeforces handle in Settings to see adaptive problems.</div>
        </div>
      )}
      {cfError && <div className="banner-warn">{cfError}</div>}
      {cfHandle && !cf && !cfError && (
        <div className="loading">
          <span className="loading-dot" /><span className="loading-dot" /><span className="loading-dot" />
          Fetching problems...
        </div>
      )}
      {cf && cf.problems.map((p) => {
        const state = progress[p.id]
        return (
          <div className="card" key={p.id}>
            <div className="problem-card">
              <div className="problem-info">
                <a className="problem-name" href={p.url} target="_blank" rel="noreferrer">
                  {p.name}
                </a>
                <div className="meta" style={{ marginTop: 2 }}>
                  {p.rating}
                  <span style={{ margin: '0 4px', opacity: 0.3 }}>·</span>
                  {p.tags.slice(0, 3).map((t) => (
                    <span className="chip chip-muted" key={t} style={{ marginRight: 4 }}>{t}</span>
                  ))}
                </div>
              </div>
              <div className="problem-actions">
                {state ? (
                  <span className={`status-badge ${state.status}`}>{state.status}</span>
                ) : (
                  <>
                    <button className="btn btn-success btn-sm" onClick={() => mark(p, 'solved')}>✓</button>
                    <button className="btn btn-sm" onClick={() => mark(p, 'skipped')}>Skip</button>
                  </>
                )}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
