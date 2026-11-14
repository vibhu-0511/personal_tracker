import test from 'node:test'
import assert from 'node:assert/strict'
import { createAgentHandler, MAX_TOKENS, BODY_LIMIT_BYTES } from '../api/agent.js'

const env = { OWNER_USER_ID: 'owner-1', GROQ_API_KEY: 'test-key' }
const okVerifier = async () => 'owner-1'
const goodBody = { systemPrompt: 'be brief', messages: [{ role: 'user', content: 'hi' }] }

function mockRes() {
  const res = {
    statusCode: 200, headers: {}, body: undefined, ended: false,
    setHeader(k, v) { this.headers[k] = v },
    status(c) { this.statusCode = c; return this },
    json(b) { this.body = b; this.ended = true; return this },
    end() { this.ended = true },
  }
  return res
}
const mkReq = (over = {}) => ({
  method: 'POST',
  headers: { authorization: 'Bearer tok' },
  body: goodBody,
  ...over,
})
function groq(payload, { ok = true, status = 200 } = {}) {
  const calls = []
  const fetchImpl = async (url, init) => {
    calls.push({ url, init })
    return { ok, status, json: async () => payload }
  }
  return { fetchImpl, calls }
}
const okPayload = { choices: [{ message: { content: 'hello' } }] }
const silence = (fn) => async () => {
  const orig = console.error
  console.error = () => {}
  try { await fn() } finally { console.error = orig }
}

test('403 without a token, and no upstream call', async () => {
  const { fetchImpl, calls } = groq(okPayload)
  const h = createAgentHandler({ fetchImpl, verifier: okVerifier, env })
  const res = mockRes()
  await h(mkReq({ headers: {} }), res)
  assert.equal(res.statusCode, 403)
  assert.equal(calls.length, 0)
})

test('403 when the verifier returns another user', async () => {
  const { fetchImpl } = groq(okPayload)
  const h = createAgentHandler({ fetchImpl, verifier: async () => 'intruder', env })
  const res = mockRes()
  await h(mkReq(), res)
  assert.equal(res.statusCode, 403)
})

test('400 on invalid roles', async () => {
  const { fetchImpl, calls } = groq(okPayload)
  const h = createAgentHandler({ fetchImpl, verifier: okVerifier, env })
  const res = mockRes()
  await h(mkReq({ body: { systemPrompt: 's', messages: [{ role: 'system', content: 'x' }] } }), res)
  assert.equal(res.statusCode, 400)
  assert.match(res.body.error, /role/)
  assert.equal(calls.length, 0)
})

test('413 on an oversized body', async () => {
  const { fetchImpl } = groq(okPayload)
  const h = createAgentHandler({ fetchImpl, verifier: okVerifier, env })
  const res = mockRes()
  await h(mkReq({ headers: { authorization: 'Bearer tok', 'content-length': String(BODY_LIMIT_BYTES + 1) } }), res)
  assert.equal(res.statusCode, 413)
})

test('413 on an oversized parsed body without content-length', async () => {
  const { fetchImpl } = groq(okPayload)
  const h = createAgentHandler({ fetchImpl, verifier: okVerifier, env })
  const res = mockRes()
  const big = { systemPrompt: 's', messages: [{ role: 'user', content: 'x'.repeat(BODY_LIMIT_BYTES) }] }
  await h(mkReq({ body: big }), res)
  assert.equal(res.statusCode, 413)
})

test('502 with a generic message on upstream 500', silence(async () => {
  const { fetchImpl } = groq({ error: { message: 'secret upstream detail' } }, { ok: false, status: 500 })
  const h = createAgentHandler({ fetchImpl, verifier: okVerifier, env })
  const res = mockRes()
  await h(mkReq(), res)
  assert.equal(res.statusCode, 502)
  assert.equal(res.body.error, 'Could not reach the agent service')
  assert.doesNotMatch(JSON.stringify(res.body), /secret upstream detail|500/)
}))

