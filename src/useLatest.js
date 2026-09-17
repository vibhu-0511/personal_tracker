import { useRef } from 'react'

// A ref that always holds the most recent value, readable from a closure
// (e.g. a toast's undo callback) without going stale between render and click.
export function useLatest(value) {
  const ref = useRef(value)
  ref.current = value
  return ref
}
