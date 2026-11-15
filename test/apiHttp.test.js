import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Readable } from 'node:stream'
import {
  applyCors,
  handlePreflight,
  readJsonBody,
  setCache,
  parseAllowedOrigins,
  isOriginAllowed,
  HttpError,
} from '../api/_lib/http.js'

function mockRes() {
  const headers = {}
  return {
    headers,
    statusCode: 200,
    ended: false,
    setHeader(k, v) { headers[k.toLowerCase()] = v },
    end() { this.ended = true },
  }
}
const reqFor = (origin, method = 'GET') => ({ method, headers: origin ? { origin } : {} })
const ENV = { ALLOWED_ORIGINS: 'https://app.example.com, https://b.example.com/' }

test('built-in origins are echoed with Vary: Origin', () => {
  for (const o of ['capacitor://localhost', 'https://localhost', 'http://localhost:5173']) {
    const res = mockRes()
    assert.equal(applyCors(reqFor(o), res, {}), true)
    assert.equal(res.headers['access-control-allow-origin'], o)
    assert.equal(res.headers.vary, 'Origin')
  }
})

test('ALLOWED_ORIGINS entries are allowed, trimmed and slash-normalised', () => {
  assert.deepEqual(parseAllowedOrigins(ENV.ALLOWED_ORIGINS), ['https://app.example.com', 'https://b.example.com'])
  for (const o of ['https://app.example.com', 'https://b.example.com']) {
    const res = mockRes()
    assert.equal(applyCors(reqFor(o), res, ENV), true)
    assert.equal(res.headers['access-control-allow-origin'], o)
  }
})

test('unknown or missing origins get no Allow-Origin but still Vary', () => {
  for (const o of ['https://evil.example.com', 'http://localhost:3000', 'null', undefined]) {
    const res = mockRes()
    assert.equal(applyCors(reqFor(o), res, ENV), false)
    assert.equal(res.headers['access-control-allow-origin'], undefined)
    assert.equal(res.headers.vary, 'Origin')
  }
  assert.equal(isOriginAllowed('https://app.example.com', {}), false)
})

test('OPTIONS returns 204 with preflight headers for an allowed origin', () => {
  const res = mockRes()
  assert.equal(handlePreflight(reqFor('capacitor://localhost', 'OPTIONS'), res, {}), true)
  assert.equal(res.statusCode, 204)
  assert.equal(res.ended, true)
  assert.equal(res.headers['access-control-allow-origin'], 'capacitor://localhost')
  assert.match(res.headers['access-control-allow-headers'], /Authorization/)
  assert.match(res.headers['access-control-allow-methods'], /POST/)
})

test('OPTIONS from an unknown origin is 204 with no CORS grant', () => {
  const res = mockRes()
  assert.equal(handlePreflight(reqFor('https://evil.example.com', 'OPTIONS'), res, {}), true)
  assert.equal(res.statusCode, 204)
  assert.equal(res.headers['access-control-allow-origin'], undefined)
  assert.equal(res.headers['access-control-allow-methods'], undefined)
})

test('non-OPTIONS requests are not treated as preflight', () => {
  const res = mockRes()
  assert.equal(handlePreflight(reqFor('https://localhost', 'POST'), res, {}), false)
  assert.equal(res.ended, false)
})

const streamReq = (text, headers = {}) => Object.assign(Readable.from([Buffer.from(text)]), { headers })

test('readJsonBody parses a streamed JSON body', async () => {
  assert.deepEqual(await readJsonBody(streamReq('{"a":1}')), { a: 1 })
})

test('readJsonBody returns {} for an empty body', async () => {
  assert.deepEqual(await readJsonBody(streamReq('')), {})
})

test('readJsonBody rejects an over-cap stream with a 413-able error', async () => {
  await assert.rejects(readJsonBody(streamReq('x'.repeat(200)), { limit: 100 }), (e) => {
    assert.ok(e instanceof HttpError)
    assert.equal(e.status, 413)
    return true
  })
})

test('readJsonBody rejects early on an over-cap Content-Length', async () => {
  const req = streamReq('{}', { 'content-length': '5000' })
  await assert.rejects(readJsonBody(req, { limit: 100 }), (e) => e.status === 413)
})

test('readJsonBody caps a platform-parsed body too', async () => {
  const req = { headers: {}, body: { big: 'y'.repeat(500) } }
  await assert.rejects(readJsonBody(req, { limit: 100 }), (e) => e.status === 413)
  assert.deepEqual(await readJsonBody({ headers: {}, body: { ok: 1 } }, { limit: 100 }), { ok: 1 })
})

test('readJsonBody maps bad JSON to a 400', async () => {
  await assert.rejects(readJsonBody(streamReq('{nope')), (e) => e.status === 400)
})

test('setCache emits s-maxage with optional stale-while-revalidate, or no-store', () => {
  let res = mockRes()
  setCache(res, { sMaxAge: 60, staleWhileRevalidate: 300 })
  assert.equal(res.headers['cache-control'], 'public, max-age=0, s-maxage=60, stale-while-revalidate=300')
  res = mockRes()
  setCache(res, { sMaxAge: 30 })
  assert.equal(res.headers['cache-control'], 'public, max-age=0, s-maxage=30')
  res = mockRes()
  setCache(res)
  assert.equal(res.headers['cache-control'], 'no-store')
})
