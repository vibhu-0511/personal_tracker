import { useState } from 'react'
import { getExamProgress, saveExamProgress, getExamNotes, saveExamNotes } from '../store.js'
import { useHydrate } from '../useHydrate.js'
import { useLatest } from '../useLatest.js'
import { deleteWithUndo } from '../undo.js'
import { newId } from '../id.js'

export const EXAMS = [
  {
    id: 'cat',
    name: 'CAT',
    icon: '📐',
    color: '#f59e0b',
    sections: [
      {
        name: 'Quantitative Aptitude',
        topics: ['Arithmetic', 'Algebra', 'Geometry & Mensuration', 'Number Systems', 'Modern Math (P&C, Probability)', 'Trigonometry'],
      },
      {
        name: 'Verbal Ability & Reading Comprehension',
        topics: ['Reading Comprehension', 'Para Jumbles', 'Para Summary', 'Odd Sentence Out', 'Sentence Completion'],
      },
      {
        name: 'Data Interpretation & Logical Reasoning',
        topics: ['Tables & Charts', 'Caselets', 'Arrangements', 'Puzzles', 'Logical Connectives', 'Venn Diagrams'],
      },
    ],
  },
  {
    id: 'cfa',
    name: 'CFA',
    icon: '📊',
    color: '#6ea8fe',
    sections: [
      {
        name: 'Ethics & Professional Standards',
        topics: ['Code of Ethics', 'Standards of Professional Conduct', 'GIPS'],
      },
      {
        name: 'Quantitative Methods',
        topics: ['Time Value of Money', 'Probability', 'Hypothesis Testing', 'Regression'],
      },
      {
        name: 'Economics',
        topics: ['Micro/Macro Economics', 'Monetary & Fiscal Policy', 'International Trade', 'Currency Exchange'],
      },
      {
        name: 'Financial Reporting & Analysis',
        topics: ['Financial Statements', 'Revenue Recognition', 'Inventory', 'Long-lived Assets', 'Taxes'],
      },
      {
        name: 'Corporate Issuers',
        topics: ['Corporate Governance', 'Capital Budgeting', 'Cost of Capital', 'Leverage'],
      },
      {
        name: 'Equity & Fixed Income',
        topics: ['Equity Valuation', 'Industry Analysis', 'Bond Pricing', 'Yield Measures', 'Credit Analysis'],
      },
      {
        name: 'Derivatives & Alternatives',
        topics: ['Forwards & Futures', 'Options', 'Swaps', 'Real Estate', 'Private Equity', 'Hedge Funds'],
      },
      {
        name: 'Portfolio Management',
        topics: ['Portfolio Risk & Return', 'CAPM', 'Asset Allocation', 'IPS'],
      },
    ],
  },
  {
    id: 'gmat',
    name: 'GMAT',
    icon: '🎯',
    color: '#a78bfa',
    sections: [
      {
        name: 'Quantitative Reasoning',
        topics: ['Problem Solving', 'Data Sufficiency', 'Arithmetic', 'Algebra', 'Geometry', 'Word Problems'],
      },
      {
        name: 'Verbal Reasoning',
        topics: ['Reading Comprehension', 'Critical Reasoning', 'Sentence Correction'],
      },
      {
        name: 'Data Insights',
        topics: ['Data Sufficiency', 'Multi-Source Reasoning', 'Table Analysis', 'Graphics Interpretation', 'Two-Part Analysis'],
      },
    ],
  },
]

