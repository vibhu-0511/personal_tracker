import localforage from 'localforage'
import { supabase } from './supabaseClient.js'
import { showToast } from './toast.js'
import { createSyncEngine } from './sync/engine.js'
import { createCloudKv } from './sync/cloudKv.js'
import { emitStoreKey } from './storeEvents.js'
import { createEngine2 } from './sync/engine2.js'
import { createCloudV2 } from './sync/cloudV2.js'
import { createFlags, createBlobMirror } from './sync/migrate.js'
import { createSyncRouter, createV1Db } from './sync/router.js'

const db = localforage.createInstance({ name: 'forge' })

export async function storageAvailable() {
  try {
    await db.setItem('__probe', 1)
    await db.removeItem('__probe')
    return true
  } catch {
    return false
  }
}

const cloud = createCloudKv(supabase)

// Per-key sync v2 flags (VITE_SYNC_V2_KEYS + this device's localStorage override).
// Every key is OFF by default, so each call below goes to the v1 engine exactly as before.
const flags = createFlags()

let mirror // dual-write of v2 keys back to the v1 blob; built with engine2

const v1Engine = createSyncEngine({
  // Same db; its clear() keeps engine2's r2:* records once engine2 is in use.
  db: createV1Db(db, { keepV2: () => engine.v2 != null || flags.keys().length > 0 }),
  cloud,
  onLocalWriteError: () => showToast('Could not save — storage full'),
})

async function currentUserId() {
  const { data } = await supabase.auth.getSession()
  return data?.session?.user?.id ?? null
}

// Built only when a key is on. A v2 key is dual-written back to the v1 blob (local shape
// and kv_store, debounced) so flipping its flag off resumes v1 with current data.
function createV2() {
  const engine2 = createEngine2({
    db,
    cloud: createCloudV2(supabase),
    onLocalWriteError: () => showToast('Could not save — storage full'),
    refreshSession: () => supabase.auth.refreshSession(),
  })
  mirror = createBlobMirror({ engine: engine2, db, cloudKv: cloud, getUserId: currentUserId })
  return engine2
}

// Routes each synced key to v1Engine (default) or engine2 (flag on); same surface as v1.
const engine = createSyncRouter({
  v1: v1Engine,
  createV2,
  flags,
  // announce changes made by pulls and other tabs, and start mirroring the key
  onV2Key: (key, engine2) => {
    markLocalWrites(engine2)
    engine2.subscribe(key, (blob) => {
      emitStoreKey(key)
      notifyRemote(key, blob, { local: isWriting(key) })
    })
    mirror.watch(key)
  },
})

// Listeners of syncBackend.subscribe (useSynced's snapshot store, App's v2 tab refresh).
// Fed by engine2's per-key subscription for v2 keys and by announceRemote for v1 pulls.
// With every flag off and nobody subscribed this map is empty and nothing here runs.
const remoteListeners = new Map() // key -> Set<fn(blob, {local})>

function notifyRemote(key, blob, info) {
  const set = remoteListeners.get(key)
  if (!set || set.size === 0) return
  for (const fn of [...set]) {
    try {
      fn(blob, info)
    } catch (err) {
      console.error('sync listener failed', err)
    }
  }
}

// Writes made by this tab that are still inside engine2 (counted by markLocalWrites).
// A v2 emission while one is open is the echo of our own write (info.local), not a
// remote change, so App does not refetch tabs for it.
const writesInFlight = new Map()
const isWriting = (key) => (writesInFlight.get(key) || 0) > 0
const patched = new WeakSet()

function markLocalWrites(engine2) {
  if (patched.has(engine2)) return
  patched.add(engine2)
  for (const method of ['save', 'update']) {
    const original = engine2[method].bind(engine2)
    engine2[method] = async (key, ...rest) => {
      writesInFlight.set(key, (writesInFlight.get(key) || 0) + 1)
      try {
        return await original(key, ...rest)
      } finally {
        const left = (writesInFlight.get(key) || 1) - 1
        if (left > 0) writesInFlight.set(key, left)
        else writesInFlight.delete(key)
      }
    }
  }
}

// engine.mutate saves directly, so announce the key change here (useStoreKey listeners).
async function mutateEmit(key, fn, fallback) {
  const result = await engine.mutate(key, fn, fallback)
  emitStoreKey(key)
  return result
}

export const onSyncStatusChange = engine.onStatusChange
export const reconcileKey = engine.reconcileKey
export const flush = engine.flush
export const claimOwner = engine.claimOwner

async function getSynced(key, fallback) {
  return engine.get(key, fallback)
}

async function saveSynced(key, data) {
  await engine.save(key, data)
  emitStoreKey(key)
}

