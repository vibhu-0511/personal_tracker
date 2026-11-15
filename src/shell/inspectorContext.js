// Inspector state shared between the provider and the pane. Kept in a plain
// .js module so components import the hook without importing JSX.
import { createContext, useContext } from 'react'

export const DEFAULT_INSPECTOR_MIN = 1024

const noop = () => {}

export const InspectorContext = createContext({
  node: null,
  wide: false,
  open: noop,
  close: noop,
})

// useInspector() -> { node, wide, open(node), close() }
//   open(node)  show a React node in the inspector (pane when wide, Sheet otherwise)
//   close()     empty it
export function useInspector() {
  return useContext(InspectorContext)
}

// Parse the --inspector-min token ("1024px") to a number. CSS custom
// properties cannot be used inside @container conditions, so the pane/Sheet
// switch is made in JS against the same token.
export function readInspectorMin(el) {
  try {
    const raw = getComputedStyle(el || document.documentElement)
      .getPropertyValue('--inspector-min')
    const n = parseFloat(raw)
    return Number.isFinite(n) && n > 0 ? n : DEFAULT_INSPECTOR_MIN
  } catch {
    return DEFAULT_INSPECTOR_MIN
  }
}
