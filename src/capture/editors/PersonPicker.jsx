import { useId, useState } from 'react'
import './editors.css'

// Person editor. value = name or null. `people` = suggestions (e.g. recent names).
export default function PersonPicker({ value, people = [], onChange }) {
  const id = useId()
  const [text, setText] = useState(value || '')
  const commit = (name) => { const n = name.trim(); onChange?.(n || null) }
  return (
    <div className="cap-ed">
      <label className="cap-ed-label" htmlFor={id}>With</label>
      <input
        id={id}
        className="cap-ed-input"
        type="text"
        autoComplete="off"
        placeholder="Name"
        value={text}
        onChange={(e) => { setText(e.target.value); commit(e.target.value) }}
      />
      <div className="cap-ed-row" role="group" aria-label="Suggestions">
        {people.map((p) => (
          <button key={p} type="button" className="cap-ed-opt" aria-pressed={value === p} onClick={() => { setText(p); commit(p) }}>
            {p}
          </button>
        ))}
        <button type="button" className="cap-ed-opt" onClick={() => { setText(''); commit('') }}>No one</button>
      </div>
    </div>
  )
}
