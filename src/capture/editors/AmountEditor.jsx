import { useId, useState } from 'react'
import { parseAmount } from './logic.js'
import { MAX_AMOUNT } from '../../money/categories.js'
import './editors.css'

// Amount chip editor. onChange(number | null): null while the text is not a valid amount.
export default function AmountEditor({ value, onChange, autoFocus = false }) {
  const id = useId()
  const [text, setText] = useState(value == null ? '' : String(value))
  const bad = text.trim() !== '' && parseAmount(text) == null
  return (
    <div className="cap-ed">
      <label className="cap-ed-label" htmlFor={id}>Amount</label>
      <div className="cap-ed-amount">
        <span className="cap-ed-rupee" aria-hidden="true">₹</span>
        <input
          id={id}
          className="cap-ed-input cap-ed-mono"
          type="text"
          inputMode="decimal"
          autoComplete="off"
          autoFocus={autoFocus}
          value={text}
          aria-invalid={bad || undefined}
          aria-describedby={bad ? `${id}-err` : undefined}
          onChange={(e) => { setText(e.target.value); onChange?.(parseAmount(e.target.value)) }}
        />
      </div>
      {bad && <p id={`${id}-err`} className="cap-ed-error" role="alert">Enter an amount up to {MAX_AMOUNT.toLocaleString('en-IN')}, with at most 2 decimals.</p>}
    </div>
  )
}
