import { useState } from 'react'
import { PHASES, GLOSSARY } from '../course.js'
import { ALL_MODS, isUnlocked, courseProgress } from '../progress.js'
import { useInvest } from '../InvestContext.jsx'
import ModuleView from './ModuleView.jsx'
import ResourcesCard from './ResourcesCard.jsx'
import './learn.css'

// Ports Invest.jsx:92-178. Single column below 1024px; module list + ModuleView
// side by side from 1024px (see learn.css).
export default function LearnScreen() {
  const { progress, updateProgress } = useInvest()
  const [showGlossary, setShowGlossary] = useState(false)
  const [glossQuery, setGlossQuery] = useState('')

  const currentId = progress.current || ALL_MODS[0].id
  const currentMod = ALL_MODS.find((m) => m.id === currentId) || ALL_MODS[0]
  const { done: doneCount, total, pct } = courseProgress(progress.done)

  const q = glossQuery.toLowerCase()
  const filteredGlossary = GLOSSARY.filter(
    ([term, def]) => term.toLowerCase().includes(q) || def.toLowerCase().includes(q),
  )

  return (
    <div className="learn-screen">
      <div className="card learn-progress">
        <div className="learn-progress-head">
          <span className="h3">Course Progress</span>
          <span className="meta">{doneCount}/{total} modules</span>
        </div>
        <div className="exam-progress-bar">
          <div className="exam-progress-fill" style={{ width: `${pct}%`, background: 'var(--accent)' }} />
        </div>
      </div>

      <div className="agent-bar learn-tabs">
        <button className={`agent-pill${!showGlossary ? ' active' : ''}`} onClick={() => setShowGlossary(false)}>
          Modules
        </button>
        <button className={`agent-pill${showGlossary ? ' active' : ''}`} onClick={() => setShowGlossary(true)}>
          <span className="agent-pill-icon">📖</span>Glossary
        </button>
      </div>

      {showGlossary ? (
        <div className="card learn-glossary">
          <input
            value={glossQuery}
            onChange={(e) => setGlossQuery(e.target.value)}
            placeholder="Search terms…"
            style={{ marginBottom: 12, width: '100%' }}
          />
          {filteredGlossary.map(([term, def]) => (
            <div key={term} className="learn-gloss-row">
              <div className="learn-gloss-term">{term}</div>
              <div className="meta">{def}</div>
            </div>
          ))}
        </div>
      ) : (
        <div className="learn-panes">
          <nav className="learn-list" aria-label="Course modules">
            {PHASES.map((phase) => (
              <div key={phase.id} className="learn-phase">
                <div className="meta learn-phase-name">{phase.name}</div>
                <div className="learn-phase-mods">
                  {phase.mods.map((m) => {
                    const unlocked = isUnlocked(progress.done, m.id)
                    const done = !!progress.done[m.id]
                    const curr = m.id === currentId
                    return (
                      <button
                        key={m.id}
                        className={`invest-mod-btn${curr ? ' active' : ''}`}
                        disabled={!unlocked}
                        aria-current={curr ? 'true' : undefined}
                        onClick={() => updateProgress({ ...progress, current: m.id })}
                      >
                        <span className={`invest-dot${done ? ' done' : curr ? ' curr' : !unlocked ? ' lock' : ''}`} />
                        <span style={{ flex: 1, textAlign: 'left' }}>{m.t}</span>
                        <span className="meta">{done ? `${progress.quiz[m.id]}%` : unlocked ? '' : '🔒'}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </nav>

          <div className="learn-detail">
            <ModuleView mod={currentMod} progress={progress} onUpdate={updateProgress} />
          </div>
        </div>
      )}

      <ResourcesCard />
    </div>
  )
}
