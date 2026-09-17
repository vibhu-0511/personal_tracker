import { useEffect, useState } from 'react'

// Runs the given loaders in parallel and tracks ready/error, replacing the
// hand-rolled `useEffect(() => { getX().then(setX) }, [])` blocks that have
// no loading state and no .catch — a rejection used to blank the tab forever,
// and the empty state would flash before data arrived, reading as data loss.
// Include remote-sync ticks in `deps` to re-run without remounting the tab.
export function useHydrate(loaders, deps = []) {
  const [state, setState] = useState({ ready: false, error: null })

  useEffect(() => {
    let cancelled = false
    setState({ ready: false, error: null })
    Promise.all(loaders.map((load) => load()))
      .then(() => { if (!cancelled) setState({ ready: true, error: null }) })
      .catch((err) => {
        if (!cancelled) setState({ ready: false, error: err?.message || 'Failed to load' })
      })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  return state
}
