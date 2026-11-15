import test from 'node:test'
import assert from 'node:assert/strict'
import cfHandler, {
  PROBLEMS_CACHE_TTL_MS,
  RATE_LIMIT_MESSAGE,
  resetProblemsCache,
} from '../api/cf.js'
import puzzleHandler from '../api/puzzle.js'

function mockRes() {
  return {
    statusCode: 200, headers: {}, body: undefined, ended: false,
    setHeader(k, v) { this.headers[k] = v },
    status(c) { this.statusCode = c; return this },
    json(b) { this.body = b; this.ended = true; return this },
    end() { this.ended = true },
  }
}
const mkReq = (query = {}, method = 'GET') => ({ method, headers: {}, query })

const PROBLEMS = [
  { contestId: 1, index: 'A', name: 'Easy', rating: 1200, tags: ['math'] },
  { contestId: 2, index: 'B', name: 'Mid', rating: 1300, tags: ['dp'] },
]
const ok = (result) => ({ status: 'OK', result })

// Routes a stubbed global fetch by Codeforces method name.
function stubFetch(t, routes) {
  const calls = []
  const orig = globalThis.fetch
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init })
    const key = Object.keys(routes).find((k) => String(url).includes(k))
    if (!key) throw new Error(`unrouted ${url}`)
    const r = routes[key]
    return typeof r === 'function' ? r(url, init) : r
  }
  t.after(() => { globalThis.fetch = orig })
  return calls
}
const json = (payload, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => payload })
const happyRoutes = () => ({
  'problemset.problems': json(ok({ problems: PROBLEMS })),
  'user.info': json(ok([{ rating: 1250 }])),
  'user.status': json(ok([{ verdict: 'OK', problem: { contestId: 1, index: 'A', tags: ['math'] } }])),
})
const quiet = (t) => {
  const orig = console.error
  console.error = () => {}
  t.after(() => { console.error = orig })
}
const countCalls = (calls, name) => calls.filter((c) => c.url.includes(name)).length

test.beforeEach(() => resetProblemsCache())

test('cf: empty or missing handle -> 400 and no upstream call', async (t) => {
  const calls = stubFetch(t, happyRoutes())
  for (const q of [{}, { handle: '   ' }]) {
    const res = mockRes()
    await cfHandler(mkReq(q), res)
    assert.equal(res.statusCode, 400)
    assert.deepEqual(res.body, { error: 'handle required' })
  }
  assert.equal(calls.length, 0)
})

test('cf: happy path returns unsolved problems, passes an abort signal, sets CDN cache', async (t) => {
  const calls = stubFetch(t, happyRoutes())
  const res = mockRes()
  await cfHandler(mkReq({ handle: 'tourist' }), res)
  assert.equal(res.statusCode, 200)
  assert.equal(res.body.rating, 1250)
  assert.deepEqual(res.body.problems.map((p) => p.id), ['2B'])
  assert.match(res.headers['Cache-Control'], /s-maxage=120/)
  assert.ok(calls.length >= 3)
  for (const c of calls) assert.ok(c.init && c.init.signal instanceof AbortSignal)
})

test('cf: Codeforces FAILED -> 502 carrying the CF comment', async (t) => {
  stubFetch(t, {
    ...happyRoutes(),
    // CF really answers these with HTTP 400 plus a JSON body.
    'user.info': json({ status: 'FAILED', comment: 'handles: User with handle nobody not found' }, 400),
  })
  const res = mockRes()
  await cfHandler(mkReq({ handle: 'nobody' }), res)
  assert.equal(res.statusCode, 502)
  assert.equal(res.body.error, 'handles: User with handle nobody not found')
  assert.equal(res.headers['Cache-Control'], 'no-store')
})

test('cf: "Call limit exceeded" -> friendly retry-later message', async (t) => {
  stubFetch(t, {
    ...happyRoutes(),
    'problemset.problems': json({ status: 'FAILED', comment: 'Call limit exceeded' }, 503),
  })
  const res = mockRes()
  await cfHandler(mkReq({ handle: 'tourist' }), res)
  assert.equal(res.statusCode, 429)
  assert.equal(res.body.error, RATE_LIMIT_MESSAGE)
  assert.match(res.body.error, /try again/i)
  assert.doesNotMatch(res.body.error, /Call limit exceeded/)
  assert.equal(res.headers['Retry-After'], '60')
})

test('cf: non-JSON upstream body -> generic 502 JSON, no parser message leaks', async (t) => {
  quiet(t)
  stubFetch(t, {
    ...happyRoutes(),
    'problemset.problems': {
      ok: false, status: 504,
      json: async () => { throw new SyntaxError('Unexpected token < in JSON at position 0') },
    },
  })
  const res = mockRes()
  await cfHandler(mkReq({ handle: 'tourist' }), res)
  assert.equal(res.statusCode, 502)
  assert.deepEqual(res.body, { error: 'Could not reach Codeforces' })
})

