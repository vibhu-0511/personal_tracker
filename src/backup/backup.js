// JSON export/import of every synced key. Opens its own localforage instance
// ({ name: 'forge' }, same as store.js) so store.js stays untouched; every
// function also takes an injectable `db` so tests run on an in-memory fake.
//
// File shape:
//   { format: 'forge-backup', version: 1, exportedAt: <ms>,
//     keys: { <syncedKey>: { data, updatedAt } } }
//
// Import is all-or-nothing and conservative:
//   - the whole file is validated before anything is written;
//   - an unknown key, wrong format/version or malformed entry rejects the file;
//   - without `{ overwrite: true }` it refuses when any target key already
//     holds local data, so a backup can never silently clobber live data;
//   - values are written as { data, updatedAt: now() } so the next reconcile
//     sees them as newest and pushes them to the cloud.
import { readLocalShape } from '../sync/logic.js'

export const BACKUP_FORMAT = 'forge-backup'
export const BACKUP_VERSION = 1

// Mirror of SYNCED_KEYS in src/store.js. Not imported from there because
// store.js pulls in supabase and localforage at module load; test/backup.test.js
// asserts the two lists stay identical.
export const SYNCED_KEYS = [
  'settings', 'notes', 'progress', 'expenses', 'budgets', 'goals',
  'examProgress', 'examNotes', 'investProgress', 'watchlist',
  'tasks', 'reminders', 'habits', 'moodLog', 'loans', 'puzzleProgress', 'checklists',
]

export class BackupError extends Error {
  constructor(code, message, details) {
    super(message)
    this.name = 'BackupError'
    this.code = code // 'invalid' | 'exists' | 'write-failed'
    if (details) this.details = details
  }
}

let defaultDb = null
async function getDefaultDb() {
  if (!defaultDb) {
    const { default: localforage } = await import('localforage')
    defaultDb = localforage.createInstance({ name: 'forge' })
  }
  return defaultDb
}

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k)

// Build the backup object. Keys with nothing stored are omitted; legacy raw
// values (written before sync existed) are exported in wrapped form.
export async function exportBackup({ db, now = Date.now } = {}) {
  const store = db || (await getDefaultDb())
  const keys = {}
  for (const key of SYNCED_KEYS) {
    const local = readLocalShape(await store.getItem(key))
    if (local) keys[key] = { data: local.data, updatedAt: local.updatedAt }
  }
  return { format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: now(), keys }
}

export async function exportBackupJson(opts) {
  return JSON.stringify(await exportBackup(opts), null, 2)
}

// Validate a parsed backup. Pure; returns the list of keys it contains or
// throws BackupError('invalid'). Never touches a db.
export function validateBackup(file) {
  const bad = (msg) => new BackupError('invalid', msg)
  if (!isPlainObject(file)) throw bad('Not a Forge backup file')
  if (file.format !== BACKUP_FORMAT) throw bad('Not a Forge backup file')
  if (file.version !== BACKUP_VERSION) {
    throw bad(`Unsupported backup version: ${String(file.version)} (expected ${BACKUP_VERSION})`)
  }
  if (!isPlainObject(file.keys)) throw bad('Backup has no keys section')
  const names = Object.keys(file.keys)
  if (names.length === 0) throw bad('Backup contains no data')
  const unknown = names.filter((k) => !SYNCED_KEYS.includes(k))
  if (unknown.length) throw bad(`Unknown key in backup: ${unknown.join(', ')}`)
  for (const key of names) {
    const entry = file.keys[key]
    if (!isPlainObject(entry) || !hasOwn(entry, 'data') || entry.data === undefined) {
      throw bad(`Malformed entry for key: ${key}`)
    }
    if (hasOwn(entry, 'updatedAt') && !(typeof entry.updatedAt === 'number' && Number.isFinite(entry.updatedAt))) {
      throw bad(`Malformed updatedAt for key: ${key}`)
    }
  }
  return names
}

export function parseBackupJson(text) {
  let file
  try {
    file = JSON.parse(text)
  } catch {
    throw new BackupError('invalid', 'Backup file is not valid JSON')
  }
  validateBackup(file)
  return file
}

// Import a backup (parsed object or JSON string). Returns the imported keys.
// Throws BackupError and writes nothing on invalid input or when existing
// data would be overwritten without `overwrite: true`. If a write fails
// midway, keys already written are restored to their previous values.
export async function importBackup(input, { db, overwrite = false, now = Date.now } = {}) {
  const file = typeof input === 'string' ? parseBackupJson(input) : input
  const names = validateBackup(file)
  const store = db || (await getDefaultDb())

  const previous = {}
  for (const key of names) previous[key] = await store.getItem(key)

  if (!overwrite) {
    const existing = names.filter((k) => previous[k] != null)
    if (existing.length) {
      throw new BackupError(
        'exists',
        `Local data already exists for: ${existing.join(', ')}. Import with overwrite to replace it.`,
        { keys: existing },
      )
    }
  }

  const written = []
  try {
    for (const key of names) {
      await store.setItem(key, { data: file.keys[key].data, updatedAt: now() })
      written.push(key)
    }
  } catch (err) {
    // Best-effort rollback so a partial import never leaves a mixed state.
    for (const key of [...written].reverse()) {
      try {
        if (previous[key] == null) await store.removeItem(key)
        else await store.setItem(key, previous[key])
      } catch { /* nothing more we can do */ }
    }
    throw new BackupError('write-failed', 'Could not write backup to local storage', { cause: err })
  }
  return names
}
