import test from 'node:test'
import assert from 'node:assert/strict'
import { toICS, validateICSInput } from '../api/_lib/ics.js'

test('toICS produces a VCALENDAR with the event title, start time and an alarm', () => {
  const out = toICS({ title: 'Call mom', start: new Date('2026-09-15T17:00:00Z') })
  assert.match(out, /BEGIN:VCALENDAR/)
  assert.match(out, /BEGIN:VEVENT/)
  assert.match(out, /SUMMARY:Call mom/)
  assert.match(out, /DTSTART:20260915T170000Z/)
  assert.match(out, /BEGIN:VALARM/)
  assert.match(out, /END:VCALENDAR/)
})

test('toICS escapes commas, semicolons and backslashes in the title', () => {
  const out = toICS({ title: 'Buy: milk, eggs; bread\\stuff', start: new Date('2026-09-15T17:00:00Z') })
  assert.match(out, /SUMMARY:Buy: milk\\, eggs\\; bread\\\\stuff/)
})

test('validateICSInput accepts a title and a valid ISO start date', () => {
  const out = validateICSInput({ title: 'Gym', start: '2026-09-15T17:00:00+05:30' })
  assert.equal(out.error, null)
  assert.equal(out.title, 'Gym')
  assert.ok(out.start instanceof Date)
})

test('validateICSInput rejects a missing title', () => {
  const out = validateICSInput({ title: '', start: '2026-09-15T17:00:00Z' })
  assert.equal(out.error, 'title is required')
})

test('validateICSInput rejects a title over 200 characters', () => {
  const out = validateICSInput({ title: 'x'.repeat(201), start: '2026-09-15T17:00:00Z' })
  assert.equal(out.error, 'title is too long')
})

test('validateICSInput rejects an unparseable start date', () => {
  const out = validateICSInput({ title: 'Gym', start: 'not-a-date' })
  assert.equal(out.error, 'start is not a valid date')
})

test('validateICSInput rejects a missing start date', () => {
  const out = validateICSInput({ title: 'Gym' })
  assert.equal(out.error, 'start is not a valid date')
})

// ---- CRLF injection -------------------------------------------------------

const EVIL = 'Gym%0D%0AATTENDEE:mailto:evil@example.com%0D%0AX-EVIL:1'

function propertyNames(ics) {
  return ics.split('\r\n').map((l) => l.split(/[:;]/)[0])
}

test('a title containing %0D%0A cannot add a property line', () => {
  const v = validateICSInput({ title: decodeURIComponent(EVIL), start: '2026-09-15T17:00:00Z' })
  assert.equal(v.error, null)
  const out = toICS({ title: v.title, start: v.start })
  const names = propertyNames(out)
  assert.ok(!names.includes('ATTENDEE'))
  assert.ok(!names.includes('X-EVIL'))
  assert.equal(out.split('\r\n').length, 15) // same shape as a clean title
})

test('toICS itself neutralises CR, LF, NUL and unicode line breaks (not only the validator)', () => {
  const out = toICS({ title: 'a\rb\nc\u0000d e f\u0085g', start: new Date('2026-09-15T17:00:00Z') })
  assert.match(out, /SUMMARY:a b c d e f g\r\n/)
  assert.equal(out.split('\r\n').length, 15)
})

test('validateICSInput rejects a title made only of control characters', () => {
  const out = validateICSInput({ title: '\r\n\r\n', start: '2026-09-15T17:00:00Z' })
  assert.equal(out.error, 'title is required')
})

// ---- handlers: CORS, method guards, cache headers (fakes, no network) -----

function mockRes() {
  const headers = {}
  const res = {
    headers,
    statusCode: 200,
    body: undefined,
    ended: false,
    setHeader(k, v) { headers[k.toLowerCase()] = v },
    status(c) { res.statusCode = c; return res },
    json(o) { res.body = o; res.ended = true },
    end(b) { if (b !== undefined) res.body = b; res.ended = true },
  }
  return res
}

const req = (method, query = {}, origin) => ({ method, query, headers: origin ? { origin } : {} })

async function withFakeFetch(impl, fn) {
  const real = globalThis.fetch
  globalThis.fetch = impl
  try { return await fn() } finally { globalThis.fetch = real }
}
const noNetwork = () => { throw new Error('network must not be used') }

