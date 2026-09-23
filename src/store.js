import localforage from 'localforage'
import { supabase } from './supabaseClient.js'
import { showToast } from './toast.js'
import { createSyncEngine } from './sync/engine.js'

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

const cloud = {
  getSession: () => supabase.auth.getSession(),
  async read(key, userId) {
    const { data, error } = await supabase
      .from('kv_store')
      .select('value, updated_at')
      .eq('key', key)
      .eq('user_id', userId)
      .maybeSingle()
    if (error) throw error
    return data
  },
  async write(key, userId, wrapped) {
    await supabase.from('kv_store').upsert({
      user_id: userId,
      key,
      value: wrapped.data,
      updated_at: new Date(wrapped.updatedAt).toISOString(),
    })
  },
}

const engine = createSyncEngine({
  db,
  cloud,
  onLocalWriteError: () => showToast('Could not save — storage full'),
})

export const onSyncStatusChange = engine.onStatusChange
export const reconcileKey = engine.reconcileKey
export const flush = engine.flush
export const claimOwner = engine.claimOwner

async function getSynced(key, fallback) {
  return engine.get(key, fallback)
}

async function saveSynced(key, data) {
  await engine.save(key, data)
}

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
  return engine.mutate('progress', (progress) => {
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
  return engine.mutate('reminders', fn, [])
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
