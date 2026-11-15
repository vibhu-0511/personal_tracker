import './panels.css'

// Two actions. `solvedToday` is the count already in Code today; `puzzleDone` is today's puzzle daily.
// onSolved() should add a solved entry (see quickSolve); onPuzzleDone() should mark the daily (markPuzzleDone).
export default function SolvePanel({ solvedToday = 0, puzzleDone = false, onSolved, onPuzzleDone }) {
  return (
    <div className="cap-panel cap-solve">
      <button type="button" className="cap-btn cap-solve-btn" onClick={() => onSolved && onSolved()}>
        <span className="cap-solve-title">Solved a problem</span>
        <span className="cap-solve-meta">{solvedToday === 0 ? 'None in Code today' : `${solvedToday} in Code today`}</span>
      </button>
      <button type="button" className="cap-btn cap-solve-btn" aria-pressed={puzzleDone}
        data-done={puzzleDone ? 'true' : 'false'} disabled={puzzleDone} onClick={() => onPuzzleDone && onPuzzleDone()}>
        <span className="cap-solve-title">{puzzleDone ? '✓ Daily puzzle done' : 'Daily puzzle done'}</span>
        <span className="cap-solve-meta">{puzzleDone ? 'Marked for today' : 'Not marked today'}</span>
      </button>
    </div>
  )
}
