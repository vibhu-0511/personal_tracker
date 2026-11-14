// Update flow for the service worker prompt. Pure and dependency-injected so it can be
// unit-tested without a browser: nothing here imports the store or the SW virtual module.

export const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000

// Returns the handler behind the "Reload" button. It is the ONLY path that calls
// updateServiceWorker, so no update is applied unless the user confirmed.
// flush() is awaited first so debounced writes reach storage before the page reloads.
// A failing flush must not strand the user on a stale build: the update still applies.
export function createUpdateFlow({ flush, updateServiceWorker, onFlushError } = {}) {
  let running = null
  return function confirmUpdate() {
    if (running) return running
    running = (async () => {
      try {
        if (typeof flush === 'function') await flush()
      } catch (err) {
        if (typeof onFlushError === 'function') onFlushError(err)
      }
      try {
        await updateServiceWorker(true)
      } finally {
        running = null
      }
    })()
    return running
  }
}

// Checks for a new service worker hourly and whenever the tab becomes visible again.
// Returns a stop() function that removes the timer and the listener.
export function scheduleUpdateChecks(registration, {
  intervalMs = UPDATE_CHECK_INTERVAL_MS,
  doc = typeof document !== 'undefined' ? document : null,
  setIntervalFn = setInterval,
  clearIntervalFn = clearInterval,
} = {}) {
  if (!registration || typeof registration.update !== 'function') return () => {}
  const check = () => {
    try {
      const p = registration.update()
      if (p && typeof p.catch === 'function') p.catch(() => {})
    } catch {
      // offline or a torn-down registration: try again at the next tick
    }
  }
  const onVisible = () => {
    if (doc && doc.visibilityState === 'visible') check()
  }
  const timer = setIntervalFn(check, intervalMs)
  if (doc) doc.addEventListener('visibilitychange', onVisible)
  return () => {
    clearIntervalFn(timer)
    if (doc) doc.removeEventListener('visibilitychange', onVisible)
  }
}
