import test from 'node:test'
import assert from 'node:assert/strict'
import {
  createAgentHandler,
  parseLimit,
  DEFAULT_RATE_PER_MIN,
  DEFAULT_RATE_PER_DAY,
} from '../api/agent.js'
import { memoryUsageStorage } from '../api/_lib/rateLimit.js'

const baseEnv = { OWNER_USER_ID: 'owner-1', GROQ_API_KEY: 'test-key' }
const okVerifier = async () => 'owner-1'
const goodBody = { systemPrompt: 'be brief', messages: [{ role: 'user', content: 'hi' }] }
const okPayload = { choices: [{ message: { content: 'hello' } }] }

function mockRes() {
  return {
    statusCode: 200, headers: {}, body: undefined, ended: false,
    setHeader(k, v) { this.headers[k] = v },
    status(c) { this.statusCode = c; return this },
    json(b) { this.body = b; this.ended = true; return this },
    end() { this.ended = true },
  }
}
const mkReq = () => ({ method: 'POST', headers: { authorization: 'Bearer tok' }, body: goodBody })
function groq() {
  const calls = []
  const fetchImpl = async (url, init) => {
    calls.push({ url, init })
    return { ok: true, status: 200, json: async () => okPayload }
  }
  return { fetchImpl, calls }
}
const quiet = async (fn) => {
  const orig = console.error
  const logged = []
  console.error = (...a) => logged.push(a)
  try { return await fn(logged) } finally { console.error = orig }
}

test('documented defaults are 20 per minute and 300 per day', () => {
  assert.equal(DEFAULT_RATE_PER_MIN, 20)
  assert.equal(DEFAULT_RATE_PER_DAY, 300)
  assert.equal(parseLimit(undefined, 20), 20)
  assert.equal(parseLimit('', 20), 20)
  assert.equal(parseLimit('abc', 20), 20)
  assert.equal(parseLimit('0', 20), 20)
  assert.equal(parseLimit('-3', 20), 20)
  assert.equal(parseLimit('2.5', 20), 20)
  assert.equal(parseLimit(' 7 ', 20), 7)
})

test('the (limit+1)th call in a minute is 429 with Retry-After and a generic message', async () => {
  const { fetchImpl, calls } = groq()
  const h = createAgentHandler({
    fetchImpl, verifier: okVerifier, usageStorage: memoryUsageStorage(),
    env: { ...baseEnv, AGENT_RATE_PER_MIN: '3', AGENT_RATE_PER_DAY: '100' },
  })
  for (let i = 0; i < 3; i++) {
    const res = mockRes()
    await h(mkReq(), res)
    assert.equal(res.statusCode, 200)
  }
  const res = mockRes()
  await h(mkReq(), res)
  assert.equal(res.statusCode, 429)
  assert.deepEqual(res.body, { error: 'Too many requests, try again later' })
  const retry = Number(res.headers['Retry-After'])
  assert.ok(Number.isInteger(retry) && retry >= 1 && retry <= 60)
  assert.equal(calls.length, 3, 'a limited call must not reach Groq')
})

test('AGENT_RATE_PER_MIN unset uses the default of 20', async () => {
  const { fetchImpl, calls } = groq()
  const h = createAgentHandler({
    fetchImpl, verifier: okVerifier, usageStorage: memoryUsageStorage(), env: baseEnv,
  })
  for (let i = 0; i < DEFAULT_RATE_PER_MIN; i++) {
    const res = mockRes()
    await h(mkReq(), res)
    assert.equal(res.statusCode, 200)
  }
  const res = mockRes()
  await h(mkReq(), res)
  assert.equal(res.statusCode, 429)
  assert.equal(calls.length, DEFAULT_RATE_PER_MIN)
})

test('AGENT_RATE_PER_DAY is enforced and its Retry-After can exceed a minute', async () => {
  const { fetchImpl } = groq()
  const h = createAgentHandler({
    fetchImpl, verifier: okVerifier, usageStorage: memoryUsageStorage(),
    env: { ...baseEnv, AGENT_RATE_PER_MIN: '50', AGENT_RATE_PER_DAY: '2' },
  })
  for (let i = 0; i < 2; i++) await h(mkReq(), mockRes())
  const res = mockRes()
  await h(mkReq(), res)
  assert.equal(res.statusCode, 429)
  assert.ok(Number(res.headers['Retry-After']) > 60)
})

test('invalid limit env values fall back to the defaults', async () => {
  const { fetchImpl } = groq()
  const h = createAgentHandler({
    fetchImpl, verifier: okVerifier, usageStorage: memoryUsageStorage(),
    env: { ...baseEnv, AGENT_RATE_PER_MIN: 'nope', AGENT_RATE_PER_DAY: '0' },
  })
  const res = mockRes()
  await h(mkReq(), res)
  assert.equal(res.statusCode, 200)
})

test('an unauthorized caller gets 403 and is never recorded', async () => {
  const storage = memoryUsageStorage()
  const { fetchImpl } = groq()
  const h = createAgentHandler({
    fetchImpl, verifier: async () => 'intruder', usageStorage: storage, env: baseEnv,
  })
  const res = mockRes()
  await h(mkReq(), res)
  assert.equal(res.statusCode, 403)
  assert.equal((await storage.listSince('owner-1', 0)).length, 0)
})

// DECISION: the limiter FAILS OPEN. The proxy is single-owner and already gated by
// the owner JWT, so a broken or unreachable agent_usage table must never lock the
// owner out of their own agent. The failure is logged server-side instead.
test('fails open (and logs) when the usage table read fails', async () => {
  const broken = {
    async listSince() { throw new Error('usage read failed: connection refused') },
    async record() { throw new Error('should not be reached') },
  }
  const { fetchImpl, calls } = groq()
  const h = createAgentHandler({ fetchImpl, verifier: okVerifier, usageStorage: broken, env: baseEnv })
  await quiet(async (logged) => {
    const res = mockRes()
    await h(mkReq(), res)
    assert.equal(res.statusCode, 200)
    assert.deepEqual(res.body, { reply: 'hello' })
    assert.equal(calls.length, 1)
    assert.equal(logged.length, 1)
  })
})

test('fails open (and logs) when recording the call fails', async () => {
  const flaky = {
    async listSince() { return [] },
    async record() { throw new Error('usage write failed: boom') },
  }
  const { fetchImpl } = groq()
  const h = createAgentHandler({ fetchImpl, verifier: okVerifier, usageStorage: flaky, env: baseEnv })
  await quiet(async (logged) => {
    const res = mockRes()
    await h(mkReq(), res)
    assert.equal(res.statusCode, 200)
    assert.equal(logged.length, 1)
  })
})

test('fails open (and logs) when the storage factory throws or returns nothing', async () => {
  const { fetchImpl } = groq()
  for (const usageStorage of [
    () => { throw new Error('client init failed') },
    () => null,
  ]) {
    const h = createAgentHandler({ fetchImpl, verifier: okVerifier, usageStorage, env: baseEnv })
    await quiet(async (logged) => {
      const res = mockRes()
      await h(mkReq(), res)
      assert.equal(res.statusCode, 200)
      assert.equal(logged.length, 1)
    })
  }
})

test('without Supabase env the default storage is skipped and the call goes through', async () => {
  const { fetchImpl } = groq()
  const h = createAgentHandler({ fetchImpl, verifier: okVerifier, env: baseEnv })
  await quiet(async () => {
    const res = mockRes()
    await h(mkReq(), res)
    assert.equal(res.statusCode, 200)
  })
})
