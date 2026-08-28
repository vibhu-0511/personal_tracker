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
  return (await db.getItem('settings')) || { cfHandle: '' }
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
