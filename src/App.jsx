import { lazy, Suspense, useEffect, useState } from 'react'
import {
  getSettings, saveSettings, storageAvailable, reconcileAll, reconcileKey, SYNCED_KEYS,
  claimOwner, flush, syncBackend,
} from './store.js'
import { configureSynced, useSyncStatus } from './useSynced.js'
import { createRemoteSync, bootSync, bumpTicks, allTabs, syncBannerText } from './sync/appSubscriptions.js'
import BackupPanel from './backup/BackupPanel.jsx'
import { supabase } from './supabaseClient.js'
import ToastHost from './Toast.jsx'
import Shell from './shell/Shell.jsx'
import CommandPalette from './shell/CommandPalette.jsx'
import { useShortcuts } from './shell/useShortcuts.js'
import { useRoute, navigate } from './router.js'

const Home = lazy(() => import('./tabs/Home.jsx'))
const LogicBuilding = lazy(() => import('./tabs/LogicBuilding.jsx'))
const Agents = lazy(() => import('./tabs/Agents.jsx'))
const Expenses = lazy(() => import('./tabs/Expenses.jsx'))
const Invest = lazy(() => import('./tabs/Invest.jsx'))
const Life = lazy(() => import('./tabs/Life.jsx'))

// Top-level tabs in nav order. `id` is the component-state / syncTicks id,
// `route` the URL slug in routes.js. The Home id is not `Today` because Today
// is already the Codeforces progress key (KEY_TO_TABS.progress, LogicBuilding).
export const TABS = [
  { id: 'Home', route: 'today', icon: '☀️', label: 'Today' },
  { id: 'Life', route: 'life', icon: '🌱', label: 'Life' },
  { id: 'LogicBuilding', route: 'logic', icon: '🧠', label: 'Logic' },
  { id: 'Expenses', route: 'money', icon: '💰', label: 'Money' },
  { id: 'Invest', route: 'invest', icon: '📈', label: 'Invest' },
  { id: 'Agents', route: 'agents', icon: '🤖', label: 'Agents' },
]

// `chrome` is the browser theme-color (the theme's page background).
export const THEMES = [
  { id: 'ocean', label: 'Ocean', color: '#6ea8fe', chrome: '#0a0c10' },
  { id: 'forest', label: 'Forest', color: '#4ade80', chrome: '#0a0c10' },
  { id: 'sunset', label: 'Sunset', color: '#fb923c', chrome: '#0a0c10' },
  { id: 'grape', label: 'Grape', color: '#c084fc', chrome: '#0a0c10' },
  { id: 'rose', label: 'Rose', color: '#fb7185', chrome: '#0a0c10' },
  { id: 'sky', label: 'Sky', color: 'linear-gradient(135deg, #bfe3ff, #ffd6ea)', chrome: '#eaf4ff' },
  { id: 'cream', label: 'Cream', color: '#fff6e9', chrome: '#fff6e9' },
]

// Sets the accent on <html> and keeps <meta name="theme-color"> in step.
export function applyTheme(themeId) {
  const root = document.documentElement
  root.dataset.accent = themeId
  const chrome = (THEMES.find((t) => t.id === themeId) || THEMES[0]).chrome
  let meta = document.querySelector('meta[name="theme-color"]')
  if (!meta) {
    meta = document.createElement('meta')
    meta.name = 'theme-color'
    document.head.appendChild(meta)
  }
  meta.content = chrome
}

// The tab-to-key mapping moved to src/sync/appSubscriptions.js (KEY_TO_TABS); App only
// reacts to subscriptions now. The Home id is not `Today` because Today is the Codeforces
// progress tick (LogicBuilding).
let syncedConfigured = false
function ensureSyncedConfigured() {
  if (syncedConfigured) return
  syncedConfigured = true
  configureSynced(syncBackend)
}

