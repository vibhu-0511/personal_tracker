import { lazy, Suspense, useEffect, useState } from 'react'
import CodeView, { solvedToday } from './CodeView.jsx'
import Puzzles from './Puzzles.jsx'
import Exams from './Exams.jsx'
import { EXAMS } from '../logic/examData.js'
import { loadPuzzles } from '../puzzles.js'
import { getProgress, getPuzzleProgress, getExamProgress } from '../store.js'

const DsaView = lazy(() => import('./DsaView.jsx'))

const VIEWS = [
  { id: 'code', icon: '⚡', label: 'Code' },
  { id: 'puzzles', icon: '🧩', label: 'Puzzles' },
  { id: 'exams', icon: '📝', label: 'Exams' },
  { id: 'dsa', icon: '📘', label: 'DSA' },
]

const VIEW_IDS = VIEWS.map((v) => v.id)

const TOTAL_EXAM_TOPICS = EXAMS.reduce(
  (sum, ex) => sum + ex.sections.reduce((s, sec) => s + sec.topics.length, 0),
  0
)

// Controlled when `view` is passed (with `onViewChange`); otherwise keeps the
// active view in local state. Unknown view ids fall back to 'code'.
export default function LogicBuilding({ cfHandle, syncTicks = {}, view: viewProp, onViewChange }) {
  const [localView, setLocalView] = useState('code')
  const requested = viewProp !== undefined ? viewProp : localView
  const view = VIEW_IDS.includes(requested) ? requested : 'code'
  const setView = (id) => {
    if (viewProp === undefined) setLocalView(id)
    if (onViewChange) onViewChange(id)
  }
  const codeTick = (syncTicks.Code || 0) + (syncTicks.Today || 0)
  const [glance, setGlance] = useState({ solvedToday: 0, puzzlesSolved: 0, examPct: 0 })
  const [puzzleCount, setPuzzleCount] = useState(0)
  const [localTick, setLocalTick] = useState(0)
  const bump = () => setLocalTick((t) => t + 1)

  useEffect(() => {
    loadPuzzles().then((p) => setPuzzleCount(p.length))
  }, [])

  useEffect(() => {
    Promise.all([getProgress(), getPuzzleProgress(), getExamProgress()]).then(
      ([progress, puzzleProgress, examProgress]) => {
        const puzzlesSolved = Object.values(puzzleProgress).filter(Boolean).length
        const examDone = Object.values(examProgress).filter(Boolean).length
        setGlance({
          solvedToday: solvedToday(progress),
          puzzlesSolved,
          examPct: TOTAL_EXAM_TOPICS ? Math.round((examDone / TOTAL_EXAM_TOPICS) * 100) : 0,
        })
      }
    )
  }, [codeTick, syncTicks.Puzzles, syncTicks.Exams, localTick])

  return (
    <div>
      <div className="stat-row" style={{ marginBottom: 12 }}>
        <div className="stat-card">
          <div className="stat-value">{glance.solvedToday}</div>
          <div className="stat-label">Solved today</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{glance.puzzlesSolved}/{puzzleCount}</div>
          <div className="stat-label">Puzzles solved</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{glance.examPct}%</div>
          <div className="stat-label">Exam topics</div>
        </div>
      </div>

      <div className="agent-bar">
        {VIEWS.map((v) => (
          <button
            key={v.id}
            className={`agent-pill${view === v.id ? ' active' : ''}`}
            onClick={() => setView(v.id)}
          >
            <span className="agent-pill-icon">{v.icon}</span>
            {v.label}
          </button>
        ))}
      </div>

      {view === 'code' && <CodeView syncTick={codeTick} cfHandle={cfHandle} onChange={bump} />}
      {view === 'puzzles' && <Puzzles syncTick={syncTicks.Puzzles || 0} onChange={bump} />}
      {view === 'exams' && <Exams syncTick={syncTicks.Exams || 0} onChange={bump} />}
      {view === 'dsa' && (
        <Suspense fallback={<div className="empty">Loading DSA map…</div>}>
          <DsaView />
        </Suspense>
      )}
    </div>
  )
}
