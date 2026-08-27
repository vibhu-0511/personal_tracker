import { useEffect, useState } from 'react'
import { getSettings, saveSettings, storageAvailable } from './store.js'
import Today from './tabs/Today.jsx'
import Notes from './tabs/Notes.jsx'
import Agents from './tabs/Agents.jsx'

const TABS = ['Today', 'Notes', 'Agents']

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
    <div className="wrap">
      <h1 style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        Forge
        <button className="act" onClick={() => setShowSettings((v) => !v)}>
          Settings
        </button>
      </h1>

      {!storageOk && (
        <div className="card err">
          Storage is unavailable — notes and progress will not persist in this browser.
        </div>
      )}

      {showSettings && (
        <div className="card">
          <label className="muted" htmlFor="cf">Codeforces handle</label>
          <input
            id="cf"
            value={draftHandle}
            onChange={(e) => setDraftHandle(e.target.value)}
            placeholder="your_cf_handle"
          />
          <button className="act" style={{ marginTop: 10 }} onClick={save}>
            Save
          </button>
        </div>
      )}

      <div className="tabs">
        {TABS.map((t) => (
          <button key={t} className={t === tab ? 'active' : ''} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
      </div>

      {tab === 'Today' && <Today cfHandle={cfHandle} />}
      {tab === 'Notes' && <Notes />}
      {tab === 'Agents' && <Agents />}
    </div>
  )
}
