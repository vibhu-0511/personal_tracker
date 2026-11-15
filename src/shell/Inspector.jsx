// Inspector primitive: a right-hand focus pane that acts on the selected item.
//
//   <InspectorProvider>   wrap the app (outside or around <Shell>). Tracks the
//                         `.app-root` container width against --inspector-min
//                         and renders the Sheet fallback when it is narrower.
//   <InspectorPane />     pass as <Shell inspector={<InspectorPane />}>. Renders
//                         the open node in a labelled, independently scrolling
//                         region when the container is wide enough.
//   useInspector()        { node, wide, open(node), close() }
//
// Escape or close() empties it. In the Sheet the native <dialog> handles Escape.
import { useCallback, useEffect, useMemo, useState } from 'react'
import Sheet from '../Sheet.jsx'
import {
  InspectorContext, DEFAULT_INSPECTOR_MIN, readInspectorMin, useInspector,
} from './inspectorContext.js'

function containerEl() {
  return typeof document === 'undefined' ? null : document.querySelector('.app-root')
}

export function InspectorProvider({ children }) {
  const [node, setNode] = useState(null)
  const [wide, setWide] = useState(false)

  const open = useCallback((next) => setNode(next ?? null), [])
  const close = useCallback(() => setNode(null), [])

  // Compare the container (falling back to the window) with --inspector-min.
  useEffect(() => {
    const el = containerEl()
    const measure = () => {
      const width = el ? el.clientWidth : window.innerWidth
      const min = readInspectorMin(el) || DEFAULT_INSPECTOR_MIN
      setWide(width >= min)
    }
    measure()
    if (el && typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(measure)
      ro.observe(el)
      return () => ro.disconnect()
    }
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [])

  // Escape empties the inline pane (the Sheet gets Escape from <dialog>).
  useEffect(() => {
    if (!wide || node == null) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape' && !e.defaultPrevented) close()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [wide, node, close])

  const value = useMemo(() => ({ node, wide, open, close }), [node, wide, open, close])

  return (
    <InspectorContext.Provider value={value}>
      {children}
      {!wide && (
        <Sheet open={node != null} onClose={close} variant="side" className="inspector-sheet">
          {node}
        </Sheet>
      )}
    </InspectorContext.Provider>
  )
}

export function InspectorPane({ label = 'Inspector' }) {
  const { node, wide, close } = useInspector()
  if (!wide || node == null) return null
  return (
    <section className="inspector-pane" role="region" aria-label={label}>
      <button type="button" className="inspector-close" onClick={close} aria-label="Close inspector">
        ×
      </button>
      <div className="inspector-body">{node}</div>
    </section>
  )
}

export { useInspector }
export default InspectorPane
