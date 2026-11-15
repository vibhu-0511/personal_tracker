import { fireConfetti } from '../life/confetti.js'

const STORAGE_KEY = 'today.celebrated'

// Local calendar day, e.g. "2026-11-15".
export function localDayKey(date = new Date()) {
  const p = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`
}

export function prefersReducedMotion(win = globalThis) {
  try {
    return !!win.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
  } catch {
    return false
  }
}

const isComplete = (s) => !!s && s.total > 0 && s.done >= s.total

// Pure decision. `prev` is the previous observed { done, total } or null (first
// observation after load): a day that is already complete on load never fires.
export function shouldCelebrate({ prev, done, total, lastDay, today, reduced }) {
  if (reduced) return false
  if (!prev) return false
  if (!isComplete({ done, total })) return false
  if (isComplete(prev)) return false
  return lastDay !== today
}

function readLast(storage) {
  try { return storage?.getItem(STORAGE_KEY) ?? null } catch { return null }
}
function writeLast(storage, day) {
  try { storage?.setItem(STORAGE_KEY, day) } catch { /* private mode: still fires once per session */ }
}

// Stateful observer. Call observe(done, total) with each settled dailies count.
// Returns true when it fired the burst.
export function createCelebrator({
  fire = fireConfetti,
  storage = globalThis.localStorage,
  now = () => new Date(),
  reduced = () => prefersReducedMotion(),
} = {}) {
  let prev = null
  let memoryDay = null
  return function observe(done, total) {
    const today = localDayKey(now())
    const lastDay = readLast(storage) ?? memoryDay
    const go = shouldCelebrate({ prev, done, total, lastDay, today, reduced: reduced() })
    prev = { done, total }
    if (!go) return false
    memoryDay = today
    writeLast(storage, today)
    Promise.resolve(fire()).catch(() => {})
    return true
  }
}
