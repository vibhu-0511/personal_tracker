// Pure-ish selector that gathers everything the Logic tile on the Today home
// needs. Every data source is injectable so tests (and the Home bundle) never
// have to load the store, the network or the real localStorage.
import { codeRing, codeStreak, examTotals } from './stats.js'

export const DEFAULT_DAILY_GOAL = 3
export const CF_RATING_KEY = 'forge_cf_rating'
export const DSA_SUMMARY_KEY = 'dsa_summary'

function defaultStorage() {
  try {
    return globalThis.localStorage || null
  } catch {
    return null
  }
}

function readItem(storage, key) {
  try {
    return storage ? storage.getItem(key) : null
  } catch {
    return null
  }
}

// Cached Codeforces rating as a positive integer, or null when absent/corrupt.
export function readCfRating(storage = defaultStorage()) {
  const n = Number(readItem(storage, CF_RATING_KEY))
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null
}

// Remember the last known CF rating for the tile. Returns true when stored.
// Never throws: blocked/full storage or a bad rating just returns false.
export function rememberCfRating(rating, storage = defaultStorage()) {
  try {
    const n = Number(rating)
    if (!storage || rating === null || rating === '' || !Number.isFinite(n) || n <= 0) return false
    storage.setItem(CF_RATING_KEY, String(Math.round(n)))
    return true
  } catch {
    return false
  }
}

// DSA page summary ({done,total,...} written by public/dsa/mastery-map.html),
// or null when missing, unparsable or not sensible numbers.
export function readDsaSummary(storage = defaultStorage()) {
  const raw = readItem(storage, DSA_SUMMARY_KEY)
  if (!raw) return null
  try {
    const s = JSON.parse(raw)
    if (!s || typeof s !== 'object') return null
    const { done, total } = s
    if (!Number.isFinite(done) || !Number.isFinite(total) || done < 0 || total <= 0) return null
    return { done: Math.min(Math.floor(done), Math.floor(total)), total: Math.floor(total) }
  } catch {
    return null
  }
}

async function defaultGetters() {
  const store = await import('../store.js')
  const puzzles = await import('../puzzles.js')
  return {
    getProgress: store.getProgress,
    getPuzzleProgress: store.getPuzzleProgress,
    getExamProgress: store.getExamProgress,
    getSettings: store.getSettings,
    loadPuzzles: puzzles.loadPuzzles,
  }
}

const safe = async (fn, fallback) => {
  try {
    const v = await fn()
    return v ?? fallback
  } catch {
    return fallback
  }
}

// Returns { codeRing:{done,goal,pct}, codeStreak, cfRating|null,
//           puzzles:{solved,total}, exams:{pct}, dsa:{done,total}|null }.
// codeStreak is stats.codeStreak's { current, best }. A failing getter degrades
// to empty data for that part instead of rejecting the whole tile.
export async function loadLogicTileData(opts = {}) {
  const needsDefaults = !(
    opts.getProgress && opts.getPuzzleProgress && opts.getExamProgress && opts.getSettings && opts.loadPuzzles
  )
  const g = { ...(needsDefaults ? await defaultGetters() : {}), ...opts }
  const storage = 'storage' in opts ? opts.storage : defaultStorage()
  const now = opts.now ?? Date.now()

  const [progress, puzzleProgress, examProgress, settings, puzzles] = await Promise.all([
    safe(g.getProgress, {}),
    safe(g.getPuzzleProgress, {}),
    safe(g.getExamProgress, {}),
    safe(g.getSettings, {}),
    safe(g.loadPuzzles, []),
  ])

  const goal = Number(settings.dailyCodeGoal)
  const ring = codeRing(progress, goal > 0 ? goal : DEFAULT_DAILY_GOAL, now)

  return {
    codeRing: { done: ring.done, goal: ring.goal, pct: ring.pct },
    codeStreak: codeStreak(progress, now),
    cfRating: readCfRating(storage),
    puzzles: {
      solved: Object.values(puzzleProgress).filter(Boolean).length,
      total: Array.isArray(puzzles) ? puzzles.length : 0,
    },
    exams: { pct: examTotals(examProgress).pct },
    dsa: readDsaSummary(storage),
  }
}
