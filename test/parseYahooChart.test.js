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
