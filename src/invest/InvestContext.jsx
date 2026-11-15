import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { getInvestProgress, saveInvestProgress, getWatchlist, saveWatchlist } from '../store.js'
import { PHASES } from './course.js'
import { useHydrate } from '../useHydrate.js'

// Shared hydrate/persist for investProgress and watchlist (ports Invest.jsx:28-45).
// progress keeps the {done, quiz, tasks, current} shape.

const FIRST_MOD = PHASES.flatMap((p) => p.mods)[0]?.id ?? null

const InvestContext = createContext(null)

export function InvestProvider({ syncTick = 0, children }) {
  const [progress, setProgress] = useState({ done: {}, quiz: {}, tasks: {}, current: null })
  const [watchlist, setWatchlist] = useState([])

  const { ready, error } = useHydrate([
    () => getInvestProgress().then((p) => setProgress({ current: FIRST_MOD, ...p })),
    () => getWatchlist().then(setWatchlist),
  ], [syncTick])

  const updateProgress = useCallback(async (next) => {
    setProgress(next)
    await saveInvestProgress(next)
  }, [])

  const updateWatchlist = useCallback(async (next) => {
    setWatchlist(next)
    await saveWatchlist(next)
  }, [])

  const value = useMemo(
    () => ({ progress, watchlist, updateProgress, updateWatchlist, ready, error }),
    [progress, watchlist, updateProgress, updateWatchlist, ready, error],
  )

  return <InvestContext.Provider value={value}>{children}</InvestContext.Provider>
}

export function useInvest() {
  const ctx = useContext(InvestContext)
  if (!ctx) throw new Error('useInvest must be used within an InvestProvider')
  return ctx
}
