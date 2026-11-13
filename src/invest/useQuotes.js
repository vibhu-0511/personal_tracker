import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { apiFetch } from '../api/client.js'
import { createMarketClient } from './market.js'

// One shared client so every screen shares the cache and in-flight requests.
export const market = createMarketClient({ apiFetch })

const uniqSorted = (xs) => [...new Set(xs.filter((x) => x !== undefined && x !== null && x !== ''))].map(String).sort()

// Quotes for stock symbols and NAVs for MF scheme codes. Depends only on the
// symbol/code sets, so editing a note or reordering items never refetches.
export function useQuotes({ stockSymbols = [], mfCodes = [] } = {}) {
  const symKey = uniqSorted(stockSymbols).join(',')
  const codeKey = uniqSorted(mfCodes).join(',')
  const [quotes, setQuotes] = useState({})
  const [navs, setNavs] = useState({})
  const [refreshing, setRefreshing] = useState(false)
  const [tick, setTick] = useState(0)
  const forceRef = useRef(false)

  const syms = useMemo(() => (symKey ? symKey.split(',') : []), [symKey])
  const codes = useMemo(() => (codeKey ? codeKey.split(',') : []), [codeKey])

  useEffect(() => {
    let live = true
    const force = forceRef.current
    forceRef.current = false
    if (syms.length === 0 && codes.length === 0) { setQuotes({}); setNavs({}); return undefined }
    setRefreshing(true)
    Promise.all([
      syms.length ? market.getQuotes(syms, { force }) : {},
      codes.length ? market.getNavs(codes, { force }) : {},
    ])
      .then(([q, n]) => { if (live) { setQuotes(q); setNavs(n) } })
      .finally(() => { if (live) setRefreshing(false) })
    return () => { live = false }
  }, [syms, codes, tick])

  const refresh = useCallback(() => { forceRef.current = true; setTick((n) => n + 1) }, [])

  return { quotes, navs, refreshing, refresh }
}
