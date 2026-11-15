import { CONTENT, TASKS } from '../course.js'
import { ALL_MODS, modIndex } from '../progress.js'
import Quiz from './Quiz.jsx'

// Ports Invest.jsx:180-240. CONTENT[mod.body] is a hand-written HTML string
// from course.js (never user input); it is the only HTML rendered here.
export default function ModuleView({ mod, progress, onUpdate }) {
  const idx = modIndex(mod.id)
  const prev = idx > 0 ? ALL_MODS[idx - 1] : null
  const next = idx < ALL_MODS.length - 1 ? ALL_MODS[idx + 1] : null
  const tasks = TASKS[mod.id] || []
  const done = !!progress.done[mod.id]

  function toggleTask(key) {
    onUpdate({ ...progress, tasks: { ...progress.tasks, [key]: !progress.tasks[key] } })
  }

  function markDone(pct) {
    onUpdate({
      ...progress,
      done: { ...progress.done, [mod.id]: true },
      quiz: { ...progress.quiz, [mod.id]: pct },
    })
  }

  return (
    <div className="learn-module">
      <div className="meta" style={{ marginBottom: 4 }}>{mod.meta} · Module {idx + 1}/{ALL_MODS.length}</div>
      <div className="h3 learn-module-title">{mod.t}</div>

      <div className="invest-content" dangerouslySetInnerHTML={{ __html: CONTENT[mod.body] }} />

      {tasks.length > 0 && (
        <div className="card learn-tasks">
          <div className="h3" style={{ marginBottom: 10 }}>Practice Tasks</div>
          {tasks.map((task, j) => {
            const key = `${mod.id}_${j}`
            const checked = !!progress.tasks[key]
            return (
              <label key={key} className="exam-topic-row">
                <input type="checkbox" checked={checked} onChange={() => toggleTask(key)} />
                <span style={{ textDecoration: checked ? 'line-through' : 'none', opacity: checked ? 0.5 : 1 }}>
                  {task}
                </span>
              </label>
            )
          })}
        </div>
      )}

      <Quiz key={mod.id} modId={mod.id} done={done} quizPct={progress.quiz[mod.id]} onPass={markDone} />

      <div className="learn-nav">
        <button className="btn btn-ghost btn-sm" disabled={!prev} onClick={() => prev && onUpdate({ ...progress, current: prev.id })}>
          ‹ {prev ? prev.t : 'Start'}
        </button>
        <button
          className="btn btn-primary btn-sm"
          disabled={!next || !done}
          onClick={() => next && onUpdate({ ...progress, current: next.id })}
        >
          {next ? 'Next ›' : 'End'}
        </button>
      </div>
    </div>
  )
}
