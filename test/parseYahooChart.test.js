import test from 'node:test'
import assert from 'node:assert/strict'
import { parseYahooChart } from '../api/_lib/parseYahooChart.js'

function fixture(meta) {
  return { chart: { result: [{ meta }], error: null } }
}

test('parses price, change % and 52-week range from a chart response', () => {
  const out = parseYahooChart(fixture({
    symbol: 'RELIANCE.NS',
    longName: 'Reliance Industries Limited',
    regularMarketPrice: 2856.5,
    chartPreviousClose: 2800,
    fiftyTwoWeekHigh: 3200,
    fiftyTwoWeekLow: 2200,
    currency: 'INR',
  }))
  assert.equal(out.symbol, 'RELIANCE.NS')
  assert.equal(out.name, 'Reliance Industries Limited')
  assert.equal(out.price, 2856.5)
  assert.equal(out.prevClose, 2800)
  assert.equal(Math.round(out.changePct * 100) / 100, 2.02)
  assert.equal(out.high52, 3200)
  assert.equal(out.low52, 2200)
  assert.equal(out.currency, 'INR')
})

test('falls back to the symbol as name when longName is missing', () => {
  const out = parseYahooChart(fixture({
    symbol: 'TCS.NS',
    regularMarketPrice: 4000,
    chartPreviousClose: 4000,
  }))
  assert.equal(out.name, 'TCS.NS')
})

test('changePct is null when previous close is missing or zero', () => {
  const out = parseYahooChart(fixture({
    symbol: 'TCS.NS',
    regularMarketPrice: 4000,
    chartPreviousClose: 0,
  }))
  assert.equal(out.changePct, null)
})

test('throws when the chart result is missing (bad symbol)', () => {
  assert.throws(() => parseYahooChart({ chart: { result: null, error: { description: 'No data found' } } }))
})

function withCloses(meta, close) {
  return { chart: { result: [{ meta, indicators: { quote: [{ close }] } }], error: null } }
}

test('closes array drops nulls and non-numbers', () => {
  const out = parseYahooChart(withCloses(
    { symbol: 'TCS.NS', regularMarketPrice: 105, chartPreviousClose: 100 },
    [100, null, 102, undefined, NaN, 'x', 105],
  ), '1mo')
  assert.deepEqual(out.closes, [100, 102, 105])
})

test('closes is an empty array when the response has no indicators', () => {
  const out = parseYahooChart(fixture({ symbol: 'TCS.NS', regularMarketPrice: 10, chartPreviousClose: 10 }))
  assert.deepEqual(out.closes, [])
})

test('changePct uses the last two closes when range is longer than 1d', () => {
  // chartPreviousClose is the close before the range (50): it must be ignored.
  const out = parseYahooChart(withCloses(
    { symbol: 'TCS.NS', regularMarketPrice: 110, chartPreviousClose: 50 },
    [60, null, 100, 110],
  ), '1mo')
  assert.equal(out.prevClose, 100)
  assert.equal(Math.round(out.changePct * 100) / 100, 10)
})

test('changePct uses meta.range when no range argument is given', () => {
  const out = parseYahooChart(withCloses(
    { symbol: 'TCS.NS', range: '5d', regularMarketPrice: 110, chartPreviousClose: 50 },
    [100, 110],
  ))
  assert.equal(Math.round(out.changePct * 100) / 100, 10)
})

test('range 1d keeps the chartPreviousClose calculation even with closes present', () => {
  const out = parseYahooChart(withCloses(
    { symbol: 'TCS.NS', regularMarketPrice: 110, chartPreviousClose: 100 },
    [90, 110],
  ), '1d')
  assert.equal(out.prevClose, 100)
  assert.equal(Math.round(out.changePct * 100) / 100, 10)
})

test('multi-day range with fewer than two closes falls back to chartPreviousClose', () => {
  const out = parseYahooChart(withCloses(
    { symbol: 'TCS.NS', regularMarketPrice: 110, chartPreviousClose: 100 },
    [null, 110],
  ), '1mo')
  assert.equal(out.prevClose, 100)
  assert.equal(Math.round(out.changePct * 100) / 100, 10)
})

test('multi-day changePct is null when the second-to-last close is zero', () => {
  const out = parseYahooChart(withCloses({ symbol: 'X.NS', regularMarketPrice: 5 }, [0, 5]), '5d')
  assert.equal(out.changePct, null)
})

// --- handler validation (400 paths return before any fetch, so no network) ---
const { default: handler, isAllowedSymbol, RANGES } = await import('../api/quote.js')

function call(query) {
  let status, body
  const res = { status(s) { status = s; return this }, json(b) { body = b; return this } }
  return Promise.resolve(handler({ query }, res)).then(() => ({ status, body }))
}

test('range outside 1d|5d|1mo|3mo returns 400', async () => {
  assert.deepEqual(RANGES, ['1d', '5d', '1mo', '3mo'])
  for (const range of ['1y', '2d', 'max', '1MO', '../x', ['1d', '5d']]) {
    const { status } = await call({ symbols: 'TCS.NS', range })
    assert.equal(status, 400, `range ${range}`)
  }
})

test('SYMBOL_RE allowlist still rejects anything but .NS/.BO', async () => {
  for (const s of ['AAPL', '^NSEI', 'TCS.NSX', 'TCS.NS/../x', 'A B.NS', '^GSPC']) {
    const { status, body } = await call({ symbols: s, range: '1mo' })
    assert.equal(status, 400, s)
    assert.match(body.error, /invalid symbols/)
  }
})

test('isAllowedSymbol: .NS/.BO and exact named indexes only', () => {
  assert.equal(isAllowedSymbol('TCS.NS'), true)
  assert.equal(isAllowedSymbol('M&M.BO'), true)
  assert.equal(isAllowedSymbol('^NSEI', []), false)
  assert.equal(isAllowedSymbol('^NSEI', ['^NSEI']), true)
  assert.equal(isAllowedSymbol('^NSEI2', ['^NSEI']), false)
  assert.equal(isAllowedSymbol('^GSPC', ['^NSEI']), false)
})
