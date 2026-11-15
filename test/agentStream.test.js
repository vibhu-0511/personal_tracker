import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { createAgentHandler, UPSTREAM_TIMEOUT_MS } from '../api/agent.js'

// Injected fakes only: no real fetch, no network, the real model provider is
// never contacted.
const env = { OWNER_USER_ID: 'owner-1', GROQ_API_KEY: 'test-key' }
const okVerifier = async () => 'owner-1'
const goodBody = { systemPrompt: 'be brief', messages: [{ role: 'user', content: 'hi' }] }

function mockRes() {
  const res = new EventEmitter()
  Object.assign(res, {
    statusCode: 200, headers: {}, chunks: [], body: undefined, ended: false, writableEnded: false,
    setHeader(k, v) { this.headers[k] = v },
    status(c) { this.statusCode = c; return this },
    json(b) { this.body = b; this.ended = true; this.writableEnded = true; return this },
    write(c) { this.chunks.push(c); return true },
    end() { this.ended = true; this.writableEnded = true },
    // Simulates the socket going away before the response finished.
    disconnect() { this.emit('close') },
  })
  return res
}
const mkReq = (body = goodBody) => ({ method: 'POST', headers: { authorization: 'Bearer tok' }, body })
const frame = (content) => `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`
const events = (res) => res.chunks.map((c) => JSON.parse(c.replace(/^data: /, '').trim()))
const quiet = async (fn) => {
  const orig = console.error
  console.error = () => {}
  try { return await fn() } finally { console.error = orig }
}

// Fake fetch whose body yields the given string chunks (text, as a TextEncoder
// would deliver bytes in a real fetch).
function streamingFetch(chunks, { ok = true, status = 200 } = {}) {
  const calls = []
  const fetchImpl = async (url, init) => {
    calls.push({ url, init })
    const enc = new TextEncoder()
    return {
      ok, status,
      body: (async function* () { for (const c of chunks) yield enc.encode(c) })(),
      json: async () => ({ choices: [{ message: { content: 'plain reply' } }] }),
    }
  }
  return { fetchImpl, calls }
}

test('stream:true answers text/event-stream, no-cache, deltas then one done event', async () => {
  const { fetchImpl, calls } = streamingFetch([frame('Hel'), frame('lo'), 'data: [DONE]\n\n'])
  const h = createAgentHandler({ fetchImpl, verifier: okVerifier, env, usageStorage: null })
  const res = mockRes()
  await quiet(() => h(mkReq({ ...goodBody, stream: true }), res))
  assert.equal(res.statusCode, 200)
  assert.match(res.headers['Content-Type'], /^text\/event-stream/)
  assert.equal(res.headers['Cache-Control'], 'no-cache, no-transform')
  assert.deepEqual(events(res), [
    { type: 'delta', text: 'Hel' },
    { type: 'delta', text: 'lo' },
    { type: 'done', reply: 'Hello' },
  ])
  assert.equal(res.ended, true)
  assert.equal(JSON.parse(calls[0].init.body).stream, true)
})

test('events split across arbitrary chunk boundaries are reassembled', async () => {
  const whole = frame('abc') + frame('def') + 'data: [DONE]\n\n'
  const parts = [whole.slice(0, 7), whole.slice(7, 40), whole.slice(40)]
  const { fetchImpl } = streamingFetch(parts)
  const h = createAgentHandler({ fetchImpl, verifier: okVerifier, env, usageStorage: null })
  const res = mockRes()
  await h(mkReq({ ...goodBody, stream: true }), res)
  const ev = events(res)
  assert.deepEqual(ev.filter((x) => x.type === 'delta').map((x) => x.text), ['abc', 'def'])
  assert.deepEqual(ev.at(-1), { type: 'done', reply: 'abcdef' })
})

