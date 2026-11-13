// Pure course-progress helpers (extracted from tabs/Invest.jsx).
import { PHASES } from './course.js'

export const ALL_MODS = PHASES.flatMap((p) => p.mods)

export function modIndex(id) {
  return ALL_MODS.findIndex((m) => m.id === id)
}

// Sequential unlock: the first module is always open; every other module
// needs its predecessor marked done. Unknown ids are treated as open (as before).
export function isUnlocked(done, id) {
  const i = modIndex(id)
  if (i <= 0) return true
  return !!(done || {})[ALL_MODS[i - 1].id]
}

export function doneCount(done) {
  return Object.values(done || {}).filter(Boolean).length
}

export function courseProgress(done) {
  const count = doneCount(done)
  const total = ALL_MODS.length
  return { done: count, total, pct: total ? Math.round((count / total) * 100) : 0 }
}
