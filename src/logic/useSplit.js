// useSplit(ref, min = 1024): true when the `.app-root` container is at least
// `min` px wide, i.e. when the list | inspector split should show. The `ref`
// element is used as a fallback measure when no `.app-root` exists (tests,
// isolated mounts). Matches the shell inspector threshold (errata C-4).
import { useEffect, useState } from 'react'

function measureWidth(ref) {
  if (typeof document === 'undefined') return 0
  const root = document.querySelector('.app-root') || ref?.current
  if (root) return root.clientWidth
  return typeof window === 'undefined' ? 0 : window.innerWidth
}

export function useSplit(ref, min = 1024) {
  const [split, setSplit] = useState(false)

  useEffect(() => {
    const measure = () => setSplit(measureWidth(ref) >= min)
    measure()
    const el = typeof document === 'undefined' ? null : document.querySelector('.app-root') || ref?.current
    if (el && typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(measure)
      ro.observe(el)
      return () => ro.disconnect()
    }
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [ref, min])

  return split
}

export default useSplit
