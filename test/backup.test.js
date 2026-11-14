import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  SYNCED_KEYS, BACKUP_FORMAT, BACKUP_VERSION, BackupError,
  exportBackup, exportBackupJson, importBackup, validateBackup,
} from '../src/backup/backup.js'

const T = 1_700_000_000_000

function fakeDb(initial = {}, { failOn } = {}) {
  const m = new Map(Object.entries(initial))
  const writes = []
  return {
    m,
    writes,
    getItem: async (k) => (m.has(k) ? structuredClone(m.get(k)) : null),
    setItem: async (k, v) => {
      if (k === failOn) throw new Error('quota')
      writes.push(k)
      m.set(k, structuredClone(v))
    },
    removeItem: async (k) => { m.delete(k) },
  }
}

const seeded = () => Object.fromEntries(
  SYNCED_KEYS.map((k, i) => [k, { data: { key: k, n: i, list: [i, 'x', null], nested: { a: true } }, updatedAt: T + i }]),
)

test('SYNCED_KEYS matches src/store.js and has 17 keys', () => {
  assert.equal(SYNCED_KEYS.length, 17)
  const src = readFileSync(new URL('../src/store.js', import.meta.url), 'utf8')
  const block = src.match(/export const SYNCED_KEYS = \[([\s\S]*?)\]/)[1]
  const storeKeys = [...block.matchAll(/'([^']+)'/g)].map((m) => m[1])
  assert.deepEqual(SYNCED_KEYS, storeKeys)
})

test('round trip: export 17 keys, import into empty db, identical wrapped values', async () => {
  const src = fakeDb(seeded())
  const json = await exportBackupJson({ db: src })
  const file = JSON.parse(json)
  assert.equal(file.format, BACKUP_FORMAT)
  assert.equal(file.version, BACKUP_VERSION)
  assert.equal(Object.keys(file.keys).length, 17)

  const dest = fakeDb()
  const imported = await importBackup(json, { db: dest, now: () => T })
  assert.equal(imported.length, 17)
  for (const key of SYNCED_KEYS) {
    assert.deepEqual(dest.m.get(key).data, src.m.get(key).data, key)
    assert.deepEqual(Object.keys(dest.m.get(key)).sort(), ['data', 'updatedAt'])
  }
})

test('import stamps updatedAt with now() so the next reconcile pushes it', async () => {
  const src = fakeDb(seeded())
  const dest = fakeDb()
  await importBackup(await exportBackup({ db: src }), { db: dest, now: () => T + 999_999 })
  for (const key of SYNCED_KEYS) assert.equal(dest.m.get(key).updatedAt, T + 999_999)
})

test('export wraps legacy raw values and omits empty keys', async () => {
  const db = fakeDb({ notes: ['a'], tasks: { data: [1], updatedAt: 5 } })
  const file = await exportBackup({ db, now: () => 1 })
  assert.deepEqual(file.keys, { notes: { data: ['a'], updatedAt: 0 }, tasks: { data: [1], updatedAt: 5 } })
})

const goodFile = () => ({
  format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: T,
  keys: { notes: { data: [1], updatedAt: 1 }, tasks: { data: [2], updatedAt: 2 } },
})

async function assertRejected(file, code = 'invalid') {
  const db = fakeDb()
  await assert.rejects(importBackup(file, { db }), (e) => e instanceof BackupError && e.code === code)
  assert.equal(db.writes.length, 0)
  assert.equal(db.m.size, 0)
}

test('rejects wrong format version without writing', async () => {
  await assertRejected({ ...goodFile(), version: 2 })
  await assertRejected({ ...goodFile(), version: undefined })
  await assertRejected({ ...goodFile(), format: 'other' })
})

test('rejects an unknown key without writing anything (even valid keys in the same file)', async () => {
  const f = goodFile()
  f.keys.bogus = { data: 1, updatedAt: 1 }
  await assertRejected(f)
  const g = goodFile()
  g.keys.__owner = { data: 'someone', updatedAt: 1 }
  await assertRejected(g)
})

test('rejects malformed shapes and bad JSON', async () => {
  await assertRejected('not json {')
  await assertRejected(null)
  await assertRejected([])
  await assertRejected({ ...goodFile(), keys: [] })
  await assertRejected({ ...goodFile(), keys: {} })
  await assertRejected({ ...goodFile(), keys: { notes: [1] } })
  await assertRejected({ ...goodFile(), keys: { notes: { updatedAt: 1 } } })
  await assertRejected({ ...goodFile(), keys: { notes: { data: [], updatedAt: 'x' } } })
  assert.throws(() => validateBackup(JSON.parse('{"format":"forge-backup","version":1,"keys":{"__proto__":{"data":1}}}')), BackupError)
})

test('refuses to overwrite existing data unless overwrite is set', async () => {
  const db = fakeDb({ notes: { data: ['mine'], updatedAt: 9 } })
  await assert.rejects(
    importBackup(goodFile(), { db }),
    (e) => e.code === 'exists' && e.details.keys.join() === 'notes',
  )
  assert.equal(db.writes.length, 0)
  assert.deepEqual(db.m.get('notes'), { data: ['mine'], updatedAt: 9 })
  assert.equal(db.m.has('tasks'), false)

  await importBackup(goodFile(), { db, overwrite: true, now: () => T })
  assert.deepEqual(db.m.get('notes'), { data: [1], updatedAt: T })
  assert.deepEqual(db.m.get('tasks'), { data: [2], updatedAt: T })
})

test('a failed write rolls back keys already written', async () => {
  const db = fakeDb({ notes: { data: ['mine'], updatedAt: 9 } }, { failOn: 'tasks' })
  await assert.rejects(importBackup(goodFile(), { db, overwrite: true }), (e) => e.code === 'write-failed')
  assert.deepEqual(db.m.get('notes'), { data: ['mine'], updatedAt: 9 })
  assert.equal(db.m.has('tasks'), false)
})
