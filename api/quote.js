import { parseYahooChart } from './_lib/parseYahooChart.js'

const SYMBOL_RE = /^[A-Z0-9&-]{1,20}\.(NS|BO)$/
const MAX_SYMBOLS = 25
const CACHE_MS = 60_000

const cache = new Map() // symbol -> { at, quote }

async function fetchQuote(symbol) {
  const cached = cache.get(symbol)
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.quote

  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=1d`
  const r = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
  })
  if (!r.ok) throw new Error(`Yahoo returned ${r.status}`)
  const quote = parseYahooChart(await r.json())
  cache.set(symbol, { at: Date.now(), quote })
  return quote
}

// ponytail: Yahoo is unofficial/ToS-grey; swap for Upstox Analytics Token if it breaks
export default async function handler(req, res) {
  const raw = (req.query.symbols || '').trim()
  if (!raw) return res.status(400).json({ error: 'symbols required' })

  const symbols = [...new Set(raw.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean))]
  if (symbols.length === 0 || symbols.length > MAX_SYMBOLS) {
    return res.status(400).json({ error: `provide 1-${MAX_SYMBOLS} symbols` })
  }
  const invalid = symbols.filter((s) => !SYMBOL_RE.test(s))
  if (invalid.length) {
    return res.status(400).json({ error: `invalid symbols: ${invalid.join(', ')}` })
  }

  const results = await Promise.allSettled(symbols.map(fetchQuote))
  const quotes = []
  const errors = []
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') quotes.push(r.value)
    else {
      console.error('quote fetch error', symbols[i], r.reason)
      errors.push({ symbol: symbols[i], error: 'Price unavailable' })
    }
  })

  res.status(200).json({ quotes, errors })
}
