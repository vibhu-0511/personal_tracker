import { useState } from 'react'
import { QUIZZES } from '../course.js'

// Pass threshold is fixed at 80% (blueprint-errata canonical number).
export const PASS_PCT = 80

// Ports Invest.jsx:242-319. State resets because the parent mounts this with
// key={modId}; no effect is needed to clear picks/result on module change.
export default function Quiz({ modId, done, quizPct, onPass }) {
  const qs = QUIZZES[modId] || []
  const [picks, setPicks] = useState({})
  const [result, setResult] = useState(null)

  if (!qs.length) {
    return (
      <div className="card learn-quiz">
        <div className="meta" style={{ marginBottom: 10 }}>No quiz for this module.</div>
        <button className="btn btn-primary btn-sm" onClick={() => onPass(100)} disabled={done}>
          {done ? 'Completed ✓' : 'Mark complete ✓'}
        </button>
      </div>
    )
  }

  function grade() {
    let correct = 0
    qs.forEach((q, i) => { if (picks[i] === q.a) correct++ })
    const pct = Math.round((correct / qs.length) * 100)
    const pass = pct >= PASS_PCT
    setResult({ correct, pct, pass })
    if (pass) onPass(pct)
  }

  function retry() {
    setPicks({})
    setResult(null)
  }

  return (
    <div className="card learn-quiz">
      <div className="h3" style={{ marginBottom: 12 }}>Module Quiz · pass ≥{PASS_PCT}% to unlock next</div>
      {qs.map((q, i) => (
        <div key={i} className="learn-quiz-q">
          <div className="learn-quiz-prompt">{i + 1}. {q.q}</div>
          {q.o.map((opt, j) => {
            const selected = picks[i] === j
            let cls = 'invest-opt'
            if (selected) cls += ' sel'
            if (result && j === q.a) cls += ' correct'
            if (result && selected && j !== q.a) cls += ' wrong'
            return (
              <button
                key={j}
                className={cls}
                disabled={!!result}
                onClick={() => setPicks({ ...picks, [i]: j })}
              >
                {opt}
              </button>
            )
          })}
        </div>
      ))}
      {!result && (
        <button
          className="btn btn-primary btn-sm"
          disabled={Object.keys(picks).length < qs.length}
          onClick={grade}
        >
          Submit answers
        </button>
      )}
      {result && (
        <div className={`invest-quiz-result ${result.pass ? 'pass' : 'fail'}`}>
          {result.pass ? '✓ PASS' : '✗ RETRY'} — {result.correct}/{qs.length} ({result.pct}%)
          {!result.pass && (
            <button className="btn btn-ghost btn-sm" style={{ marginLeft: 10 }} onClick={retry}>
              Retry
            </button>
          )}
        </div>
      )}
      {done && <div className="meta" style={{ marginTop: 8 }}>Best score: {quizPct}%</div>}
    </div>
  )
}
