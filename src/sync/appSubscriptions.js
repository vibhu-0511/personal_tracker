// App-level sync wiring that used to live inline in App.jsx (R6-14). Pure JS, no React,
// no network: App.jsx hands it the store's functions, node:test hands it fakes.
//
// Three jobs:
//   1. createRemoteSync   a remote change to a key -> which UI to refresh.
//        v1 keys: the kv_store realtime row -> reconcileKey(key); only a 'pull' refreshes.
//        v2 keys: the engine's own subscription (via the store's syncBackend); a change
//                 made by this tab's own write is skipped (the caller already has it).
//   2. bootSync           the startup order. Render waits for the network pull only when
//                 there is no local pull cursor; with one, it renders from local data and
//                 the pull runs in the background.
//   3. syncBannerText     the banner line.
//
// FLAGS OFF = v1, unchanged: isV2 is false for every key, so no engine subscription is
// made, hasLocalCursor() is false (no engine2, lastSyncedAt null), and the startup order
// and the kv_store handling are exactly what App.jsx did inline before.

// Which tab(s) show each synced key, so a remote change only refetches the tabs that
// show that data. A value is one tab id or an array. These ids are the syncTicks ids the
// tab components take (LogicBuilding reads Today, Puzzles, Exams). `Today` is the
// Codeforces progress key, not the Home route. `settings` is handled by onSettings.
export const KEY_TO_TABS = {
  progress: 'Today',
  expenses: 'Expenses', budgets: 'Expenses', goals: 'Expenses', loans: 'Expenses',
  examProgress: 'Exams', examNotes: 'Exams',
  investProgress: 'Invest', watchlist: 'Invest',
  tasks: ['Life', 'Home'], reminders: ['Life', 'Home'], habits: ['Life', 'Home'],
  moodLog: 'Life', notes: 'Life', checklists: 'Life',
  puzzleProgress: 'Puzzles',
}

export function tabsForKey(key) {
  return [].concat(Object.hasOwn(KEY_TO_TABS, key) ? KEY_TO_TABS[key] : [])
}

// Every tab id that any key maps to (used to refresh everything after a background pull).
export function allTabs() {
  return [...new Set(Object.keys(KEY_TO_TABS).flatMap(tabsForKey))]
}

// syncTicks state updater: +1 for each target tab, other entries untouched.
export function bumpTicks(prev, targets) {
  const next = { ...prev }
  for (const t of targets) next[t] = (next[t] || 0) + 1
  return next
}

// keys        SYNCED_KEYS
// isV2(key)   per-key flag
// reconcileKey(key) -> Promise<'pull' | ...>   the store's v1 reconcile (v2 keys answer 'noop')
// subscribe(key, fn(blob, {local})) -> off     the store's syncBackend.subscribe
// announce(key)   optional: tells useSynced listeners that a v1 pull changed the key
// onSettings()    settings changed remotely (App reloads its own state)
// onTabs(tabs)    these tabs should refetch
export function createRemoteSync({ keys, isV2 = () => false, reconcileKey, subscribe, announce, onSettings, onTabs }) {
  function deliver(key) {
    if (key === 'settings') {
      onSettings?.()
      return
    }
    const targets = tabsForKey(key)
    if (targets.length === 0) return
    onTabs?.(targets)
  }

  // A kv_store postgres_changes payload (the v1 channel). Same filtering and the same
  // 'pull'-only rule as the inline handler it replaces.
  function handleKvChange(payload) {
    const key = payload?.new?.key || payload?.old?.key
    if (!key || !keys.includes(key)) return undefined
    return reconcileKey(key).then((action) => {
      if (action !== 'pull') return
      announce?.(key)
      deliver(key)
    })
  }

  // Engine subscriptions for the keys that are on v2. Returns one function that stops all.
  function start() {
    const offs = []
    for (const key of keys) {
      if (!isV2(key)) continue
      offs.push(subscribe(key, (_blob, info) => {
        if (info?.local) return
        deliver(key)
      }))
    }
    return () => { for (const off of offs.splice(0)) off?.() }
  }

  return { handleKvChange, start, deliver }
}

// Startup. `claimOwner` first (it may wipe on a user change), then either
//   no local cursor: await reconcileAll() then read settings (v1's order, a network pull);
//   local cursor:    read settings now and run reconcileAll() in the background.
// Resolves { settings, background } where background is null or a promise that never
// rejects (it reports through onBackgroundDone / onBackgroundError).
export async function bootSync({
  userId, claimOwner, reconcileAll, getSettings, hasLocalCursor,
  onBackgroundDone, onBackgroundError,
}) {
  await claimOwner(userId)
  const cursor = (() => {
    try {
      return hasLocalCursor?.() === true
    } catch {
      return false
    }
  })()
  if (!cursor) {
    await reconcileAll()
    return { settings: await getSettings(), background: null }
  }
  const background = Promise.resolve()
    .then(() => reconcileAll())
    .then(() => onBackgroundDone?.(), (err) => onBackgroundError?.(err))
  return { settings: await getSettings(), background }
}

// Banner line, or null when nothing is wrong. `pending` is the number of records still
// waiting to be sent (always 0 with v2 off, so the text is v1's).
export function syncBannerText({ failed, pending } = {}) {
  if (!failed) return null
  const waiting = Number.isFinite(pending) && pending > 0 ? ` (${pending} waiting to sync)` : ''
  return `Cloud sync failed — changes are saved on this device and will retry${waiting}.`
}
