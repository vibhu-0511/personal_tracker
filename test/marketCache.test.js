import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createMarketClient, TTL_MS } from '../src/invest/market.js'

const json = (body, ok = true, status = 200) => ({ ok, status, json: async () => body })

function setup({ onQuote, onExt } = {}) {
  const calls = { api: [], ext: [] }
  let t = 1_000_000
  const apiFetch = async (path) => {
    calls.api.push(path)
    await Promise.resolve()
    return onQuote ? onQuote(path) : json({ quotes: [] })
  }
  const fetchImpl = async (url) => {
    calls.ext.push(url)
    await Promise.resolve()
    return onExt ? onExt(url) : json({})
  }
  const client = createMarketClient({ apiFetch, fetchImpl, now: () => t })
  return { calls, client, advance: (ms) => { t += ms } }
}

const quoteFor = (path) => {
  const syms = decodeURIComponent(path.split('symbols=')[1]).split(',')
  return json({ quotes: syms.map((symbol) => ({ symbol, price: 10 })), errors: [] })
}

test('two concurrent quote calls hit fetch once', async () => {
  const { client, calls } = setup({ onQuote: quoteFor })
  const [a, b] = await Promise.all([client.getQuotes(['AAA.NS']), client.getQuotes(['AAA.NS'])])
  assert.equal(calls.api.length, 1)
  assert.equal(a['AAA.NS'].price, 10)
  assert.deepEqual(a, b)
})

test('overlapping symbol sets only fetch the missing symbols', async () => {
  const { client, calls } = setup({ onQuote: quoteFor })
  await Promise.all([client.getQuotes(['AAA.NS']), client.getQuotes(['AAA.NS', 'BBB.NS'])])
  assert.equal(calls.api.length, 2)
  assert.ok(calls.api[1].endsWith('symbols=BBB.NS'))
})

test('quote entries expire after 60s', async () => {
  const { client, calls, advance } = setup({ onQuote: quoteFor })
  await client.getQuotes(['AAA.NS'])
  advance(TTL_MS - 1)
  await client.getQuotes(['AAA.NS'])
  assert.equal(calls.api.length, 1)
  advance(1)
  await client.getQuotes(['AAA.NS'])
  assert.equal(calls.api.length, 2)
})

test('a failed symbol yields {error:true} without failing others, and is not cached', async () => {
  let fail = true
  const { client, calls } = setup({
    onQuote: () => json({
      quotes: [{ symbol: 'AAA.NS', price: 5 }, ...(fail ? [] : [{ symbol: 'BAD.NS', price: 1 }])],
      errors: fail ? [{ symbol: 'BAD.NS', error: 'Price unavailable' }] : [],
    }),
  })
  const out = await client.getQuotes(['AAA.NS', 'BAD.NS'])
  assert.equal(out['AAA.NS'].price, 5)
  assert.deepEqual(out['BAD.NS'], { error: true })
  fail = false
  const again = await client.getQuotes(['AAA.NS', 'BAD.NS'])
  assert.equal(calls.api.length, 2) // only BAD.NS refetched
  assert.equal(again['BAD.NS'].price, 1)
})

test('a failed request marks its symbols {error:true} and does not throw', async () => {
  const { client } = setup({ onQuote: () => json({}, false, 500) })
  assert.deepEqual(await client.getQuotes(['AAA.NS']), { 'AAA.NS': { error: true } })
  const rejecting = createMarketClient({ apiFetch: async () => { throw new Error('offline') } })
  assert.deepEqual(await rejecting.getQuotes(['AAA.NS']), { 'AAA.NS': { error: true } })
})

test('force bypasses the cache and clear() drops it', async () => {
  const { client, calls } = setup({ onQuote: quoteFor })
  await client.getQuotes(['AAA.NS'])
  await client.getQuotes(['AAA.NS'], { force: true })
  assert.equal(calls.api.length, 2)
  client.clear()
  await client.getQuotes(['AAA.NS'])
  assert.equal(calls.api.length, 3)
})

test('quotes are chunked at 25 symbols per request', async () => {
  const { client, calls } = setup({ onQuote: quoteFor })
  const syms = Array.from({ length: 30 }, (_, i) => `S${i}.NS`)
  const out = await client.getQuotes(syms)
  assert.equal(calls.api.length, 2)
  assert.equal(Object.keys(out).length, 30)
})

test('MF NAV: dedupes, caches 60s, isolates a failing scheme', async () => {
  const { client, calls, advance } = setup({
    onExt: (url) => {
      if (url.includes('/999/')) return json({}, false, 500)
      return json({ data: [{ nav: '12.5', date: '01-01-2026' }] })
    },
  })
  const [a, b] = await Promise.all([client.getNavs(['100']), client.getNavs(['100'])])
  assert.equal(calls.ext.length, 1)
  assert.deepEqual(a['100'], { code: '100', nav: '12.5', date: '01-01-2026' })
  assert.deepEqual(a, b)
  const mixed = await client.getNavs(['100', '999'])
  assert.deepEqual(mixed['999'], { code: '999', error: true })
  assert.equal(mixed['100'].nav, '12.5')
  assert.equal(calls.ext.length, 2)
  advance(TTL_MS)
  await client.getNavs(['100'])
  assert.equal(calls.ext.length, 3)
})

test('MF search: min 3 chars, dedupes, caches, caps at 15, failure yields []', async () => {
  const many = Array.from({ length: 20 }, (_, i) => ({ schemeCode: i, schemeName: `F${i}` }))
  let ok = true
  const { client, calls } = setup({ onExt: () => (ok ? json(many) : json({}, false, 503)) })
  assert.deepEqual(await client.searchMf('ab'), [])
  assert.equal(calls.ext.length, 0)
  const [a] = await Promise.all([client.searchMf('Parag'), client.searchMf(' parag ')])
  assert.equal(calls.ext.length, 1)
  assert.equal(a.length, 15)
  await client.searchMf('parag')
  assert.equal(calls.ext.length, 1)
  ok = false
  assert.deepEqual(await client.searchMf('hdfc'), [])
  ok = true
  assert.equal((await client.searchMf('hdfc')).length, 15) // failure was not cached
})
