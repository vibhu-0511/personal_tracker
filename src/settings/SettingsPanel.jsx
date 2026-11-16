import { useState } from 'react'
import BackupPanel from '../backup/BackupPanel.jsx'
import { DAILY_IDS, codeGoalOf } from '../today/dailies.js'
import './settings.css'

const DAILY_LABELS = {
  habits: 'Habits', spend: 'Spend', mood: 'Mood', code: 'Code', puzzle: 'Puzzle',
}

// Settings as its own panel (DESIGN 5.9), opened from the gear: Codeforces handle, Theme,
// Daily code goal (1 to 10), Dailies (which of the five count) and Backup.
// Props: settings, themes [{id,label,color}], onSaveHandle(handle), onTheme(id),
// onPatch(partial) (persists a settings change), onClose().
export default function SettingsPanel({ settings, themes, onSaveHandle, onTheme, onPatch, onClose }) {
  const [draftHandle, setDraftHandle] = useState(settings.cfHandle || '')
  const goal = codeGoalOf(settings)
  const enabled = Array.isArray(settings.dailies) ? settings.dailies : DAILY_IDS

  const setGoal = (n) => onPatch({ dailyCodeGoal: Math.min(10, Math.max(1, Math.round(Number(n) || 3))) })
  const toggle = (id) => {
    const next = enabled.includes(id) ? enabled.filter((x) => x !== id) : [...enabled, id]
    onPatch({ dailies: DAILY_IDS.filter((x) => next.includes(x)) })
  }

  return (
    <section className="card settings-panel settings-sheet" aria-label="Settings">
      <div className="h3 settings-title">Settings</div>

      <label className="meta" htmlFor="cf">Codeforces handle</label>
      <input
        id="cf"
        value={draftHandle}
        onChange={(e) => setDraftHandle(e.target.value)}
        placeholder="your_cf_handle"
        onKeyDown={(e) => e.key === 'Enter' && onSaveHandle(draftHandle.trim())}
      />
      <div className="settings-row">
        <button className="btn btn-primary btn-sm" onClick={() => onSaveHandle(draftHandle.trim())}>Save</button>
        <button className="btn btn-ghost btn-sm" onClick={onClose}>Cancel</button>
      </div>

      <div className="meta settings-label">Theme</div>
      <div className="theme-swatches">
        {themes.map((t) => (
          <button
            key={t.id}
            className={`theme-swatch${settings.theme === t.id ? ' active' : ''}`}
            style={{ background: t.color }}
            onClick={() => onTheme(t.id)}
            aria-label={t.label}
            title={t.label}
          />
        ))}
      </div>

      <label className="meta settings-label" htmlFor="code-goal">Daily code goal</label>
      <div className="settings-row settings-goal">
        <button className="btn btn-ghost btn-sm" aria-label="Lower daily code goal" disabled={goal <= 1} onClick={() => setGoal(goal - 1)}>-</button>
        <input
          id="code-goal" type="number" min="1" max="10" inputMode="numeric"
          value={goal} onChange={(e) => setGoal(e.target.value)}
        />
        <button className="btn btn-ghost btn-sm" aria-label="Raise daily code goal" disabled={goal >= 10} onClick={() => setGoal(goal + 1)}>+</button>
        <span className="meta">problems a day, 1 to 10</span>
      </div>

      <fieldset className="settings-dailies">
        <legend className="meta settings-label">Dailies</legend>
        <div className="meta">Pick the ones that count toward your daily total.</div>
        {DAILY_IDS.map((id) => (
          <label key={id} className="settings-check">
            <input type="checkbox" checked={enabled.includes(id)} onChange={() => toggle(id)} />
            <span>{DAILY_LABELS[id]}</span>
          </label>
        ))}
      </fieldset>

      <div className="meta settings-label">Backup</div>
      <BackupPanel />
    </section>
  )
}
