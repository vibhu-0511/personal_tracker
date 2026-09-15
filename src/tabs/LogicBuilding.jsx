import { useState } from 'react'
import Today from './Today.jsx'
import Puzzles from './Puzzles.jsx'
import Exams from './Exams.jsx'

const VIEWS = [
  { id: 'code', icon: '⚡', label: 'Code' },
  { id: 'puzzles', icon: '🧩', label: 'Puzzles' },
  { id: 'exams', icon: '📝', label: 'Exams' },
]

export default function LogicBuilding({ cfHandle, syncTicks }) {
  const [view, setView] = useState('code')

  return (
    <div>
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

      {view === 'code' && <Today key={syncTicks.Today || 0} cfHandle={cfHandle} />}
      {view === 'puzzles' && <Puzzles />}
      {view === 'exams' && <Exams key={syncTicks.Exams || 0} />}
    </div>
  )
}
