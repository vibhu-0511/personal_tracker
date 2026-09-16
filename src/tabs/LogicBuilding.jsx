import { useEffect, useState } from 'react'
import Today, { solvedToday } from './Today.jsx'
import Puzzles from './Puzzles.jsx'
import Exams, { EXAMS } from './Exams.jsx'
import puzzleBank from '../puzzles.json'
import { getProgress, getPuzzleProgress, getExamProgress } from '../store.js'

const VIEWS = [
  { id: 'code', icon: '⚡', label: 'Code' },
  { id: 'puzzles', icon: '🧩', label: 'Puzzles' },
  { id: 'exams', icon: '📝', label: 'Exams' },
]

const TOTAL_EXAM_TOPICS = EXAMS.reduce(
  (sum, ex) => sum + ex.sections.reduce((s, sec) => s + sec.topics.length, 0),
  0
)

export default function LogicBuilding({ cfHandle, syncTicks }) {
  const [view, setView] = useState('code')
  const [glance, setGlance] = useState({ solvedToday: 0, puzzlesSolved: 0, examPct: 0 })

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
  }, [syncTicks.Today, syncTicks.Puzzles, syncTicks.Exams])

  return (
    <div>
      <div className="stat-row" style={{ marginBottom: 12 }}>
        <div className="stat-card">
          <div className="stat-value">{glance.solvedToday}</div>
          <div className="stat-label">Solved today</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{glance.puzzlesSolved}/{puzzleBank.length}</div>
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

      <a
        href="/dsa/mastery-map.html"
        className="btn btn-sm"
        style={{ width: '100%', marginBottom: 12, textAlign: 'center', display: 'block' }}
      >
        📘 DSA Mastery Map
      </a>

      {view === 'code' && <Today key={syncTicks.Today || 0} cfHandle={cfHandle} />}
      {view === 'puzzles' && <Puzzles key={syncTicks.Puzzles || 0} />}
      {view === 'exams' && <Exams key={syncTicks.Exams || 0} />}
    </div>
  )
}
