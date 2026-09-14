import localforage from 'localforage'

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

export async function getSettings() {
  return { cfHandle: 'step_bro', theme: 'ocean', ...(await db.getItem('settings')) }
}
export async function saveSettings(settings) {
  await db.setItem('settings', settings)
}

export async function getNotes() {
  return (await db.getItem('notes')) || []
}
export async function saveNotes(notes) {
  await db.setItem('notes', notes)
}

export async function getProgress() {
  return (await db.getItem('progress')) || {}
}
export async function markProblem(problemId, status, tags) {
  const progress = await getProgress()
  progress[problemId] = { status, tags, updatedAt: Date.now() }
  await db.setItem('progress', progress)
  return progress
}

export async function getExpenses() {
  return (await db.getItem('expenses')) || []
}
export async function saveExpenses(expenses) {
  await db.setItem('expenses', expenses)
}

export async function getBudgets() {
  return (await db.getItem('budgets')) || {}
}
export async function saveBudgets(budgets) {
  await db.setItem('budgets', budgets)
}

export async function getGoals() {
  return (await db.getItem('goals')) || []
}
export async function saveGoals(goals) {
  await db.setItem('goals', goals)
}

export async function getExamProgress() {
  return (await db.getItem('examProgress')) || {}
}
export async function saveExamProgress(progress) {
  await db.setItem('examProgress', progress)
}

export async function getExamNotes() {
  return (await db.getItem('examNotes')) || []
}
export async function saveExamNotes(notes) {
  await db.setItem('examNotes', notes)
}

export async function getInvestProgress() {
  return (await db.getItem('investProgress')) || { done: {}, quiz: {}, tasks: {}, current: null }
}
export async function saveInvestProgress(progress) {
  await db.setItem('investProgress', progress)
}

export async function getWatchlist() {
  return (await db.getItem('watchlist')) || []
}
export async function saveWatchlist(watchlist) {
  await db.setItem('watchlist', watchlist)
}

export async function getTasks() {
  return (await db.getItem('tasks')) || []
}
export async function saveTasks(tasks) {
  await db.setItem('tasks', tasks)
}

export async function getReminders() {
  return (await db.getItem('reminders')) || []
}
export async function saveReminders(reminders) {
  await db.setItem('reminders', reminders)
}

export async function getHabits() {
  return (await db.getItem('habits')) || []
}
export async function saveHabits(habits) {
  await db.setItem('habits', habits)
}

export async function getMoodLog() {
  return (await db.getItem('moodLog')) || []
}
export async function saveMoodLog(log) {
  await db.setItem('moodLog', log)
}
