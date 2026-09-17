import { useEffect, useState } from 'react'
import { getProgress, markProblem } from '../store.js'
import { useHydrate } from '../useHydrate.js'

const ALL_TAGS = [
  'dp', 'graphs', 'greedy', 'math', 'data structures', 'binary search',
  'strings', 'trees', 'dfs and similar', 'sortings', 'implementation',
  'constructive algorithms', 'brute force', 'number theory', 'geometry',
  'combinatorics', 'two pointers', 'bitmasks', 'probabilities', 'hashing',
  'games', 'divide and conquer', 'flows', 'interactive',
]

const CORE_TAGS = [
  'dp', 'graphs', 'greedy', 'math', 'data structures',
  'binary search', 'strings', 'trees', 'dfs and similar', 'sortings',
]

function leastPracticedTag(tagCounts) {
  return CORE_TAGS
    .map((t) => [t, tagCounts[t] || 0])
    .sort((a, b) => a[1] - b[1])[0]
}

export function solvedToday(progress) {
  const start = new Date().setHours(0, 0, 0, 0)
  return Object.values(progress).filter(
    (p) => p.status === 'solved' && p.updatedAt >= start
  ).length
}

function buildUrl(handle, filters) {
  const params = new URLSearchParams({ handle })
  if (filters.ratingMin) params.set('ratingMin', filters.ratingMin)
  if (filters.ratingMax) params.set('ratingMax', filters.ratingMax)
  if (filters.tags.length) params.set('tags', filters.tags.join(','))
  if (filters.page) params.set('page', filters.page)
  return `/api/cf?${params}`
}

export default function Today({ cfHandle, syncTick = 0 }) {
  const [cf, setCf] = useState(null)
  const [cfError, setCfError] = useState('')
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState({})
  const [showFilter, setShowFilter] = useState(false)
  const [page, setPage] = useState(0)

  const [ratingMin, setRatingMin] = useState('')
  const [ratingMax, setRatingMax] = useState('')
  const [selectedTags, setSelectedTags] = useState([])

  const { error: progressError } = useHydrate([() => getProgress().then(setProgress)], [syncTick])

  function fetchProblems(filters) {
    if (!cfHandle) return
    setCf(null)
    setCfError('')
    setLoading(true)
    fetch(buildUrl(cfHandle, filters))
      .then((r) => r.json())
      .then((j) => (j.error ? setCfError(j.error) : setCf(j)))
      .catch((e) => setCfError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    fetchProblems({ ratingMin: '', ratingMax: '', tags: [], page: 0 })
  }, [cfHandle])

  function applyFilter() {
    setPage(0)
    fetchProblems({ ratingMin, ratingMax, tags: selectedTags, page: 0 })
    setShowFilter(false)
  }

  function resetFilter() {
    setRatingMin('')
    setRatingMax('')
    setSelectedTags([])
    setPage(0)
    fetchProblems({ ratingMin: '', ratingMax: '', tags: [], page: 0 })
    setShowFilter(false)
  }

  function changePage(newPage) {
    setPage(newPage)
    fetchProblems({ ratingMin, ratingMax, tags: selectedTags, page: newPage })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function toggleTag(tag) {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    )
  }

  async function mark(problem, status) {
    setProgress(await markProblem(problem.id, status, problem.tags))
  }

  const weak = cf ? leastPracticedTag(cf.tagCounts) : null
  const todayCount = solvedToday(progress)
  const hasFilter = ratingMin || ratingMax || selectedTags.length > 0

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

      {/* Filter toggle */}
      {cfHandle && (
        <button
          className={`cf-filter-toggle${hasFilter ? ' active' : ''}`}
          onClick={() => setShowFilter((v) => !v)}
        >
          <span>{showFilter ? '▲' : '▼'}</span>
          {' '}Filter Problems
          {hasFilter && <span className="cf-filter-badge">ON</span>}
        </button>
      )}

      {/* Filter panel */}
      {showFilter && (
        <div className="card cf-filter-panel">
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12 }}>
            <label className="meta" style={{ whiteSpace: 'nowrap' }}>Difficulty:</label>
            <input
              type="number"
              value={ratingMin}
              onChange={(e) => setRatingMin(e.target.value)}
              placeholder="800"
              style={{ width: 80, textAlign: 'center' }}
              step="100"
            />
            <span className="meta">—</span>
            <input
              type="number"
              value={ratingMax}
              onChange={(e) => setRatingMax(e.target.value)}
              placeholder="3500"
              style={{ width: 80, textAlign: 'center' }}
              step="100"
            />
          </div>
          <div className="meta" style={{ marginBottom: 6 }}>Tags:</div>
          <div className="cf-tag-grid">
            {ALL_TAGS.map((tag) => (
              <button
                key={tag}
                className={`cf-tag-chip${selectedTags.includes(tag) ? ' active' : ''}`}
                onClick={() => toggleTag(tag)}
              >
                {tag}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button className="btn btn-primary btn-sm" onClick={applyFilter}>Apply</button>
            <button className="btn btn-ghost btn-sm" onClick={resetFilter}>Reset</button>
          </div>
        </div>
      )}

      {/* Problems header */}
      <div className="section-header">
        <span className="section-title">
          {cf ? `${cf.total} problems` : 'Problems'}
        </span>
        {cf && cf.total > 20 && (
          <span className="meta">Page {(cf.page || 0) + 1} of {Math.ceil(cf.total / 20)}</span>
        )}
      </div>

      {!cfHandle && (
        <div className="empty-state">
          <div className="empty-icon">🎯</div>
          <div className="empty-text">Set your Codeforces handle in Settings to see adaptive problems.</div>
        </div>
      )}
      {cfError && <div className="banner-warn">{cfError}</div>}
      {progressError && <div className="banner-warn">Couldn't load your solved progress: {progressError}</div>}
      {loading && (
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

      {/* Pagination */}
      {cf && (cf.hasMore || page > 0) && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, padding: '12px 0' }}>
          {page > 0 && (
            <button className="btn btn-sm" onClick={() => changePage(page - 1)}>← Prev</button>
          )}
          <span className="meta" style={{ alignSelf: 'center' }}>
            Page {page + 1}{cf.total > 20 ? ` / ${Math.ceil(cf.total / 20)}` : ''}
          </span>
          {cf.hasMore && (
            <button className="btn btn-sm btn-primary" onClick={() => changePage(page + 1)}>Next →</button>
          )}
        </div>
      )}
    </div>
  )
}
