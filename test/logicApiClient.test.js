import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createFetchJson, FetchJsonError, CANCELLED, isCancelled } from '../src/logic/apiClient.js'

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const html = (status, body = '<html><body><h1>Gateway Timeout</h1></body></html>') =>
  new Response(body, { status, headers: { 'Content-Type': 'text/html' } })

// A fake apiFetch that honours init.signal, like real fetch does.
const hangUntilAborted = (_path, init) =>
  new Promise((_, reject) => {
    init.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true })
  })

const make = (apiFetch, opts) => createFetchJson({ apiFetch, ...opts })

async function rejection(p) {
  try { await p } catch (e) { return e }
  assert.fail('expected a rejection')
}

test('success returns the parsed JSON and forwards path and init', async () => {
  const calls = []
  const fetchJson = make(async (path, init) => { calls.push({ path, init }); return json({ a: 1 }) })
  assert.deepEqual(await fetchJson('/api/x', { method: 'POST' }), { a: 1 })
  assert.equal(calls[0].path, '/api/x')
  assert.equal(calls[0].init.method, 'POST')
})

test('empty 2xx body resolves to null', async () => {
  const fetchJson = make(async () => new Response(null, { status: 204 }))
  assert.equal(await fetchJson('/api/x'), null)
})

test('JSON {error} body surfaces that message', async () => {
  const fetchJson = make(async () => json({ error: 'Handle not found' }, 400))
  const e = await rejection(fetchJson('/api/cf?handle=__nope__'))
  assert.ok(e instanceof FetchJsonError)
  assert.equal(e.message, 'Handle not found')
  assert.equal(e.kind, 'client')
  assert.equal(e.status, 400)
})

test('JSON {error} on a 502 keeps the message with kind server', async () => {
  const fetchJson = make(async () => json({ error: 'Upstream unavailable' }, 502))
  const e = await rejection(fetchJson('/api/cf'))
  assert.equal(e.kind, 'server')
  assert.equal(e.message, 'Upstream unavailable')
})

test('HTML 504 becomes a server error with no raw SyntaxError text', async () => {
  const fetchJson = make(async () => html(504))
  const e = await rejection(fetchJson('/api/cf'))
  assert.equal(e.kind, 'server')
  assert.equal(e.status, 504)
  assert.match(e.message, /server error/i)
  assert.doesNotMatch(e.message, /SyntaxError|Unexpected token|JSON|<html/i)
})

test('HTML 404 is a client error with a friendly message', async () => {
  const fetchJson = make(async () => html(404, '<!doctype html><title>404</title>'))
  const e = await rejection(fetchJson('/api/cf'))
  assert.equal(e.kind, 'client')
  assert.doesNotMatch(e.message, /SyntaxError|Unexpected token|<!doctype/i)
})

test('a 200 with an HTML body is a parse error, not a SyntaxError', async () => {
  const fetchJson = make(async () => html(200, '<!doctype html><html></html>'))
  const e = await rejection(fetchJson('/api/cf'))
  assert.equal(e.kind, 'parse')
  assert.doesNotMatch(e.message, /SyntaxError|Unexpected token|<!doctype/i)
})

test('network failure maps to the offline kind', async () => {
  const fetchJson = make(async () => { throw new TypeError('Failed to fetch') })
  const e = await rejection(fetchJson('/api/cf'))
  assert.equal(e.kind, 'offline')
  assert.match(e.message, /offline/i)
  assert.doesNotMatch(e.message, /Failed to fetch/)
})

test('a synchronous throw from apiFetch is also offline', async () => {
  const fetchJson = make(() => { throw new TypeError('boom') })
  assert.equal((await rejection(fetchJson('/api/cf'))).kind, 'offline')
})

test('abort via signal resolves to the cancelled marker, not an error', async () => {
  const fetchJson = make(hangUntilAborted)
  const ac = new AbortController()
  const p = fetchJson('/api/cf', { signal: ac.signal })
  ac.abort()
  const r = await p
  assert.equal(r, CANCELLED)
  assert.ok(isCancelled(r))
  assert.equal(r.cancelled, true)
})

test('an already-aborted signal cancels without calling apiFetch', async () => {
  let called = false
  const fetchJson = make(async () => { called = true; return json({}) })
  const ac = new AbortController()
  ac.abort()
  assert.ok(isCancelled(await fetchJson('/api/cf', { signal: ac.signal })))
  assert.equal(called, false)
})

test('abort is honoured even when apiFetch ignores the signal', async () => {
  const fetchJson = make(() => new Promise(() => {}))
  const ac = new AbortController()
  const p = fetchJson('/api/cf', { signal: ac.signal })
  ac.abort()
  assert.ok(isCancelled(await p))
})

test('timeout option rejects with the timeout kind', async () => {
  const fetchJson = make(hangUntilAborted)
  const e = await rejection(fetchJson('/api/cf', { timeoutMs: 20 }))
  assert.equal(e.kind, 'timeout')
  assert.match(e.message, /too long/i)
})

test('timeout works even when apiFetch ignores the signal', async () => {
  const fetchJson = make(() => new Promise(() => {}))
  const e = await rejection(fetchJson('/api/cf', { timeoutMs: 20 }))
  assert.equal(e.kind, 'timeout')
})

test('a fast response beats the timeout and leaves no pending timer', async () => {
  const fetchJson = make(async () => json({ ok: true }))
  assert.deepEqual(await fetchJson('/api/cf', { timeoutMs: 5000 }), { ok: true })
})

test('the factory default timeout applies when no option is given', async () => {
  const fetchJson = make(hangUntilAborted, { timeoutMs: 20 })
  assert.equal((await rejection(fetchJson('/api/cf'))).kind, 'timeout')
})

test('caller abort wins over a pending timeout and is not reported as timeout', async () => {
  const fetchJson = make(hangUntilAborted)
  const ac = new AbortController()
  const p = fetchJson('/api/cf', { signal: ac.signal, timeoutMs: 5000 })
  ac.abort()
  assert.ok(isCancelled(await p))
})
