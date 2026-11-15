// Ranges where "previous close" from Yahoo meta is the close before the whole
// range, not before the last session, so changePct must come from the closes.
const SINGLE_DAY = '1d'

function extractCloses(result) {
  const raw = result?.indicators?.quote?.[0]?.close
  if (!Array.isArray(raw)) return []
  // Yahoo emits null for non-trading or incomplete bars; drop them.
  return raw.filter((c) => typeof c === 'number' && Number.isFinite(c))
}

// range: the range that was requested ('1d' default). Falls back to meta.range.
export function parseYahooChart(json, range) {
  const result = json?.chart?.result?.[0]
  if (!result) {
    throw new Error(json?.chart?.error?.description || 'No chart result')
  }
  const m = result.meta || {}
  const closes = extractCloses(result)
  const effectiveRange = range || m.range || SINGLE_DAY

  let prevClose = typeof m.chartPreviousClose === 'number' ? m.chartPreviousClose : null
  const price = typeof m.regularMarketPrice === 'number' ? m.regularMarketPrice : null
  let changePct
  if (effectiveRange !== SINGLE_DAY && closes.length >= 2) {
    // Multi-day: day-over-day change from the last two closes.
    prevClose = closes[closes.length - 2]
    const last = closes[closes.length - 1]
    changePct = prevClose ? ((last - prevClose) / prevClose) * 100 : null
  } else {
    changePct = prevClose ? ((price - prevClose) / prevClose) * 100 : null
  }

  return {
    symbol: m.symbol,
    name: m.longName || m.symbol,
    price,
    prevClose,
    changePct,
    high52: typeof m.fiftyTwoWeekHigh === 'number' ? m.fiftyTwoWeekHigh : null,
    low52: typeof m.fiftyTwoWeekLow === 'number' ? m.fiftyTwoWeekLow : null,
    currency: m.currency || null,
    closes,
  }
}
