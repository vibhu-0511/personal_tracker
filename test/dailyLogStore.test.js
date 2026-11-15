import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { SYNCED_KEYS, exportBackup, validateBackup } from '../src/backup/backup.js'
import { KEY_TO_TABS } from '../src/sync/appSubscriptions.js'
import { V2_KEYS } from '../src/sync/flags.js'

const keysIn = (path) => {
  const src = readFileSync(new URL(path, import.meta.url), 'utf8')
  const block = src.match(/export const SYNCED_KEYS = \[([\s\S]*?)\]/)[1]
  return [...block.matchAll(/'([^']+)'/g)].map((m) => m[1])
}

test('dailyLog is a synced key in store.js and backup.js', () => {
  assert.ok(keysIn('../src/store.js').includes('dailyLog'))
  assert.deepEqual(keysIn('../src/store.js'), SYNCED_KEYS)
})

test('dailyLog refreshes tabs and stays off the sync v2 flag list', () => {
  assert.ok(KEY_TO_TABS.dailyLog.length > 0)
  assert.ok(!V2_KEYS.includes('dailyLog'))
})

function fakeDb(init = {}) {
  const m = new Map(Object.entries(init))
  return { getItem: async (k) => (m.has(k) ? m.get(k) : null), keys: async () => [...m.keys()] }
}

test('dailyLog exports in a backup and validates', async () => {
  const data = { '2026-11-14': { noSpend: true }, '2026-11-15': { puzzle: true } }
  const db = fakeDb({ dailyLog: { data, updatedAt: 5 } })
  const file = await exportBackup({ db, now: () => 1 })
  assert.deepEqual(file.keys.dailyLog, { data, updatedAt: 5 })
  assert.deepEqual(validateBackup(file), ['dailyLog'])
})

test('a backup made before dailyLog still validates', () => {
  const file = { format: 'forge-backup', version: 1, exportedAt: 1, keys: { notes: { data: [], updatedAt: 1 } } }
  assert.deepEqual(validateBackup(file), ['notes'])
})
