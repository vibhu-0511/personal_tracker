import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  checkRateLimit,
  memoryUsageStorage,
  supabaseUsageStorage,
  MINUTE_MS,
  DAY_MS,
} from '../api/_lib/rateLimit.js'

const T0 = Date.UTC(2026, 10, 14, 12, 0, 0)
const base = (storage, extra = {}) => ({ storage, userId: 'u1', perMinute: 3, perDay: 100, ...extra })

test('allows N calls per minute then blocks with retryAfterSec', async () => {
  const storage = memoryUsageStorage()
  for (let i = 0; i < 3; i++) {
    assert.deepEqual(await checkRateLimit(base(storage, { now: T0 + i * 1000 })), { allowed: true })
  }
  const r = await checkRateLimit(base(storage, { now: T0 + 10 * 1000 }))
  assert.equal(r.allowed, false)
  // oldest call at T0 slides out at T0 + 60s; 50s from now
  assert.equal(r.retryAfterSec, 50)
})

test('a blocked call is not recorded', async () => {
  const storage = memoryUsageStorage()
  for (let i = 0; i < 3; i++) await checkRateLimit(base(storage, { now: T0 }))
  await checkRateLimit(base(storage, { now: T0 + 1000 }))
  assert.equal((await storage.listSince('u1', 0)).length, 3)
})

test('allowed again once the window slides past the oldest call', async () => {
  const storage = memoryUsageStorage()
  for (let i = 0; i < 3; i++) await checkRateLimit(base(storage, { now: T0 }))
  assert.equal((await checkRateLimit(base(storage, { now: T0 + MINUTE_MS - 1 }))).allowed, false)
  assert.equal((await checkRateLimit(base(storage, { now: T0 + MINUTE_MS + 1 }))).allowed, true)
})

test('retryAfterSec waits for the call that frees a slot, not the oldest', async () => {
  const storage = memoryUsageStorage()
  // 4 calls recorded directly: 3 allowed per minute, so the 2nd-oldest frees a slot.
  for (const dt of [0, 5000, 10000, 15000]) await storage.record('u1', T0 + dt)
  const r = await checkRateLimit(base(storage, { now: T0 + 20000 }))
  assert.equal(r.allowed, false)
  assert.equal(r.retryAfterSec, 45) // calls at 5s,10s,15s must drop to 2: 5s slides out at 65s
})

test('allows N calls per day then blocks, even when the minute window is clear', async () => {
  const storage = memoryUsageStorage()
  const opts = { perMinute: 5, perDay: 4 }
  // 4 calls spread over hours, each in its own minute
  for (let i = 0; i < 4; i++) {
    assert.equal((await checkRateLimit(base(storage, { ...opts, now: T0 + i * 3600 * 1000 }))).allowed, true)
  }
  const now = T0 + 4 * 3600 * 1000
  const r = await checkRateLimit(base(storage, { ...opts, now }))
  assert.equal(r.allowed, false)
  assert.equal(r.retryAfterSec, (DAY_MS - 4 * 3600 * 1000) / 1000)
  // after the first call is a day old, a slot frees up
  assert.equal((await checkRateLimit(base(storage, { ...opts, now: T0 + DAY_MS + 1 }))).allowed, true)
})

test('when both windows are exceeded the longer wait is returned', async () => {
  const storage = memoryUsageStorage()
  for (let i = 0; i < 2; i++) await storage.record('u1', T0 + i * 1000)
  const r = await checkRateLimit({ storage, userId: 'u1', perMinute: 2, perDay: 2, now: T0 + 2000 })
  assert.equal(r.allowed, false)
  assert.equal(r.retryAfterSec, DAY_MS / 1000 - 2)
})

test('users are limited independently', async () => {
  const storage = memoryUsageStorage()
  for (let i = 0; i < 3; i++) await checkRateLimit(base(storage, { now: T0 }))
  assert.equal((await checkRateLimit(base(storage, { now: T0 }))).allowed, false)
  assert.equal((await checkRateLimit(base(storage, { userId: 'u2', now: T0 }))).allowed, true)
})

test('rejects invalid input', async () => {
  const storage = memoryUsageStorage()
  await assert.rejects(checkRateLimit(base(storage, { perMinute: 0 })), /perMinute/)
  await assert.rejects(checkRateLimit(base(storage, { perDay: 1.5 })), /perDay/)
  await assert.rejects(checkRateLimit(base(storage, { userId: '' })), /userId/)
  await assert.rejects(checkRateLimit({ userId: 'u1', perMinute: 1, perDay: 1 }), /storage/)
})

test('storage errors propagate so the caller can decide to fail open', async () => {
  const storage = { listSince: async () => { throw new Error('down') }, record: async () => {} }
  await assert.rejects(checkRateLimit(base(storage)), /down/)
})

test('supabaseUsageStorage reads and writes through the client with the right filters', async () => {
  const calls = []
  const chain = (result) => {
    const q = {
      select: (c) => (calls.push(['select', c]), q),
      eq: (c, v) => (calls.push(['eq', c, v]), q),
      gte: (c, v) => (calls.push(['gte', c, v]), q),
      order: (c, o) => (calls.push(['order', c, o]), q),
      limit: (n) => (calls.push(['limit', n]), Promise.resolve(result)),
      insert: (row) => (calls.push(['insert', row]), Promise.resolve({ error: null })),
    }
    return q
  }
  const client = {
    from: (t) => (calls.push(['from', t]), chain({ data: [{ at: '2026-11-14T12:00:00.000Z' }], error: null })),
  }
  const s = supabaseUsageStorage(client)
  assert.deepEqual(await s.listSince('u1', T0 - 1000), [T0])
  await s.record('u1', T0)
  assert.deepEqual(calls.find((c) => c[0] === 'eq'), ['eq', 'user_id', 'u1'])
  assert.deepEqual(calls.find((c) => c[0] === 'gte'), ['gte', 'at', new Date(T0 - 1000).toISOString()])
  assert.deepEqual(calls.find((c) => c[0] === 'insert'), ['insert', { user_id: 'u1', at: new Date(T0).toISOString() }])

  const failing = { from: () => chain({ data: null, error: { message: 'boom' } }) }
  await assert.rejects(supabaseUsageStorage(failing).listSince('u1', 0), /boom/)
})

test('agent_usage.sql has RLS, own-row select/insert policies only, and the (user_id, at) index', () => {
  const sql = readFileSync(new URL('../docs/sql/agent_usage.sql', import.meta.url), 'utf8')
    .split('\n').filter((l) => !l.trim().startsWith('--')).join('\n')
  assert.match(sql, /create table if not exists public\.agent_usage/)
  assert.match(sql, /enable row level security/)
  assert.match(sql, /for select using \(auth\.uid\(\) = user_id\)/)
  assert.match(sql, /for insert with check \(auth\.uid\(\) = user_id\)/)
  assert.doesNotMatch(sql, /for (update|delete|all)/)
  assert.match(sql, /create index if not exists \w+\s+on public\.agent_usage \(user_id, at\)/)
})
