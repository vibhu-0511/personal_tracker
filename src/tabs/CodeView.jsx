import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { getProgress, markProblem } from '../store.js'
import { useHydrate } from '../useHydrate.js'
import { useLatest } from '../useLatest.js'
import { useSplit } from '../logic/useSplit.js'
import { fetchJson, isCancelled } from '../logic/apiClient.js'
import { rememberCfRating } from '../logic/tileData.js'
import { solvedToday } from '../logic/stats.js'
import Sheet from '../Sheet.jsx'
import Bar from '../ui/Bar.jsx'
import '../logic/logic.css'
import '../logic/code.css'

// The header glance owns "Solved today"; LogicBuilding still imports it from here.
export { solvedToday }

const PAGE_SIZE = 20

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

const EMPTY_FILTERS = Object.freeze({ ratingMin: '', ratingMax: '', tags: [], page: 0 })
const NO_HANDLE_MESSAGE = 'Set your Codeforces handle in Settings to see adaptive problems.'

export function leastPracticedTag(tagCounts) {
  const counts = tagCounts || {}
  return CORE_TAGS
    .map((t) => [t, counts[t] || 0])
    .sort((a, b) => a[1] - b[1])[0]
}

export function buildUrl(handle, filters) {
  const params = new URLSearchParams({ handle })
  if (filters.ratingMin) params.set('ratingMin', filters.ratingMin)
  if (filters.ratingMax) params.set('ratingMax', filters.ratingMax)
  if (filters.tags.length) params.set('tags', filters.tags.join(','))
  if (filters.page) params.set('page', filters.page)
  return `/api/cf?${params}`
}

// Banner text for a failed load. FetchJsonError kinds (apiClient.js): offline,
// timeout, server, client, parse. A 502 carries Codeforces' own comment.
export function describeError(err) {
  const msg = (err && err.message) || 'Could not load problems.'
  if (/not found/i.test(msg) && err?.kind !== 'offline') {
    return `${msg.replace(/[.\s]+$/, '')}. Check your handle in Settings.`
  }
  return msg
}

// Latest-wins gate: only the most recently issued ticket is current, so a
// response for a superseded filter/page/handle is ignored.
export function createRequestGate() {
  let latest = 0
  return {
    next: () => ++latest,
    isCurrent: (ticket) => ticket === latest,
    invalidate: () => { latest++ },
  }
}

function isTypingTarget(el) {
  if (!el || !el.tagName) return false
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable === true
}

function rowSelector(id) {
  return `[data-problem-id="${String(id).replace(/["\\]/g, '\\$&')}"]`
}

// Keep a row inside its own scroll pane without moving the window.
function revealInPane(pane, row) {
  if (!pane || !row) return
  const top = row.offsetTop - pane.offsetTop
  const bottom = top + row.offsetHeight
  if (top < pane.scrollTop) pane.scrollTop = top
  else if (bottom > pane.scrollTop + pane.clientHeight) pane.scrollTop = bottom - pane.clientHeight
}

function TagBars({ tags, tagCounts }) {
  const counts = tagCounts || {}
  const max = Math.max(1, ...Object.values(counts).filter(Number.isFinite))
  if (!tags.length) return null
  return (
    <ul className="code-tagbars" aria-label="Solved per tag">
      {tags.map((t) => {
        const n = counts[t] || 0
        return (
          <li key={t}>
            <div className="code-tagbar-head">
              <span>{t}</span>
              <span className="code-tagbar-count">{n} solved</span>
            </div>
            <Bar value={(n / max) * 100} label={`${t}: ${n} solved`} />
          </li>
        )
      })}
    </ul>
  )
}

function Glance({ rating, weak }) {
  return (
    <p className="meta">
      CF rating <strong>{rating ?? '—'}</strong>
      {weak && <> · least practiced <strong>{weak[0]}</strong></>}
    </p>
  )
}

const KEYS_HINT = (
  <p className="code-keys"><kbd>j</kbd>/<kbd>k</kbd> move · <kbd>x</kbd> solved · <kbd>s</kbd> skip</p>
)