const handlers = {
  cf: (await import('../api/cf.js')).default,
  puzzle: (await import('../api/puzzle.js')).default,
  quote: (await import('../api/quote.js')).default,
  ics: (await import('../api/ics.js')).default,
  health: (await import('../api/health.js')).default,
}

for (const [name, handler] of Object.entries(handlers)) {
  test(`${name}: OPTIONS from an allowed origin answers 204 with Access-Control-Allow-Origin`, async () => {
    const res = mockRes()
    await withFakeFetch(noNetwork, () => handler(req('OPTIONS', {}, 'capacitor://localhost'), res))
    assert.equal(res.statusCode, 204)
    assert.equal(res.headers['access-control-allow-origin'], 'capacitor://localhost')
  })

  test(`${name}: OPTIONS from an unknown origin gets 204 without CORS allow headers`, async () => {
    const res = mockRes()
    await withFakeFetch(noNetwork, () => handler(req('OPTIONS', {}, 'https://evil.example'), res))
    assert.equal(res.statusCode, 204)
    assert.equal(res.headers['access-control-allow-origin'], undefined)
  })

  test(`${name}: POST returns 405 with Allow and no-store`, async () => {
    const res = mockRes()
    await withFakeFetch(noNetwork, () => handler(req('POST', {}, 'capacitor://localhost'), res))
    assert.equal(res.statusCode, 405)
    assert.match(res.headers.allow, /GET/)
    assert.equal(res.headers['cache-control'], 'no-store')
    assert.equal(res.headers['access-control-allow-origin'], 'capacitor://localhost')
  })
}

test('puzzle: GET success carries s-maxage and CORS for an allowed origin', async () => {
  const fake = async () => ({ ok: true, json: async () => ({ puzzle: { id: 'abc', rating: 1500, themes: ['fork'] } }) })
  const res = mockRes()
  await withFakeFetch(fake, () => handlers.puzzle(req('GET', {}, 'capacitor://localhost'), res))
  assert.equal(res.statusCode, 200)
  assert.match(res.headers['cache-control'], /s-maxage=\d+/)
  assert.equal(res.headers['access-control-allow-origin'], 'capacitor://localhost')
  assert.equal(res.headers.vary, 'Origin')
  assert.equal(res.body.id, 'abc')
})

test('puzzle: an upstream failure is not cached', async () => {
  const res = mockRes()
  const origError = console.error
  console.error = () => {}
  try {
    await withFakeFetch(async () => ({ ok: false, status: 500 }), () => handlers.puzzle(req('GET'), res))
  } finally { console.error = origError }
  assert.equal(res.statusCode, 502)
  assert.equal(res.headers['cache-control'], 'no-store')
})

test('health: GET answers ok with no-store', async () => {
  const res = mockRes()
  await handlers.health(req('GET'), res)
  assert.equal(res.statusCode, 200)
  assert.deepEqual(res.body, { ok: true })
  assert.equal(res.headers['cache-control'], 'no-store')
})

test('cf: a handle over 50 characters is rejected before any upstream call', async () => {
  const res = mockRes()
  await withFakeFetch(noNetwork, () => handlers.cf(req('GET', { handle: 'x'.repeat(51) }), res))
  assert.equal(res.statusCode, 400)
  assert.equal(res.body.error, 'handle is too long')
})

test('cf: a missing or array-valued handle is a 400, not a crash', async () => {
  for (const handle of [undefined, ['a', 'b']]) {
    const res = mockRes()
    await withFakeFetch(noNetwork, () => handlers.cf(req('GET', { handle }), res))
    assert.equal(res.statusCode, 400)
    assert.equal(res.body.error, 'handle required')
  }
})

test('quote: validation errors are 400 and not cached', async () => {
  const res = mockRes()
  await withFakeFetch(noNetwork, () => handlers.quote(req('GET', { symbols: 'bad!' }), res))
  assert.equal(res.statusCode, 400)
  assert.equal(res.headers['cache-control'], 'no-store')
})

test('ics handler: %0D%0A in the title cannot add a property line to the download', async () => {
  const res = mockRes()
  handlers.ics(req('GET', { title: decodeURIComponent(EVIL), start: '2026-09-15T17:00:00Z' }), res)
  assert.equal(res.statusCode, 200)
  assert.equal(res.headers['content-type'], 'text/calendar; charset=utf-8')
  assert.equal(res.headers['cache-control'], 'no-store')
  const names = propertyNames(res.body)
  assert.ok(!names.includes('ATTENDEE'))
  assert.ok(!names.includes('X-EVIL'))
})
