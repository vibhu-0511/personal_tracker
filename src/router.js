// Tiny hash router. Only the three "location adapter" functions below touch
// window, so moving to the history API later is a change to this file alone.
import { useCallback, useMemo, useSyncExternalStore } from 'react'
import { parsePath, formatPath, isView, isTab } from './routes.js'

const listeners = new Set()
const notify = () => listeners.forEach((l) => l())

// --- location adapter (swap these for a history-API implementation) ---------
function readLocation() {
  const w = globalThis.window
  return w ? w.location.hash : ''
}
function writeLocation(path, replace) {
  const w = globalThis.window
  if (!w) return
  const hash = `#${path}`
  if (replace) w.history.replaceState(null, '', hash)
  else w.location.hash = hash
}
function subscribeLocation(cb) {
  const w = globalThis.window
  if (!w) return () => {}
  w.addEventListener('hashchange', cb)
  return () => w.removeEventListener('hashchange', cb)
}
// -----------------------------------------------------------------------------

function subscribe(cb) {
  listeners.add(cb)
  const off = subscribeLocation(cb)
  return () => { listeners.delete(cb); off() }
}

// Current route as { tab, view, path }. The store snapshot is the raw location
// string, so React sees a stable value between renders.
export function useRoute() {
  const raw = useSyncExternalStore(subscribe, readLocation, () => '')
  return useMemo(() => {
    const route = parsePath(raw)
    return { ...route, path: formatPath(route) }
  }, [raw])
}

// navigate('/life/tasks'), navigate('#/life/tasks') or navigate({ tab, view }).
// Input is normalised through the route table; { replace: true } skips history.
export function navigate(to, { replace = false } = {}) {
  const path = formatPath(typeof to === 'object' && to ? to : parsePath(to))
  if (formatPath(parsePath(readLocation())) === path && readLocation() === `#${path}`) return
  writeLocation(path, replace)
  notify() // replaceState fires no hashchange; a duplicate notify is harmless
}

// Sub-view state for a tab, kept in the URL: [view, setView]. Falls back to
// `defaultId` when the URL is on another tab or has no/invalid sub-view.
// setView ignores ids that are not in the route table.
export function useSubView(tabId, defaultId) {
  const route = useRoute()
  const view = route.tab === tabId && route.view ? route.view : defaultId
  const setView = useCallback((id) => {
    if (!isTab(tabId) || !isView(tabId, id)) return
    navigate({ tab: tabId, view: id })
  }, [tabId])
  return [view, setView]
}
