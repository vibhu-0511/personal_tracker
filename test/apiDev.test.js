import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { createApiMiddleware, MAX_BODY_BYTES } from '../vite-plugins/apiDev.js'

const calls = []
const handlers = {
  echo(req, res) {
    calls.push({ method: req.method, body: req.body, query: req.query })
    res.status(200).json({ method: req.method, body: req.body ?? null, query: req.query })
  },
  boom() {
    throw new Error('kaboom')
  },
}

let server
let base

before(async () => {
  const mw = createApiMiddleware({
    getModule: async (name) => {
      if (!handlers[name]) throw new Error('missing')
      return { default: handlers[name] }
    },
  })
  server = http.createServer((req, res) => {
    mw(req, res, () => {
      res.statusCode = 404
      res.end('next')
    })
  })
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  base = `http://127.0.0.1:${server.address().port}`
})

after(() => new Promise((r) => server.close(r)))

const post = (path, body, headers = {}) =>
  fetch(base + path, { method: 'POST', body, headers: { 'content-type': 'application/json', ...headers } })

test('valid JSON body is parsed and reaches the handler', async () => {
  const res = await post('/api/echo?x=1', JSON.stringify({ a: 1 }))
  assert.equal(res.status, 200)
  const j = await res.json()
  assert.deepEqual(j.body, { a: 1 })
  assert.deepEqual(j.query, { x: '1' })
})

test('empty POST body becomes {}', async () => {
  const res = await post('/api/echo', '')
  assert.equal(res.status, 200)
  assert.deepEqual((await res.json()).body, {})
})

test('malformed JSON body returns 400', async () => {
  const before = calls.length
  const res = await post('/api/echo', '{not json')
  assert.equal(res.status, 400)
  assert.equal((await res.json()).error, 'Invalid JSON body')
  assert.equal(calls.length, before, 'handler must not run')
})

test('body over 1 MB returns 413', async () => {
  assert.equal(MAX_BODY_BYTES, 1024 * 1024)
  const before = calls.length
  const big = JSON.stringify({ pad: 'x'.repeat(MAX_BODY_BYTES + 10) })
  const res = await post('/api/echo', big)
  assert.equal(res.status, 413)
  assert.equal(calls.length, before, 'handler must not run')
})

test('body of exactly the cap is accepted', async () => {
  const overhead = JSON.stringify({ pad: '' }).length
  const body = JSON.stringify({ pad: 'x'.repeat(MAX_BODY_BYTES - overhead) })
  assert.equal(Buffer.byteLength(body), MAX_BODY_BYTES)
  const res = await post('/api/echo', body)
  assert.equal(res.status, 200)
})

test('OPTIONS reaches the handler', async () => {
  const res = await fetch(base + '/api/echo', { method: 'OPTIONS' })
  assert.equal(res.status, 200)
  assert.equal((await res.json()).method, 'OPTIONS')
  assert.equal(calls.at(-1).method, 'OPTIONS')
})

test('handler errors return 500 and non-api paths fall through', async () => {
  const orig = console.error
  console.error = () => {}
  try {
    const res = await fetch(base + '/api/boom')
    assert.equal(res.status, 500)
    assert.deepEqual(await res.json(), { error: 'Internal error' })
  } finally {
    console.error = orig
  }
  const other = await fetch(base + '/index.html')
  assert.equal(other.status, 404)
  assert.equal(await other.text(), 'next')
})

test('path traversal is rejected with 400', async () => {
  const res = await fetch(base + '/api/a..b', { method: 'GET' })
  assert.equal(res.status, 400)
})
