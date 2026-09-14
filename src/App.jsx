import { useEffect, useState } from 'react'
import { getSettings, saveSettings, storageAvailable } from './store.js'
import Today from './tabs/Today.jsx'
import Puzzles from './tabs/Puzzles.jsx'
import Agents from './tabs/Agents.jsx'
import Expenses from './tabs/Expenses.jsx'
import Exams from './tabs/Exams.jsx'
import Invest from './tabs/Invest.jsx'
import Life from './tabs/Life.jsx'

const TABS = [
  { id: 'Life', icon: '🌱', label: 'Life' },
  { id: 'Today', icon: '⚡', label: 'Code' },
  { id: 'Puzzles', icon: '🧩', label: 'Puzzles' },
  { id: 'Exams', icon: '📝', label: 'Exams' },
  { id: 'Expenses', icon: '💰', label: 'Money' },
  { id: 'Invest', icon: '📈', label: 'Invest' },
  { id: 'Agents', icon: '🤖', label: 'Agents' },
]

const THEMES = [
  { id: 'ocean', label: 'Ocean', color: '#6ea8fe' },
  { id: 'forest', label: 'Forest', color: '#4ade80' },
  { id: 'sunset', label: 'Sunset', color: '#fb923c' },
  { id: 'grape', label: 'Grape', color: '#c084fc' },
  { id: 'rose', label: 'Rose', color: '#fb7185' },
]

export default function App() {
  const [tab, setTab] = useState('Life')
  const [settings, setSettings] = useState({ cfHandle: '', theme: 'ocean' })
  const [draftHandle, setDraftHandle] = useState('')
  const [showSettings, setShowSettings] = useState(false)
  const [storageOk, setStorageOk] = useState(true)

  useEffect(() => {
    storageAvailable().then(setStorageOk)
    getSettings().then((s) => {
      setSettings(s)
      setDraftHandle(s.cfHandle)
      document.documentElement.dataset.accent = s.theme
      if (!s.cfHandle) setShowSettings(true)
    })
  }, [])

  async function save() {
    const handle = draftHandle.trim()
    const next = { ...settings, cfHandle: handle }
    await saveSettings(next)
    setSettings(next)
    setShowSettings(false)
  }

  async function setTheme(themeId) {
    const next = { ...settings, theme: themeId }
    setSettings(next)
    document.documentElement.dataset.accent = themeId
    await saveSettings(next)
  }

  return (
    <div className="app">
      <header className="app-header">
        <span className="app-title">{'🔥'} Forge</span>
        <button
          className="gear-btn"
          onClick={() => setShowSettings((v) => !v)}
          aria-label="Settings"
        >
          {'⚙️'}
        </button>
      </header>

      {!storageOk && (
        <div className="banner-warn">
          Storage unavailable — notes and progress won't persist in this browser.
        </div>
      )}

      {showSettings && (
        <div className="card settings-panel" style={{ marginBottom: 12 }}>
          <div className="h3" style={{ marginBottom: 10 }}>Settings</div>
          <label className="meta" htmlFor="cf">Codeforces handle</label>
          <input
            id="cf"
            value={draftHandle}
            onChange={(e) => setDraftHandle(e.target.value)}
            placeholder="your_cf_handle"
            style={{ marginTop: 4 }}
            onKeyDown={(e) => e.key === 'Enter' && save()}
          />
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button className="btn btn-primary btn-sm" onClick={save}>Save</button>
            <button className="btn btn-ghost btn-sm" onClick={() => setShowSettings(false)}>Cancel</button>
          </div>

          <div className="meta" style={{ marginTop: 14, marginBottom: 6 }}>Theme</div>
          <div className="theme-swatches">
            {THEMES.map((t) => (
              <button
                key={t.id}
                className={`theme-swatch${settings.theme === t.id ? ' active' : ''}`}
                style={{ background: t.color }}
                onClick={() => setTheme(t.id)}
                aria-label={t.label}
                title={t.label}
              />
            ))}
          </div>
        </div>
      )}

      <main className="content">
        {tab === 'Life' && <Life />}
        {tab === 'Today' && <Today cfHandle={settings.cfHandle} />}
        {tab === 'Puzzles' && <Puzzles />}
        {tab === 'Exams' && <Exams />}
        {tab === 'Expenses' && <Expenses />}
        {tab === 'Invest' && <Invest />}
        {tab === 'Agents' && <Agents />}
      </main>

      <nav className="tab-bar">
        <div className="tab-bar-inner">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={`tab-btn${t.id === tab ? ' active' : ''}`}
              onClick={() => setTab(t.id)}
            >
              <span className="tab-icon">{t.icon}</span>
              {t.label}
            </button>
          ))}
        </div>
      </nav>
    </div>
  )
}
