import { useEffect, useState } from 'react'
import { getSettings, saveSettings, storageAvailable } from './store.js'
import Today from './tabs/Today.jsx'
import Puzzles from './tabs/Puzzles.jsx'
import Agents from './tabs/Agents.jsx'
import Expenses from './tabs/Expenses.jsx'
import Exams from './tabs/Exams.jsx'

const TABS = [
  { id: 'Today', icon: '⚡', label: 'Code' },
  { id: 'Puzzles', icon: '🧩', label: 'Puzzles' },
  { id: 'Exams', icon: '📝', label: 'Exams' },
  { id: 'Expenses', icon: '💰', label: 'Money' },
  { id: 'Agents', icon: '🤖', label: 'Agents' },
]

export default function App() {
  const [tab, setTab] = useState('Today')
  const [cfHandle, setCfHandle] = useState('')
  const [draftHandle, setDraftHandle] = useState('')
  const [showSettings, setShowSettings] = useState(false)
  const [storageOk, setStorageOk] = useState(true)

  useEffect(() => {
    storageAvailable().then(setStorageOk)
    getSettings().then((s) => {
      setCfHandle(s.cfHandle)
      setDraftHandle(s.cfHandle)
      if (!s.cfHandle) setShowSettings(true)
    })
  }, [])

  async function save() {
    const handle = draftHandle.trim()
    await saveSettings({ cfHandle: handle })
    setCfHandle(handle)
    setShowSettings(false)
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
        </div>
      )}

      <main className="content">
        {tab === 'Today' && <Today cfHandle={cfHandle} />}
        {tab === 'Puzzles' && <Puzzles />}
        {tab === 'Exams' && <Exams />}
        {tab === 'Expenses' && <Expenses />}
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
