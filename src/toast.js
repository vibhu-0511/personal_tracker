let toasts = []
let nextId = 1
const listeners = new Set()
const timers = new Map() // id -> { timeoutId, remaining, startedAt }

function notify() {
  listeners.forEach((fn) => fn(toasts))
}

function startTimer(id, remaining) {
  const timeoutId = setTimeout(() => dismissToast(id), remaining)
  timers.set(id, { timeoutId, remaining, startedAt: Date.now() })
}

export function showToast(message, { undo, duration = 8000 } = {}) {
  const id = nextId++
  toasts = [...toasts, { id, message, undo }]
  notify()
  startTimer(id, duration)
  return id
}

// Hovering/focusing a toast (e.g. reading it before deciding to hit Undo)
// pauses its auto-dismiss instead of racing it.
export function pauseToast(id) {
  const t = timers.get(id)
  if (!t) return
  clearTimeout(t.timeoutId)
  t.remaining = Math.max(0, t.remaining - (Date.now() - t.startedAt))
}

export function resumeToast(id) {
  const t = timers.get(id)
  if (!t) return
  startTimer(id, t.remaining)
}

export function dismissToast(id) {
  const t = timers.get(id)
  if (t) clearTimeout(t.timeoutId)
  timers.delete(id)
  toasts = toasts.filter((t) => t.id !== id)
  notify()
}

export function onToastsChange(fn) {
  listeners.add(fn)
  fn(toasts)
  return () => listeners.delete(fn)
}
