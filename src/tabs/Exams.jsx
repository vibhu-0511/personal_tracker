import { useRef, useState } from 'react'
import { getExamProgress, saveExamProgress, getExamNotes, saveExamNotes } from '../store.js'
import { useHydrate } from '../useHydrate.js'
import { useLatest } from '../useLatest.js'
import { deleteWithUndo } from '../undo.js'
import { newId } from '../id.js'
import { EXAMS } from '../logic/examData.js'
import { examTopicKey, examTotals } from '../logic/stats.js'
import { useSplit } from '../logic/useSplit.js'
import '../logic/logic.css'
import '../logic/exams.css'

export { EXAMS }

export default function Exams({ syncTick = 0, onChange }) {
  const [exam, setExam] = useState(EXAMS[0])
  const [progress, setProgress] = useState({})
  const [notes, setNotes] = useState([])
  const [expanded, setExpanded] = useState(null)
  const [selected, setSelected] = useState(null)
  const rootRef = useRef(null)
  const split = useSplit(rootRef)
  const [noteText, setNoteText] = useState('')
  const [noteTopic, setNoteTopic] = useState('')

  const { ready, error } = useHydrate([
    () => getExamProgress().then(setProgress),
    () => getExamNotes().then(setNotes),
  ], [syncTick])
  const notesRef = useLatest(notes)

  // Keys stay exam::section::topic so existing saved progress still checks off.
  const topicKey = examTopicKey

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

  // Percentages come from examTotals (known topics only), so they never pass 100.
  const ep = examTotals(progress, [exam])
  const pct = ep.pct
  const activeSection = exam.sections.find((s) => s.name === selected) || exam.sections[0]

  function pickExam(ex) {
    setExam(ex)
    setNoteTopic('')
    setExpanded(null)
    setSelected(null)
  }

  function renderTopics(section) {
    return section.topics.map((topic) => {
      const key = topicKey(exam.id, section.name, topic)
      const checked = !!progress[key]
      return (
        <label key={topic} className="exam-topic-row">
          <input
            type="checkbox"
            checked={checked}
            onChange={() => toggleTopic(exam.id, section.name, topic)}
          />
          <span className="exams-topic-text" data-done={checked ? 'true' : 'false'}>
            {topic}
          </span>
        </label>
      )
    })
  }

  const notesBlock = (
    <>
      <div className="section-header" style={{ paddingTop: split ? 0 : 18 }}>
        <span className="section-title">{exam.name} Notes</span>
        <span className="meta">{examNotes.length}</span>
      </div>

      <div className="exams-note-form">
        <input
          value={noteText}
          onChange={(e) => setNoteText(e.target.value)}
          placeholder={`Quick note for ${exam.name}...`}
          onKeyDown={(e) => e.key === 'Enter' && addNote()}
        />
        <select value={noteTopic} onChange={(e) => setNoteTopic(e.target.value)}>
          <option value="">General</option>
          {exam.sections.flatMap((s) => s.topics.map((t) => ({ k: `${s.name}::${t}`, t }))).map(({ k, t }) => (
            <option key={k} value={t}>{t}</option>
          ))}
        </select>
        <button className="btn btn-primary btn-sm" onClick={addNote} disabled={!noteText.trim()}>Add</button>
      </div>

      {examNotes.length === 0 && (
        <div className="empty-state exams-notes-empty">
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
    </>
  )

  const material = (
    <div className="card exams-material">
      <div className="exams-material-icon">📚</div>
      <div className="h3" style={{ marginBottom: 4 }}>Study Material</div>
      <div className="meta">Share your Google Drive materials and they'll be integrated here — one place for all your prep.</div>
    </div>
  )

  const sectionsList = split
    ? exam.sections.map((section) => {
        const done = sectionProgress(exam.id, section)
        const sectionPct = section.topics.length ? Math.round((done / section.topics.length) * 100) : 0
        const isActive = section.name === activeSection.name
        return (
          <button
            key={section.name}
            type="button"
            className="logic-row exams-section-row"
            aria-current={isActive ? 'true' : undefined}
            onClick={() => setSelected(section.name)}
          >
            <div className="exams-section-main">
              <div className="h3">{section.name}</div>
              <div className="meta" style={{ fontSize: 12 }}>{done}/{section.topics.length} done</div>
              <div className="exams-section-meter">
                <span style={{ width: `${sectionPct}%`, background: exam.color }} />
              </div>
            </div>
          </button>
        )
      })
    : exam.sections.map((section) => {
        const done = sectionProgress(exam.id, section)
        const isOpen = expanded === section.name
        return (
          <div key={section.name} className="card exams-section-card">
            <button
              className="exam-section-header"
              aria-expanded={isOpen}
              onClick={() => setExpanded(isOpen ? null : section.name)}
            >
              <div style={{ flex: 1, textAlign: 'left' }}>
                <div className="h3">{section.name}</div>
                <div className="meta" style={{ fontSize: 12 }}>{done}/{section.topics.length} done</div>
              </div>
              <span className="exam-section-arrow">{isOpen ? '▲' : '▼'}</span>
            </button>
            {isOpen && <div className="exams-section-body">{renderTopics(section)}</div>}
          </div>
        )
      })

  return (
    <div className="fade-in exams-view" ref={rootRef}>
      {/* Exam selector */}
      <div className="agent-bar">
        {EXAMS.map((ex) => (
          <button
            key={ex.id}
            className={`agent-pill${ex.id === exam.id ? ' active' : ''}`}
            onClick={() => pickExam(ex)}
          >
            <span className="agent-pill-icon">{ex.icon}</span>
            {ex.name}
          </button>
        ))}
      </div>

      {/* Progress bar */}
      <div className="card exams-summary">
        <div className="exams-summary-head">
          <span className="h3">{exam.name} Progress</span>
          <span className="meta">{ep.done}/{ep.total} topics</span>
        </div>
        <div className="exam-progress-bar">
          <div className="exam-progress-fill" style={{ width: `${pct}%`, background: exam.color }} />
        </div>
        <div className="meta" style={{ marginTop: 6, textAlign: 'right' }}>{pct}%</div>
      </div>

      {split ? (
        <div className="logic-split">
          <div className="logic-list">
            {sectionsList}
            {material}
          </div>
          <aside className="logic-inspector" aria-label={`${activeSection.name} details`}>
            <div className="card exams-inspector-card">
              <div className="h3 exams-inspector-title">{activeSection.name}</div>
              <div className="meta" style={{ fontSize: 12 }}>
                {sectionProgress(exam.id, activeSection)}/{activeSection.topics.length} done
              </div>
              <div className="exams-topics">{renderTopics(activeSection)}</div>
              {notesBlock}
            </div>
          </aside>
        </div>
      ) : (
        <>
          {sectionsList}
          {notesBlock}
          {material}
        </>
      )}
    </div>
  )
}
