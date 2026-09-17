import { useEffect, useState } from 'react'
import {
  getSettings, saveSettings, storageAvailable, reconcileAll, reconcileKey, SYNCED_KEYS,
  onSyncStatusChange, claimOwner, flush,
} from './store.js'
import { supabase } from './supabaseClient.js'
import ToastHost from './Toast.jsx'
import LogicBuilding from './tabs/LogicBuilding.jsx'
import Agents from './tabs/Agents.jsx'
import Expenses from './tabs/Expenses.jsx'
import Invest from './tabs/Invest.jsx'
import Life from './tabs/Life.jsx'

const TABS = [
  { id: 'Life', icon: '🌱', label: 'Life' },
  { id: 'LogicBuilding', icon: '🧠', label: 'Logic' },
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

// Which tab owns each synced data key, so a remote change only remounts
// (and re-fetches) the tab that actually shows that data. `settings` is
// handled directly below instead, since App.jsx already owns that state.
const KEY_TO_TAB = {
  progress: 'Today',
  expenses: 'Expenses', budgets: 'Expenses', goals: 'Expenses', loans: 'Expenses',
  examProgress: 'Exams', examNotes: 'Exams',
  investProgress: 'Invest', watchlist: 'Invest',
  tasks: 'Life', reminders: 'Life', habits: 'Life', moodLog: 'Life', notes: 'Life', checklists: 'Life',
  puzzleProgress: 'Puzzles',
}

export default function App() {
  const [session, setSession] = useState(undefined) // undefined = checking, null = signed out
  const [authEmail, setAuthEmail] = useState('')
  const [authPassword, setAuthPassword] = useState('')
  const [authError, setAuthError] = useState('')
  const [authBusy, setAuthBusy] = useState(false)

  const [tab, setTab] = useState('Life')
  const [settings, setSettings] = useState({ cfHandle: '', theme: 'ocean' })
  const [draftHandle, setDraftHandle] = useState('')
  const [showSettings, setShowSettings] = useState(false)
  const [storageOk, setStorageOk] = useState(true)
  const [syncTicks, setSyncTicks] = useState({})
  const [synced, setSynced] = useState(false)
  const [syncFailed, setSyncFailed] = useState(false)
  const [initError, setInitError] = useState(null)
  const userId = session?.user?.id

  useEffect(() => onSyncStatusChange(setSyncFailed), [])

  useEffect(() => {
    const onVisibility = () => { if (document.visibilityState === 'hidden') flush() }
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('beforeunload', flush)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('beforeunload', flush)
    }
  }, [])

  useEffect(() => {
    supabase.auth.getSession()
      .then(({ data }) => setSession(data.session))
      .catch((err) => setInitError(err.message || 'Failed to load session'))
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    storageAvailable().then(setStorageOk)
  }, [])

  useEffect(() => {
    if (!userId) { setSynced(false); return }
    let cancelled = false

    claimOwner(userId)
      .then(() => reconcileAll())
      .then(() => getSettings())
      .then((s) => {
        if (cancelled) return
        setSettings(s)
        setDraftHandle(s.cfHandle)
        document.documentElement.dataset.accent = s.theme
        if (!s.cfHandle) setShowSettings(true)
        setSynced(true)
      })
      .catch((err) => { if (!cancelled) setInitError(err.message || 'Failed to sync') })

    const channel = supabase
      .channel('kv_store_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'kv_store', filter: `user_id=eq.${userId}` },
        (payload) => {
          const key = payload.new?.key || payload.old?.key
          if (!key || !SYNCED_KEYS.includes(key)) return
          reconcileKey(key).then((action) => {
            if (action !== 'pull') return
            if (key === 'settings') {
              getSettings().then((s) => {
                setSettings(s)
                setDraftHandle(s.cfHandle)
                document.documentElement.dataset.accent = s.theme
              })
              return
            }
            const targetTab = KEY_TO_TAB[key]
            if (!targetTab) return
            setSyncTicks((prev) => ({ ...prev, [targetTab]: (prev[targetTab] || 0) + 1 }))
          })
        }
      )
      .subscribe()

    return () => {
      cancelled = true
      supabase.removeChannel(channel)
    }
  }, [userId])

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

  async function handleAuth() {
    setAuthError('')
    setAuthBusy(true)
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: authEmail.trim(), password: authPassword })
      if (error) setAuthError(error.message)
    } catch (err) {
      setAuthError(err.message || 'Sign-in failed')
    } finally {
      setAuthBusy(false)
    }
  }

  if (initError) {
    return (
      <div className="app">
        <div className="banner-warn">{initError}</div>
        <button className="btn btn-primary btn-sm" onClick={() => location.reload()}>Retry</button>
      </div>
    )
  }

  if (session === undefined || (session && !synced)) {
    return <div className="app" />
  }

  if (!session) {
    return (
      <div className="app">
        <header className="app-header">
          <span className="app-title">{'🔥'} Forge</span>
        </header>
        <div className="card settings-panel">
          <div className="h3" style={{ marginBottom: 10 }}>Sign in</div>
          <label className="meta" htmlFor="auth-email">Email</label>
          <input
            id="auth-email"
            type="email"
            value={authEmail}
            onChange={(e) => setAuthEmail(e.target.value)}
            style={{ marginTop: 4, marginBottom: 10 }}
          />
          <label className="meta" htmlFor="auth-pw">Password</label>
          <input
            id="auth-pw"
            type="password"
            value={authPassword}
            onChange={(e) => setAuthPassword(e.target.value)}
            style={{ marginTop: 4 }}
            onKeyDown={(e) => e.key === 'Enter' && handleAuth()}
          />
          {authError && (
            <div className="meta" style={{ color: 'var(--danger)', marginTop: 8 }}>{authError}</div>
          )}
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button className="btn btn-primary btn-sm" disabled={authBusy} onClick={() => handleAuth()}>
              Sign in
            </button>
          </div>
        </div>
      </div>
    )
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

      {syncFailed && (
        <div className="banner-warn">
          Cloud sync failed — changes are saved on this device and will retry.
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
        {tab === 'Life' && <Life syncTick={syncTicks.Life || 0} />}
        {tab === 'LogicBuilding' && <LogicBuilding cfHandle={settings.cfHandle} syncTicks={syncTicks} />}
        {tab === 'Expenses' && <Expenses syncTick={syncTicks.Expenses || 0} />}
        {tab === 'Invest' && <Invest syncTick={syncTicks.Invest || 0} />}
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

      <ToastHost />
    </div>
  )
}