export function ProblemInspector({ problem, state, tagCounts, rating, weak, onMark, onClose }) {
  if (!problem) {
    return (
      <div className="code-inspector-empty">
        <h3 className="code-insp-h">Focus</h3>
        <p className="meta">Select a problem to see its tags and your solved counts.</p>
        <Glance rating={rating} weak={weak} />
        {KEYS_HINT}
      </div>
    )
  }
  const status = state?.status
  return (
    <>
      <h3 className="code-insp-title">{problem.name}</h3>
      <div className="code-insp-meta">
        {problem.rating != null && <span>Rating {problem.rating}</span>}
        {status && <span className={`status-badge ${status}`}>{status}</span>}
      </div>
      <div>
        {problem.tags.map((t) => (
          <span className="chip chip-muted" key={t} style={{ marginRight: 4, marginBottom: 4 }}>{t}</span>
        ))}
      </div>
      <a className="code-insp-link" href={problem.url} target="_blank" rel="noreferrer">
        Open on Codeforces ↗
      </a>
      <div className="code-insp-actions">
        <button className="btn btn-success btn-sm" disabled={status === 'solved'} onClick={() => onMark(problem, 'solved')}>
          Mark solved
        </button>
        <button className="btn btn-sm" disabled={status === 'skipped'} onClick={() => onMark(problem, 'skipped')}>
          Skip
        </button>
        {onClose && <button className="btn btn-ghost btn-sm" onClick={onClose}>Close</button>}
      </div>
      <h4 className="code-insp-h">Solved by tag</h4>
      <TagBars tags={problem.tags} tagCounts={tagCounts} />
      <Glance rating={rating} weak={weak} />
      {KEYS_HINT}
    </>
  )
}

