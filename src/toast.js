let toasts = []
let nextId = 1
const listeners = new Set()

function notify() {
  listeners.forEach((fn) => fn(toasts))
}

export function showToast(message, { undo, duration = 5000 } = {}) {
  const id = nextId++
  toasts = [...toasts, { id, message, undo }]
  notify()
  setTimeout(() => dismissToast(id), duration)
  return id
}

export function dismissToast(id) {
  toasts = toasts.filter((t) => t.id !== id)
  notify()
}

export function onToastsChange(fn) {
  listeners.add(fn)
  fn(toasts)
  return () => listeners.delete(fn)
}
