export function parseYahooChart(json) {
  const result = json?.chart?.result?.[0]
  if (!result) {
    throw new Error(json?.chart?.error?.description || 'No chart result')
  }
  const m = result.meta || {}
  const prevClose = typeof m.chartPreviousClose === 'number' ? m.chartPreviousClose : null
  const price = typeof m.regularMarketPrice === 'number' ? m.regularMarketPrice : null
  const changePct = prevClose ? ((price - prevClose) / prevClose) * 100 : null

  return {
    symbol: m.symbol,
    name: m.longName || m.symbol,
    price,
    prevClose,
    changePct,
    high52: typeof m.fiftyTwoWeekHigh === 'number' ? m.fiftyTwoWeekHigh : null,
    low52: typeof m.fiftyTwoWeekLow === 'number' ? m.fiftyTwoWeekLow : null,
    currency: m.currency || null,
  }
}