// `fetcher` is injectable (defaults to apiClient.fetchJson) so tests never touch the network.
export default function CodeView({ cfHandle, syncTick = 0, onChange, fetcher = fetchJson }) {
  const rootRef = useRef(null)
  const listRef = useRef(null)
  const split = useSplit(rootRef)

  const [cf, setCf] = useState(null)
  const [loadError, setLoadError] = useState(null) // { kind, message }
  const [actionError, setActionError] = useState('')
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState({})
  const [showFilter, setShowFilter] = useState(false)

  // The applied query drives the fetch; the draft is what the filter panel edits.
  const [applied, setApplied] = useState(EMPTY_FILTERS)
  const [draft, setDraft] = useState(EMPTY_FILTERS)
  const [reloadTick, setReloadTick] = useState(0)
  const [progressTick, setProgressTick] = useState(0)

  const [selectedId, setSelectedId] = useState(null)
  const [sheetOpen, setSheetOpen] = useState(false)

  const gate = useRef(null)
  if (!gate.current) gate.current = createRequestGate()
  const scrollOnLoad = useRef(false)

  // A new handle starts from page 0 with no filters and nothing selected.
  const [prevHandle, setPrevHandle] = useState(cfHandle)
  if (prevHandle !== cfHandle) {
    setPrevHandle(cfHandle)
    setApplied(EMPTY_FILTERS)
    setDraft(EMPTY_FILTERS)
    setSelectedId(null)
    setSheetOpen(false)
    setCf(null)
  }

  const { error: progressError } = useHydrate([() => getProgress().then(setProgress)], [syncTick, progressTick])

  useEffect(() => {
    const ticket = gate.current.next()
    if (!cfHandle) {
      setCf(null)
      setLoading(false)
      setLoadError({ kind: 'empty', message: NO_HANDLE_MESSAGE })
      return undefined
    }
    const ctrl = new AbortController()
    setLoadError(null)
    setLoading(true)

    const current = () => gate.current.isCurrent(ticket)
    ;(async () => {
      try {
        const data = await fetcher(buildUrl(cfHandle, applied), { signal: ctrl.signal })
        if (!current() || isCancelled(data)) return
        if (data && data.error) {
          setCf(null)
          setLoadError({ kind: 'server', message: describeError({ message: String(data.error) }) })
        } else if (!data || !Array.isArray(data.problems)) {
          setCf(null)
          setLoadError({ kind: 'parse', message: 'The server sent a response that could not be read. Please try again.' })
        } else {
          rememberCfRating(data.rating)
          setCf(data)
          if (scrollOnLoad.current && listRef.current) listRef.current.scrollTop = 0
        }
      } catch (e) {
        if (!current()) return
        setCf(null)
        setLoadError({ kind: e?.kind || 'client', message: describeError(e) })
      } finally {
        if (current()) {
          scrollOnLoad.current = false
          setLoading(false)
        }
      }
    })()

    // A newer filter/page/handle (or unmount) aborts this request and marks it stale.
    return () => {
      ctrl.abort()
      gate.current.invalidate()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfHandle, applied, reloadTick])

  // The Sheet only serves widths below the split; never leave it armed across a resize.
  useEffect(() => {
    if (split) setSheetOpen(false)
  }, [split])

  const problems = useMemo(() => cf?.problems ?? [], [cf])
  const selected = problems.find((p) => p.id === selectedId) || null
  const weak = cf ? leastPracticedTag(cf.tagCounts) : null
  const hasFilter = draft.ratingMin || draft.ratingMax || draft.tags.length > 0

  function applyFilter() {
    setApplied({ ...draft, page: 0 })
    setShowFilter(false)
  }

  function resetFilter() {
    setDraft(EMPTY_FILTERS)
    setApplied(EMPTY_FILTERS)
    setShowFilter(false)
  }

  function changePage(page) {
    scrollOnLoad.current = true
    listRef.current?.scrollTo?.({ top: 0, behavior: 'smooth' })
    setApplied((a) => ({ ...a, page }))
  }

  function toggleTag(tag) {
    setDraft((d) => ({
      ...d,
      tags: d.tags.includes(tag) ? d.tags.filter((t) => t !== tag) : [...d.tags, tag],
    }))
  }

  async function mark(problem, status) {
    try {
      setProgress(await markProblem(problem.id, status, problem.tags))
      setActionError('')
      onChange?.()
    } catch (e) {
      setActionError(`Couldn't save "${problem.name}": ${e?.message || 'unknown error'}`)
    }
  }

  function select(id) {
    setSelectedId(id)
    if (!split) setSheetOpen(true)
  }

  // j/k move, x marks solved, s skips. Ignored while typing or with modifiers.
  const live = useLatest({ problems, selectedId, selected, progress, mark })
  useEffect(() => {
    function onKey(e) {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return
      if (isTypingTarget(e.target)) return
      const { problems: list, selectedId: id, selected: sel, progress: prog, mark: doMark } = live.current
      const key = e.key
      if (key === 'j' || key === 'k') {
        if (!list.length) return
        const i = list.findIndex((p) => p.id === id)
        const next = i < 0 ? 0 : Math.min(list.length - 1, Math.max(0, i + (key === 'j' ? 1 : -1)))
        e.preventDefault()
        setSelectedId(list[next].id)
      } else if ((key === 'x' || key === 's') && sel) {
        const status = key === 'x' ? 'solved' : 'skipped'
        if (prog[sel.id]?.status === status) return
        e.preventDefault()
        doMark(sel, status)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [live])

  // Keep the selected row visible inside the list pane (never scrolls the window).
  useLayoutEffect(() => {
    if (!selectedId || !cf) return
    const pane = listRef.current
    revealInPane(pane, pane?.querySelector(rowSelector(selectedId)))
  }, [selectedId, cf])

  const totalPages = cf && cf.total > PAGE_SIZE ? Math.ceil(cf.total / PAGE_SIZE) : 0
  const page = applied.page || 0

  const inspector = (onClose) => (
    <ProblemInspector
      problem={selected}
      state={selected ? progress[selected.id] : null}
      tagCounts={cf?.tagCounts}
      rating={cf?.rating}
      weak={weak}
      onMark={mark}
      onClose={onClose}
    />
  )

  return (
    <div className="fade-in code-view" ref={rootRef}>
      {(loadError || progressError || actionError) && (
        <div className="code-banners">
          {loadError && (
            <div className="banner-warn code-banner" role="alert" data-error-kind={loadError.kind}>
              <span className="code-banner-text">{loadError.message}</span>
              <button className="btn btn-sm" onClick={() => setReloadTick((t) => t + 1)}>Retry</button>
            </div>
          )}
          {progressError && (
            <div className="banner-warn code-banner" role="alert">
              <span className="code-banner-text">Couldn't load your solved progress: {progressError}</span>
              <button className="btn btn-sm" onClick={() => setProgressTick((t) => t + 1)}>Retry</button>
            </div>
          )}
          {actionError && (
            <div className="banner-warn code-banner" role="alert">
              <span className="code-banner-text">{actionError}</span>
              <button className="btn btn-sm" onClick={() => setActionError('')}>Dismiss</button>
            </div>
          )}
        </div>
      )}

      <div className="logic-split">
        <section className="logic-list" aria-label="Problems">
          {cfHandle && (
            <button
              className={`cf-filter-toggle${hasFilter ? ' active' : ''}`}
              onClick={() => setShowFilter((v) => !v)}
              aria-expanded={showFilter}
            >
              <span>{showFilter ? '▲' : '▼'}</span>
              {' '}Filter Problems
              {hasFilter && <span className="cf-filter-badge">ON</span>}
            </button>
          )}

          {showFilter && (
            <div className="card cf-filter-panel">
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12 }}>
                <label className="meta" style={{ whiteSpace: 'nowrap' }}>Difficulty:</label>
                <input
                  type="number"
                  value={draft.ratingMin}
                  onChange={(e) => setDraft((d) => ({ ...d, ratingMin: e.target.value }))}
                  placeholder="800"
                  aria-label="Minimum rating"
                  style={{ width: 80, textAlign: 'center' }}
                  step="100"
                />
                <span className="meta">—</span>
                <input
                  type="number"
                  value={draft.ratingMax}
                  onChange={(e) => setDraft((d) => ({ ...d, ratingMax: e.target.value }))}
                  placeholder="3500"
                  aria-label="Maximum rating"
                  style={{ width: 80, textAlign: 'center' }}
                  step="100"
                />
              </div>
              <div className="meta" style={{ marginBottom: 6 }}>Tags:</div>
              <div className="cf-tag-grid">
                {ALL_TAGS.map((tag) => (
                  <button
                    key={tag}
                    className={`cf-tag-chip${draft.tags.includes(tag) ? ' active' : ''}`}
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

          <div className="section-header">
            <span className="section-title">{cf ? `${cf.total} problems` : 'Problems'}</span>
            {totalPages > 0 && <span className="meta">Page {page + 1} of {totalPages}</span>}
          </div>

          <div className="code-scroll" ref={listRef} aria-busy={loading}>
            {loading && !cf && (
              <div className="loading" role="status">
                <span className="loading-dot" /><span className="loading-dot" /><span className="loading-dot" />
                Fetching problems...
              </div>
            )}
            {!cfHandle && (
              <div className="logic-empty">
                <div className="empty-icon">🎯</div>
                <div className="empty-text">{NO_HANDLE_MESSAGE}</div>
              </div>
            )}
            {cf && problems.length === 0 && !loading && (
              <div className="logic-empty">No problems match these filters.</div>
            )}
            {problems.map((p) => {
              const state = progress[p.id]
              return (
                <button
                  type="button"
                  key={p.id}
                  data-problem-id={p.id}
                  className="logic-row code-row"
                  aria-current={p.id === selectedId ? 'true' : undefined}
                  onClick={() => select(p.id)}
                >
                  <span className="code-row-main">
                    <span className="code-row-name">{p.name}</span>
                    <span className="code-row-meta">
                      {p.rating}
                      <span style={{ opacity: 0.3 }}>·</span>
                      {p.tags.slice(0, 3).map((t) => (
                        <span className="chip chip-muted" key={t}>{t}</span>
                      ))}
                    </span>
                  </span>
                  <span className="code-row-end">
                    {state && <span className={`status-badge ${state.status}`}>{state.status}</span>}
                  </span>
                </button>
              )
            })}
          </div>

          {cf && (cf.hasMore || page > 0) && (
            <div className="code-pager">
              {page > 0 && (
                <button className="btn btn-sm" onClick={() => changePage(page - 1)}>← Prev</button>
              )}
              <span className="meta">Page {page + 1}{totalPages ? ` / ${totalPages}` : ''}</span>
              {cf.hasMore && (
                <button className="btn btn-sm btn-primary" onClick={() => changePage(page + 1)}>Next →</button>
              )}
            </div>
          )}
        </section>

        {split && (
          <aside className="logic-inspector code-inspector" aria-label="Problem inspector">
            {inspector(null)}
          </aside>
        )}
      </div>

      {!split && (
        <Sheet open={sheetOpen && !!selected} onClose={() => setSheetOpen(false)} variant="side">
          {sheetOpen && selected && (
            <div className="code-sheet-body">{inspector(() => setSheetOpen(false))}</div>
          )}
        </Sheet>
      )}
    </div>
  )
}