export default function App() {
  ensureSyncedConfigured()
  const [session, setSession] = useState(undefined) // undefined = checking, null = signed out
  const [authEmail, setAuthEmail] = useState('')
  const [authPassword, setAuthPassword] = useState('')
  const [authError, setAuthError] = useState('')
  const [authBusy, setAuthBusy] = useState(false)

  const route = useRoute()
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [settings, setSettings] = useState({ cfHandle: '', theme: 'ocean' })
  const [draftHandle, setDraftHandle] = useState('')
  const [showSettings, setShowSettings] = useState(false)
  const [storageOk, setStorageOk] = useState(true)
  const [syncTicks, setSyncTicks] = useState({})
  const [synced, setSynced] = useState(false)
  const syncStatus = useSyncStatus() // {failed, pending, lastSyncedAt}
  const [initError, setInitError] = useState(null)
  const userId = session?.user?.id

  // Opening `/` (or any unknown hash) lands on the canonical route, e.g. #/today.
  useEffect(() => {
    if (window.location.hash !== `#${route.path}`) navigate(route.path, { replace: true })
  }, [route.path])

  useShortcuts({
    onOpenPalette: () => setPaletteOpen((v) => !v),
    charKeys: settings.shortcuts !== false,
  })

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

    const applySettings = (s, { first = false } = {}) => {
      setSettings(s)
      setDraftHandle(s.cfHandle)
      applyTheme(s.theme)
      if (first && !s.cfHandle) setShowSettings(true)
    }
    const reloadSettings = () => getSettings().then((s) => { if (!cancelled) applySettings(s) })
    const bump = (targets) => setSyncTicks((prev) => bumpTicks(prev, targets))

    const remote = createRemoteSync({
      keys: SYNCED_KEYS,
      isV2: (key) => syncBackend.isV2(key),
      reconcileKey,
      subscribe: (key, fn) => syncBackend.subscribe(key, fn),
      announce: (key) => { syncBackend.announceRemote(key) },
      onSettings: reloadSettings,
      onTabs: bump,
    })
    const stopV2 = remote.start() // engine subscriptions; none while every v2 flag is off

    bootSync({
      userId,
      claimOwner,
      reconcileAll,
      getSettings,
      // a local pull cursor means this device has data: render now, pull in the background
      hasLocalCursor: () => syncBackend.syncStatus().lastSyncedAt != null,
      onBackgroundDone: () => {
        if (cancelled) return
        reloadSettings()
        bump(allTabs())
      },
      onBackgroundError: () => { /* local data is showing; the sync banner reports failures */ },
    })
      .then(({ settings: s }) => {
        if (cancelled) return
        applySettings(s, { first: true })
        setSynced(true)
      })
      .catch((err) => { if (!cancelled) setInitError(err.message || 'Failed to sync') })

    // v1 channel: runs for every key that is not on v2 (reconcileKey answers 'noop' for a
    // v2 key), so with every flag off this is the same kv_store subscription as before.
    const channel = supabase
      .channel('kv_store_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'kv_store', filter: `user_id=eq.${userId}` },
        (payload) => { remote.handleKvChange(payload) }
      )
      .subscribe()

    return () => {
      cancelled = true
      stopV2()
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
    applyTheme(themeId)
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
    return (
      <div className="app">
        <div className="loading" style={{ justifyContent: 'center', marginTop: '40vh' }}>
          <span className="loading-dot" /><span className="loading-dot" /><span className="loading-dot" />
        </div>
      </div>
    )
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

  const gear = (
    <button
      className="gear-btn"
      onClick={() => setShowSettings((v) => !v)}
      aria-label="Settings"
    >
      {'⚙️'}
    </button>
  )

  return (
    <>
      <Shell actions={gear} toasts={<ToastHost />}>
        {!storageOk && (
          <div className="banner-warn">
            Storage unavailable — notes and progress won't persist in this browser.
          </div>
        )}

        {syncBannerText(syncStatus) && (
          <div className="banner-warn">{syncBannerText(syncStatus)}</div>
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

            <div className="meta" style={{ marginTop: 14, marginBottom: 6 }}>Backup</div>
            <BackupPanel />
          </div>
        )}

        <Suspense fallback={<div className="loading"><span className="loading-dot" /><span className="loading-dot" /><span className="loading-dot" /></div>}>
          {route.tab === 'today' && <Home syncTick={syncTicks.Home || 0} />}
          {route.tab === 'life' && <Life syncTick={syncTicks.Life || 0} />}
          {route.tab === 'logic' && <LogicBuilding cfHandle={settings.cfHandle} syncTicks={syncTicks} />}
          {route.tab === 'money' && <Expenses syncTick={syncTicks.Expenses || 0} />}
          {route.tab === 'invest' && <Invest syncTick={syncTicks.Invest || 0} />}
          {route.tab === 'agents' && <Agents />}
        </Suspense>
      </Shell>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </>
  )
}
