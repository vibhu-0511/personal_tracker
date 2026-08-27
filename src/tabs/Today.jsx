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

  return (
    <div>
      <div className="card">
        <strong>Solved today: {solvedToday(progress)}</strong>
        {cf && (
          <div className="muted">
            Rating {cf.rating ?? 'unrated'} · least-practiced: {weak[0]} ({weak[1]} solved)
          </div>
        )}
      </div>

      <div className="card">
        <strong>Daily puzzle</strong>
        {puzzleError && <div className="err">Could not load puzzle: {puzzleError}</div>}
        {!puzzle && !puzzleError && <div className="muted">Loading…</div>}
        {puzzle && (
          <div>
            <div className="muted">
              Rating {puzzle.rating} · {puzzle.themes.slice(0, 3).join(', ')}
            </div>
            <a href={puzzle.url} target="_blank" rel="noreferrer">
              Solve on Lichess →
            </a>
          </div>
        )}
      </div>

      <strong>Problems for you</strong>
      {!cfHandle && (
        <div className="card muted">Set your Codeforces handle in Settings to see problems.</div>
      )}
      {cfError && <div className="card err">Could not load problems: {cfError}</div>}
      {cfHandle && !cf && !cfError && <div className="card muted">Loading…</div>}
      {cf &&
        cf.problems.map((p) => {
          const state = progress[p.id]
          return (
            <div className="card" key={p.id}>
              <a href={p.url} target="_blank" rel="noreferrer">
                {p.name}
              </a>
              <div className="muted">
                {p.rating} · {p.tags.slice(0, 3).join(', ')}
              </div>
              <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
                <button className="act" onClick={() => mark(p, 'solved')}>Solved</button>
                <button className="act" onClick={() => mark(p, 'skipped')}>Skip</button>
                {state && <span className="muted">{state.status}</span>}
              </div>
            </div>
          )
        })}
    </div>
  )
}
