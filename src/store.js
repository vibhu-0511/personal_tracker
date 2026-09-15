import localforage from 'localforage'
import { supabase, getUserId } from './supabaseClient.js'
import { readLocalShape, wrapForSave, decideSync } from './sync/logic.js'

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

const pushTimers = {}

function schedulePush(key, wrapped, delay = 700) {
  clearTimeout(pushTimers[key])
  pushTimers[key] = setTimeout(() => {
    pushToCloud(key, wrapped).catch(() => {}) // offline/failed push: local write already succeeded, next reconcile retries
  }, delay)
}

async function pushToCloud(key, wrapped) {
  const userId = getUserId()
  if (!userId) return
  await supabase.from('kv_store').upsert({
    user_id: userId,
    key,
    value: wrapped.data,
    updated_at: new Date(wrapped.updatedAt).toISOString(),
  })
}

async function readLocal(key) {
  return readLocalShape(await db.getItem(key))
}

async function getSynced(key, fallback) {
  const local = await readLocal(key)
  return local ? local.data : fallback
}

async function saveSynced(key, data) {
  const wrapped = wrapForSave(data)
  await db.setItem(key, wrapped)
  schedulePush(key, wrapped)
}

export async function reconcileKey(key) {
  const local = await readLocal(key)
  try {
    const { data: row, error } = await supabase
      .from('kv_store')
      .select('value, updated_at')
      .eq('key', key)
      .maybeSingle()
    if (error) return
    const decision = decideSync(local, row)
    if (decision.action === 'pull') await db.setItem(key, decision.value)
    else if (decision.action === 'push') await pushToCloud(key, decision.value)
  } catch {
    // offline or a transient failure — this key just doesn't reconcile this pass;
    // the next reconcileAll (next app open, or the next realtime event) retries it
  }
}

export const SYNCED_KEYS = [
  'settings', 'notes', 'progress', 'expenses', 'budgets', 'goals',
  'examProgress', 'examNotes', 'investProgress', 'watchlist',
  'tasks', 'reminders', 'habits', 'moodLog', 'loans',
]

export async function reconcileAll() {
  for (const key of SYNCED_KEYS) await reconcileKey(key)
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
  const progress = await getProgress()
  progress[problemId] = { status, tags, updatedAt: Date.now() }
  await saveSynced('progress', progress)
  return progress
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
