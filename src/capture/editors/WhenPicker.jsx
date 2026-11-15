import { useId, useMemo, useState } from 'react'
import { whenPresets, toLocalInput, fromLocalInput } from './logic.js'
import './editors.css'

// When editor. value = epoch ms or null. onChange(epoch ms). `now` is injectable for tests.
export default function WhenPicker({ value, onChange, now }) {
  const id = useId()
  const presets = useMemo(() => whenPresets(now ?? Date.now()), [now])
  const matched = presets.find((p) => p.at === value)
  const [custom, setCustom] = useState(value != null && !matched)
  return (
    <div className="cap-ed" role="group" aria-label="When">
      <div className="cap-ed-row">
        {presets.map((p) => (
          <button
            key={p.id}
            type="button"
            className="cap-ed-opt"
            aria-pressed={!custom && value === p.at}
            onClick={() => { setCustom(false); onChange?.(p.at) }}
          >
            {p.label}
          </button>
        ))}
        <button
          type="button"
          className="cap-ed-opt"
          aria-pressed={custom}
          aria-expanded={custom}
          aria-controls={`${id}-dt`}
          onClick={() => setCustom(true)}
        >
          Pick a time
        </button>
      </div>
      {custom && (
        <div className="cap-ed-custom">
          <label className="cap-ed-label" htmlFor={`${id}-dt`}>Date and time</label>
          <input
            id={`${id}-dt`}
            className="cap-ed-input cap-ed-mono"
            type="datetime-local"
            value={value != null ? toLocalInput(value) : ''}
            onChange={(e) => { const t = fromLocalInput(e.target.value); if (t != null) onChange?.(t) }}
          />
        </div>
      )}
    </div>
  )
}