export default function Exams({ syncTick = 0, onChange }) {
  const [exam, setExam] = useState(EXAMS[0])
  const [progress, setProgress] = useState({})
  const [notes, setNotes] = useState([])
  const [expanded, setExpanded] = useState(null)
  const [noteText, setNoteText] = useState('')
  const [noteTopic, setNoteTopic] = useState('')

  const { ready, error } = useHydrate([
    () => getExamProgress().then(setProgress),
    () => getExamNotes().then(setNotes),
  ], [syncTick])
  const notesRef = useLatest(notes)

  function topicKey(examId, section, topic) {
    return `${examId}::${section}::${topic}`
  }

  async function toggleTopic(examId, section, topic) {
    const key = topicKey(examId, section, topic)
    const next = { ...progress, [key]: !progress[key] }
    setProgress(next)
    await saveExamProgress(next)
    onChange?.()
  }

  function sectionProgress(examId, section) {
    let done = 0
    for (const t of section.topics) {
      if (progress[topicKey(examId, section.name, t)]) done++
    }
    return done
  }

  function examProgress(ex) {
    let total = 0, done = 0
    for (const s of ex.sections) {
      total += s.topics.length
      done += sectionProgress(ex.id, s)
    }
    return { total, done }
  }

  const examNotes = notes.filter((n) => n.examId === exam.id)

  async function addNote() {
    const text = noteText.trim()
    if (!text) return
    const next = [{ id: newId(), examId: exam.id, topic: noteTopic, text, ts: Date.now() }, ...notes]
    setNotes(next)
    setNoteText('')
    setNoteTopic('')
    await saveExamNotes(next)
  }

  async function persistNotes(next) {
    setNotes(next)
    await saveExamNotes(next)
  }

  function deleteNote(id) {
    deleteWithUndo({ list: notes, id, persist: persistNotes, ref: notesRef, label: () => 'Note deleted' })
  }

  if (error) {
    return (
      <div className="empty-state">
        <div className="empty-icon">⚠️</div>
        <div className="empty-text">Couldn't load exams: {error}</div>
      </div>
    )
  }
  if (!ready) {
    return <div className="empty-state"><div className="empty-text">Loading…</div></div>
  }

  const ep = examProgress(exam)
  const pct = ep.total ? Math.round((ep.done / ep.total) * 100) : 0

  return (
    <div className="fade-in">
      {/* Exam selector */}
      <div className="agent-bar">
        {EXAMS.map((ex) => (
          <button
            key={ex.id}
            className={`agent-pill${ex.id === exam.id ? ' active' : ''}`}
            onClick={() => { setExam(ex); setNoteTopic('') }}
          >
            <span className="agent-pill-icon">{ex.icon}</span>
            {ex.name}
          </button>
        ))}
      </div>

      {/* Progress bar */}
      <div className="card" style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
          <span className="h3">{exam.name} Progress</span>
          <span className="meta">{ep.done}/{ep.total} topics</span>
        </div>
        <div className="exam-progress-bar">
          <div className="exam-progress-fill" style={{ width: `${pct}%`, background: exam.color }} />
        </div>
        <div className="meta" style={{ marginTop: 6, textAlign: 'right' }}>{pct}%</div>
      </div>

      {/* Sections */}
      {exam.sections.map((section) => {
        const done = sectionProgress(exam.id, section)
        const isOpen = expanded === section.name
        return (
          <div key={section.name} className="card" style={{ marginBottom: 8, padding: 0 }}>
            <button
              className="exam-section-header"
              onClick={() => setExpanded(isOpen ? null : section.name)}
            >
              <div style={{ flex: 1, textAlign: 'left' }}>
                <div className="h3">{section.name}</div>
                <div className="meta" style={{ fontSize: 12 }}>{done}/{section.topics.length} done</div>
              </div>
              <span className="exam-section-arrow">{isOpen ? '▲' : '▼'}</span>
            </button>
            {isOpen && (
              <div style={{ padding: '0 16px 12px' }}>
                {section.topics.map((topic) => {
                  const key = topicKey(exam.id, section.name, topic)
                  const checked = !!progress[key]
                  return (
                    <label key={topic} className="exam-topic-row">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleTopic(exam.id, section.name, topic)}
                      />
                      <span style={{ textDecoration: checked ? 'line-through' : 'none', opacity: checked ? 0.5 : 1 }}>
                        {topic}
                      </span>
                    </label>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}

      {/* Quick notes for this exam */}
      <div className="section-header" style={{ paddingTop: 18 }}>
        <span className="section-title">{exam.name} Notes</span>
        <span className="meta">{examNotes.length}</span>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <input
          value={noteText}
          onChange={(e) => setNoteText(e.target.value)}
          placeholder={`Quick note for ${exam.name}...`}
          onKeyDown={(e) => e.key === 'Enter' && addNote()}
          style={{ flex: 1 }}
        />
        <select value={noteTopic} onChange={(e) => setNoteTopic(e.target.value)} style={{ maxWidth: 160 }}>
          <option value="">General</option>
          {exam.sections.flatMap((s) => s.topics).map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <button className="btn btn-primary btn-sm" onClick={addNote} disabled={!noteText.trim()}>Add</button>
      </div>

      {examNotes.length === 0 && (
        <div className="empty-state" style={{ padding: '24px 16px' }}>
          <div className="empty-text">No notes yet for {exam.name}</div>
        </div>
      )}

      {examNotes.map((n) => (
        <div key={n.id} className="note-card">
          <div className="note-body">{n.text}</div>
          <div className="note-footer">
            <span className="meta">{n.topic || exam.name}</span>
            <button className="btn btn-danger-ghost btn-sm" onClick={() => deleteNote(n.id)}>Delete</button>
          </div>
        </div>
      ))}

      {/* Material placeholder */}
      <div className="card" style={{ marginTop: 16, textAlign: 'center', padding: 24 }}>
        <div style={{ fontSize: 32, marginBottom: 8 }}>📚</div>
        <div className="h3" style={{ marginBottom: 4 }}>Study Material</div>
        <div className="meta">Share your Google Drive materials and they'll be integrated here — one place for all your prep.</div>
      </div>
    </div>
  )
}
