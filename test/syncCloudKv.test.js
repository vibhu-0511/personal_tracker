import test from 'node:test'
import assert from 'node:assert/strict'
import { createCloudKv } from '../src/sync/cloudKv.js'

function makeFakeSupabase({ upsertResult = { error: null }, maybeSingleResult = { data: null, error: null } } = {}) {
  const calls = { upserts: [], filters: [] }
  const query = {
    select() { return query },
    eq(col, val) { calls.filters.push([col, val]); return query },
    maybeSingle: async () => maybeSingleResult,
  }
  return {
    calls,
    auth: { getSession: async () => ({ data: { session: null } }) },
    from(table) {
      assert.equal(table, 'kv_store')
      return {
        ...query,
        upsert: async (row) => { calls.upserts.push(row); return upsertResult },
      }
    },
  }
}

test('write resolves and sends the wrapped value on success', async () => {
  const sb = makeFakeSupabase()
  const cloud = createCloudKv(sb)
  await cloud.write('notes', 'u1', { data: ['a'], updatedAt: 1000 })
  assert.deepEqual(sb.calls.upserts, [
    { user_id: 'u1', key: 'notes', value: ['a'], updated_at: new Date(1000).toISOString() },
  ])
})

test('write rejects when supabase resolves { error } instead of throwing', async () => {
  const sb = makeFakeSupabase({ upsertResult: { error: { message: 'RLS violation', code: '42501' } } })
  const cloud = createCloudKv(sb)
  await assert.rejects(cloud.write('notes', 'u1', { data: 1, updatedAt: 1 }), /RLS violation/)
})

test('write rethrows a real Error instance unchanged', async () => {
  const boom = new Error('boom')
  const sb = makeFakeSupabase({ upsertResult: { error: boom } })
  await assert.rejects(createCloudKv(sb).write('k', 'u', { data: 1, updatedAt: 1 }), (e) => e === boom)
})

test('read returns data and rejects on error', async () => {
  const row = { value: 1, updated_at: 'x' }
  assert.equal(await createCloudKv(makeFakeSupabase({ maybeSingleResult: { data: row, error: null } })).read('k', 'u'), row)
  const bad = makeFakeSupabase({ maybeSingleResult: { data: null, error: { message: 'nope' } } })
  await assert.rejects(createCloudKv(bad).read('k', 'u'), /nope/)
})