test('client disconnect aborts the upstream request and writes nothing more', async () => {
  let upstreamSignal
  let release
  const gate = new Promise((r) => { release = r })
  const fetchImpl = async (url, init) => {
    upstreamSignal = init.signal
    const enc = new TextEncoder()
    return {
      ok: true, status: 200,
      body: (async function* () {
        yield enc.encode(frame('one'))
        await gate // upstream stalls until the test lets go
        if (init.signal.aborted) throw new Error('aborted')
        yield enc.encode(frame('two'))
        yield enc.encode('data: [DONE]\n\n')
      })(),
    }
  }
  const h = createAgentHandler({ fetchImpl, verifier: okVerifier, env, usageStorage: null })
  const res = mockRes()
  const done = h(mkReq({ ...goodBody, stream: true }), res)
  while (res.chunks.length < 1) await new Promise((r) => setImmediate(r))
  assert.equal(upstreamSignal.aborted, false)
  res.disconnect()
  assert.equal(upstreamSignal.aborted, true)
  release()
  await quiet(() => done)
  assert.deepEqual(events(res), [{ type: 'delta', text: 'one' }])
  assert.equal(res.ended, false) // nothing is written or ended on a dead socket
})

test('upstream error status before any byte is the normal 502 JSON, not a stream', async () => {
  const { fetchImpl } = streamingFetch([], { ok: false, status: 500 })
  const h = createAgentHandler({ fetchImpl, verifier: okVerifier, env, usageStorage: null })
  const res = mockRes()
  await quiet(() => h(mkReq({ ...goodBody, stream: true }), res))
  assert.equal(res.statusCode, 502)
  assert.deepEqual(res.body, { error: 'Could not reach the agent service' })
  assert.equal(res.headers['Content-Type'], undefined)
})

test('a stream that dies midway ends with a generic error event, no leaked detail', async () => {
  const fetchImpl = async () => ({
    ok: true, status: 200,
    body: (async function* () {
      yield new TextEncoder().encode(frame('part'))
      throw new Error('secret upstream detail')
    })(),
  })
  const h = createAgentHandler({ fetchImpl, verifier: okVerifier, env, usageStorage: null })
  const res = mockRes()
  await quiet(() => h(mkReq({ ...goodBody, stream: true }), res))
  assert.deepEqual(events(res), [
    { type: 'delta', text: 'part' },
    { type: 'error', error: 'Could not reach the agent service' },
  ])
  assert.equal(res.ended, true)
  assert.ok(!res.chunks.join('').includes('secret'))
})

test('a stream with no content yields an error event instead of an empty done', async () => {
  const { fetchImpl } = streamingFetch(['data: [DONE]\n\n'])
  const h = createAgentHandler({ fetchImpl, verifier: okVerifier, env, usageStorage: null })
  const res = mockRes()
  await quiet(() => h(mkReq({ ...goodBody, stream: true }), res))
  assert.deepEqual(events(res), [{ type: 'error', error: 'Could not reach the agent service' }])
})

test('non-stream requests still return { reply } and never ask upstream to stream', async () => {
  for (const body of [goodBody, { ...goodBody, stream: false }, { ...goodBody, stream: 'true' }, { ...goodBody, stream: 1 }]) {
    const { fetchImpl, calls } = streamingFetch([])
    const h = createAgentHandler({ fetchImpl, verifier: okVerifier, env, usageStorage: null })
    const res = mockRes()
    await h(mkReq(body), res)
    assert.equal(res.statusCode, 200)
    assert.deepEqual(res.body, { reply: 'plain reply' })
    assert.equal(res.headers['Content-Type'], undefined)
    assert.equal('stream' in JSON.parse(calls[0].init.body), false)
    assert.equal(res.chunks.length, 0)
  }
})

test('stream mode keeps the owner gate and validation', async () => {
  const { fetchImpl, calls } = streamingFetch([frame('x')])
  const h = createAgentHandler({ fetchImpl, verifier: async () => 'intruder', env, usageStorage: null })
  const res = mockRes()
  await h(mkReq({ ...goodBody, stream: true }), res)
  assert.equal(res.statusCode, 403)
  const h2 = createAgentHandler({ fetchImpl, verifier: okVerifier, env, usageStorage: null })
  const res2 = mockRes()
  await h2(mkReq({ stream: true, messages: [] }), res2)
  assert.equal(res2.statusCode, 400)
  assert.equal(calls.length, 0)
})

test('upstream deadline constant is unchanged', () => {
  assert.equal(UPSTREAM_TIMEOUT_MS, 20_000)
})