test('502 when Groq returns content null', silence(async () => {
  const { fetchImpl } = groq({ choices: [{ message: { content: null } }] })
  const h = createAgentHandler({ fetchImpl, verifier: okVerifier, env })
  const res = mockRes()
  await h(mkReq(), res)
  assert.equal(res.statusCode, 502)
  assert.equal(res.body.error, 'Could not reach the agent service')
  assert.equal(res.body.reply, undefined)
}))

test('502 when the choices array is missing or the fetch throws', silence(async () => {
  for (const fetchImpl of [
    async () => ({ ok: true, status: 200, json: async () => ({}) }),
    async () => { throw new Error('network down') },
  ]) {
    const h = createAgentHandler({ fetchImpl, verifier: okVerifier, env })
    const res = mockRes()
    await h(mkReq(), res)
    assert.equal(res.statusCode, 502)
  }
}))

test('OPTIONS answers 204 with CORS headers for an allowed origin', async () => {
  const h = createAgentHandler({ fetchImpl: groq(okPayload).fetchImpl, verifier: okVerifier, env })
  const res = mockRes()
  await h({ method: 'OPTIONS', headers: { origin: 'capacitor://localhost' } }, res)
  assert.equal(res.statusCode, 204)
  assert.equal(res.headers['Access-Control-Allow-Origin'], 'capacitor://localhost')
  assert.equal(res.ended, true)
})

test('OPTIONS from an unknown origin gets 204 without allow-origin', async () => {
  const h = createAgentHandler({ fetchImpl: groq(okPayload).fetchImpl, verifier: okVerifier, env })
  const res = mockRes()
  await h({ method: 'OPTIONS', headers: { origin: 'https://evil.example' } }, res)
  assert.equal(res.statusCode, 204)
  assert.equal(res.headers['Access-Control-Allow-Origin'], undefined)
})

test('405 for non-POST methods', async () => {
  const h = createAgentHandler({ fetchImpl: groq(okPayload).fetchImpl, verifier: okVerifier, env })
  const res = mockRes()
  await h(mkReq({ method: 'GET' }), res)
  assert.equal(res.statusCode, 405)
})

test('500 when the Groq key is not configured', async () => {
  const h = createAgentHandler({ fetchImpl: groq(okPayload).fetchImpl, verifier: okVerifier, env: { OWNER_USER_ID: 'owner-1' } })
  const res = mockRes()
  await h(mkReq(), res)
  assert.equal(res.statusCode, 500)
})

test('success returns { reply } and the upstream call has max_tokens and an AbortSignal', async () => {
  const { fetchImpl, calls } = groq(okPayload)
  const h = createAgentHandler({ fetchImpl, verifier: okVerifier, env: { ...env, GROQ_MODEL: 'test-model' } })
  const res = mockRes()
  await h(mkReq({ headers: { authorization: 'Bearer tok', origin: 'http://localhost:5173' } }), res)
  assert.equal(res.statusCode, 200)
  assert.deepEqual(res.body, { reply: 'hello' })
  assert.equal(res.headers['Access-Control-Allow-Origin'], 'http://localhost:5173')
  assert.equal(calls.length, 1)
  const { url, init } = calls[0]
  assert.match(url, /groq\.com/)
  assert.ok(init.signal instanceof AbortSignal)
  assert.equal(init.headers.Authorization, 'Bearer test-key')
  const sent = JSON.parse(init.body)
  assert.equal(sent.max_tokens, MAX_TOKENS)
  assert.equal(sent.model, 'test-model')
  assert.deepEqual(sent.messages, [
    { role: 'system', content: 'be brief' },
    { role: 'user', content: 'hi' },
  ])
})

test('extra message keys are dropped before the upstream call', async () => {
  const { fetchImpl, calls } = groq(okPayload)
  const h = createAgentHandler({ fetchImpl, verifier: okVerifier, env })
  const res = mockRes()
  await h(mkReq({ body: { systemPrompt: 's', messages: [{ role: 'user', content: 'a', tool_calls: [1] }] } }), res)
  assert.equal(res.statusCode, 200)
  assert.deepEqual(JSON.parse(calls[0].init.body).messages[1], { role: 'user', content: 'a' })
})