test('cf: HTTP error with an OK-looking body is still a generic 502', async (t) => {
  quiet(t)
  stubFetch(t, { ...happyRoutes(), 'problemset.problems': json(ok({ problems: PROBLEMS }), 500) })
  const res = mockRes()
  await cfHandler(mkReq({ handle: 'tourist' }), res)
  assert.equal(res.statusCode, 502)
  assert.deepEqual(res.body, { error: 'Could not reach Codeforces' })
})

test('cf: AbortSignal.timeout rejection -> generic 502 JSON', async (t) => {
  quiet(t)
  stubFetch(t, {
    ...happyRoutes(),
    'problemset.problems': (_url, init) => {
      assert.ok(init.signal instanceof AbortSignal)
      throw new DOMException('The operation was aborted due to timeout', 'TimeoutError')
    },
  })
  const res = mockRes()
  await cfHandler(mkReq({ handle: 'tourist' }), res)
  assert.equal(res.statusCode, 502)
  assert.deepEqual(res.body, { error: 'Could not reach Codeforces' })
})

test('cf: problemsCache is reused within the TTL and refetched after it', async (t) => {
  const calls = stubFetch(t, happyRoutes())
  let now = 1_000_000
  t.mock.method(Date, 'now', () => now)

  await cfHandler(mkReq({ handle: 'a' }), mockRes())
  assert.equal(countCalls(calls, 'problemset.problems'), 1)

  now += PROBLEMS_CACHE_TTL_MS - 1
  await cfHandler(mkReq({ handle: 'a' }), mockRes())
  assert.equal(countCalls(calls, 'problemset.problems'), 1, 'still cached just before the TTL')

  now += 1
  await cfHandler(mkReq({ handle: 'a' }), mockRes())
  assert.equal(countCalls(calls, 'problemset.problems'), 2, 'expired exactly at the TTL')
})

test('cf: a failed problemset fetch is not cached', async (t) => {
  quiet(t)
  let fail = true
  const calls = stubFetch(t, {
    ...happyRoutes(),
    'problemset.problems': () => (fail ? json({ status: 'FAILED', comment: 'boom' }, 400) : json(ok({ problems: PROBLEMS }))),
  })
  const bad = mockRes()
  await cfHandler(mkReq({ handle: 'a' }), bad)
  assert.equal(bad.statusCode, 502)
  fail = false
  const good = mockRes()
  await cfHandler(mkReq({ handle: 'a' }), good)
  assert.equal(good.statusCode, 200)
  assert.equal(countCalls(calls, 'problemset.problems'), 2)
})

test('cf: non-GET -> 405', async (t) => {
  stubFetch(t, happyRoutes())
  const res = mockRes()
  await cfHandler(mkReq({ handle: 'a' }, 'POST'), res)
  assert.equal(res.statusCode, 405)
})

// ---- /api/puzzle ----

test('puzzle: success sets Cache-Control and uses a timeout signal', async (t) => {
  const calls = stubFetch(t, {
    'puzzle/daily': json({ puzzle: { id: 'abc12', rating: 1500, themes: ['fork'] } }),
  })
  const res = mockRes()
  await puzzleHandler(mkReq(), res)
  assert.equal(res.statusCode, 200)
  assert.deepEqual(res.body, {
    id: 'abc12', rating: 1500, themes: ['fork'], url: 'https://lichess.org/training/abc12',
  })
  assert.match(res.headers['Cache-Control'], /s-maxage=600/)
  assert.ok(calls[0].init.signal instanceof AbortSignal)
})

test('puzzle: non-OK upstream -> JSON 502, no-store', async (t) => {
  quiet(t)
  stubFetch(t, { 'puzzle/daily': json({}, 429) })
  const res = mockRes()
  await puzzleHandler(mkReq(), res)
  assert.equal(res.statusCode, 502)
  assert.equal(typeof res.body.error, 'string')
  assert.equal(res.headers['Cache-Control'], 'no-store')
})

test('puzzle: non-JSON, malformed payload and timeout -> JSON 502', async (t) => {
  quiet(t)
  const cases = [
    { ok: true, status: 200, json: async () => { throw new SyntaxError('bad json') } },
    json({ nope: true }),
    () => { throw new DOMException('timeout', 'TimeoutError') },
  ]
  for (const c of cases) {
    stubFetch(t, { 'puzzle/daily': c })
    const res = mockRes()
    await puzzleHandler(mkReq(), res)
    assert.equal(res.statusCode, 502)
    assert.equal(typeof res.body.error, 'string')
    assert.equal(res.headers['Cache-Control'], 'no-store')
  }
})
