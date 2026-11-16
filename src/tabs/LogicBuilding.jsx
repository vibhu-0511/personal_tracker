import { lazy, Suspense, useEffect, useState } from 'react'
import CodeView from './CodeView.jsx'
import Puzzles from './Puzzles.jsx'
import Exams from './Exams.jsx'
import { EXAMS } from '../logic/examData.js'
import { loadPuzzles } from '../puzzles.js'
import { normalizeAll, dayKey } from '../logic/puzzleProgress.js'
import { codeRing, codeStreak } from '../logic/stats.js'
import { getProgress, getPuzzleProgress, getExamProgress, getDailyLog } from '../store.js'
import Ring from '../ui/Ring.jsx'
import '../logic/logic.css'

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
export default function LogicBuilding({ cfHandle, codeGoal, syncTicks = {}, view: viewProp, onViewChange }) {
  const [localView, setLocalView] = useState('code')
  const requested = viewProp !== undefined ? viewProp : localView
  const view = VIEW_IDS.includes(requested) ? requested : 'code'
  const setView = (id) => {
    if (viewProp === undefined) setLocalView(id)
    if (onViewChange) onViewChange(id)
  }
  const codeTick = (syncTicks.Code || 0) + (syncTicks.Today || 0)
  const [glance, setGlance] = useState({
    ring: codeRing({}, codeGoal),
    streak: 0,
    dailySolved: false,
    puzzlesSolved: 0,
    examPct: 0,
  })
  const [puzzleCount, setPuzzleCount] = useState(0)
  const [localTick, setLocalTick] = useState(0)
  const bump = () => setLocalTick((t) => t + 1)

  useEffect(() => {
    loadPuzzles().then((p) => setPuzzleCount(p.length))
  }, [])

  useEffect(() => {
    Promise.all([getProgress(), getPuzzleProgress(), getExamProgress(), getDailyLog()]).then(
      ([progress, puzzleProgress, examProgress, dailyLog]) => {
        const puzzlesSolved = Object.keys(normalizeAll(puzzleProgress)).length
        const examDone = Object.values(examProgress).filter(Boolean).length
        setGlance({
          ring: codeRing(progress, codeGoal),
          streak: codeStreak(progress).current,
          dailySolved: !!dailyLog?.[dayKey(Date.now())]?.puzzle,
          puzzlesSolved,
          examPct: TOTAL_EXAM_TOPICS ? Math.round((examDone / TOTAL_EXAM_TOPICS) * 100) : 0,
        })
      }
    )
  }, [codeTick, codeGoal, syncTicks.Puzzles, syncTicks.Exams, localTick])

  return (
    <div>
      <header className="logic-head card">
        <Ring
          value={glance.ring.pct * 100}
          size={72}
          label={`${glance.ring.done} of ${glance.ring.goal} solved today`}
        >
          <b className="logic-ring-num">{glance.ring.done}/{glance.ring.goal}</b>
        </Ring>
        <div className="logic-head-text">
          <div className="logic-head-title">Solved today {glance.ring.done}/{glance.ring.goal}</div>
          <div className="logic-head-line" data-state={glance.dailySolved ? 'solved' : 'open'}>
            Daily puzzle: {glance.dailySolved ? 'solved' : 'open'}
          </div>
          <div className="logic-head-mono">
            Code streak {glance.streak} {glance.streak === 1 ? 'day' : 'days'}
          </div>
          <div className="logic-head-sub meta">
            {glance.puzzlesSolved}/{puzzleCount} puzzles · {glance.examPct}% exam topics
          </div>
        </div>
      </header>

      <div className="agent-bar logic-chips" role="group" aria-label="Logic sections">
        {VIEWS.map((v) => (
          <button
            key={v.id}
            type="button"
            className={`agent-pill${view === v.id ? ' active' : ''}`}
            aria-pressed={view === v.id}
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