// What useSynced's snapshot store and App's subscriptions talk to (R6-14): the router
// surface, with writes going through the same emitStoreKey wrappers as every saveX.
const syncBackend = {
  get: (key, fallback) => getSynced(key, fallback),
  save: (key, data) => saveSynced(key, data),
  update: (key, fn, fallback) => mutateEmit(key, fn, fallback),
  // fn(blob, {local}) when a pull or another tab changes the key (v2), or after a v1 pull
  // announced by announceRemote. Returns the unsubscribe function.
  subscribe(key, fn) {
    let set = remoteListeners.get(key)
    if (!set) remoteListeners.set(key, (set = new Set()))
    set.add(fn)
    return () => {
      set.delete(fn)
      if (set.size === 0 && remoteListeners.get(key) === set) remoteListeners.delete(key)
    }
  },
  onStatusChange: (fn) => engine.onStatusChange(fn),
  // { pending, lastSyncedAt }. engine2 is absent (zeros) until a v2 key is on.
  syncStatus() {
    const v2 = engine.v2
    if (!v2) return { pending: 0, lastSyncedAt: null }
    const s = v2.syncStatus()
    return { pending: s.pending, lastSyncedAt: s.lastSyncedAt }
  },
  isV2: (key) => engine.isV2(key),
  // A v1 pull changed `key` locally: hand the new blob to subscribers. Reads nothing
  // when nobody subscribed, so with useSynced unused this does no work.
  async announceRemote(key) {
    if (!remoteListeners.get(key)?.size) return
    const blob = await engine.get(key, undefined)
    if (blob !== undefined) notifyRemote(key, blob, { local: false })
  },
}
export { syncBackend }

export const SYNCED_KEYS = [
  'settings', 'notes', 'progress', 'expenses', 'budgets', 'goals',
  'examProgress', 'examNotes', 'investProgress', 'watchlist',
  'tasks', 'reminders', 'habits', 'moodLog', 'loans', 'puzzleProgress', 'checklists',
]

export async function reconcileAll() {
  await engine.reconcileAll(SYNCED_KEYS)
}

export async function getSettings() {
  return { cfHandle: 'step_bro', theme: 'ocean', ...(await getSynced('settings', {})) }
}
export async function saveSettings(settings) {
  await saveSynced('settings', settings)
}

export async function getNotes() {
  return await getSynced('notes', [])
}
export async function saveNotes(notes) {
  await saveSynced('notes', notes)
}

export async function getProgress() {
  return await getSynced('progress', {})
}
export async function markProblem(problemId, status, tags) {
  return mutateEmit('progress', (progress) => {
    progress[problemId] = { status, tags, updatedAt: Date.now() }
    return progress
  }, {})
}

export async function getExpenses() {
  return await getSynced('expenses', [])
}
export async function saveExpenses(expenses) {
  await saveSynced('expenses', expenses)
}

export async function getBudgets() {
  return await getSynced('budgets', {})
}
export async function saveBudgets(budgets) {
  await saveSynced('budgets', budgets)
}

export async function getGoals() {
  return await getSynced('goals', [])
}
export async function saveGoals(goals) {
  await saveSynced('goals', goals)
}

export async function getExamProgress() {
  return await getSynced('examProgress', {})
}
export async function saveExamProgress(progress) {
  await saveSynced('examProgress', progress)
}

export async function getExamNotes() {
  return await getSynced('examNotes', [])
}
export async function saveExamNotes(notes) {
  await saveSynced('examNotes', notes)
}

export async function getPuzzleProgress() {
  return await getSynced('puzzleProgress', {})
}
export async function savePuzzleProgress(progress) {
  await saveSynced('puzzleProgress', progress)
}

export async function getInvestProgress() {
  return await getSynced('investProgress', { done: {}, quiz: {}, tasks: {}, current: null })
}
export async function saveInvestProgress(progress) {
  await saveSynced('investProgress', progress)
}

export async function getWatchlist() {
  return await getSynced('watchlist', [])
}
export async function saveWatchlist(watchlist) {
  await saveSynced('watchlist', watchlist)
}

export async function getTasks() {
  return await getSynced('tasks', [])
}
export async function saveTasks(tasks) {
  await saveSynced('tasks', tasks)
}

export async function getReminders() {
  return await getSynced('reminders', [])
}
export async function saveReminders(reminders) {
  await saveSynced('reminders', reminders)
}
export async function mutateReminders(fn) {
  return mutateEmit('reminders', fn, [])
}

export async function getHabits() {
  return await getSynced('habits', [])
}
export async function saveHabits(habits) {
  await saveSynced('habits', habits)
}

export async function getMoodLog() {
  return await getSynced('moodLog', [])
}
export async function saveMoodLog(log) {
  await saveSynced('moodLog', log)
}

export async function getLoans() {
  return await getSynced('loans', [])
}
export async function saveLoans(loans) {
  await saveSynced('loans', loans)
}

export async function getChecklists() {
  return await getSynced('checklists', [])
}
export async function saveChecklists(checklists) {
  await saveSynced('checklists', checklists)
}

export async function mutateTasks(fn) {
  return mutateEmit('tasks', fn, [])
}
export async function mutateHabits(fn) {
  return mutateEmit('habits', fn, [])
}
export async function mutateMoodLog(fn) {
  return mutateEmit('moodLog', fn, [])
}
export async function mutateNotes(fn) {
  return mutateEmit('notes', fn, [])
}
