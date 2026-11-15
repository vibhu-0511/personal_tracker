// Capture state: whether the sheet is open, any prefill text, and the default
// type per screen (DESIGN section 4, decision E2). Pure except for the optional
// localStorage read/write of the last-used type, which is always try/catch'd.
// No JSX, no React.

import { TYPES } from './parse.js'

export const LAST_TYPE_KEY = 'forge_capture_last_type'
export const FALLBACK_TYPE = 'expense'

// Fixed default type by "tab" or "tab/view". The most specific key wins.
const SCREEN_DEFAULTS = {
  money: 'expense',
  'life/reminders': 'reminder',
  'life/notes': 'note',
  'life/tasks': 'task',
  logic: 'solve',
}

function store(storage) {
  if (storage !== undefined) return storage
  try { return globalThis.localStorage ?? null } catch { return null }
}

export function readLastType(storage) {
  try {
    const v = store(storage)?.getItem(LAST_TYPE_KEY)
    return TYPES.includes(v) ? v : null
  } catch { return null }
}

export function saveLastType(type, storage) {
  if (!TYPES.includes(type)) return false
  try {
    const s = store(storage)
    if (!s) return false
    s.setItem(LAST_TYPE_KEY, type)
    return true
  } catch { return false }
}

// Fixed type for a screen, or null when the screen has none.
// `route` is { tab, view } as produced by routes.parsePath.
export function screenDefaultType(route) {
  const tab = route?.tab
  const view = route?.view
  if (typeof tab !== 'string') return null
  if (typeof view === 'string' && SCREEN_DEFAULTS[`${tab}/${view}`]) {
    return SCREEN_DEFAULTS[`${tab}/${view}`]
  }
  return SCREEN_DEFAULTS[tab] ?? null
}

// Type the sheet opens on: the screen's own type, else last used, else expense.
export function defaultCaptureType(route, storage) {
  return screenDefaultType(route) ?? readLastType(storage) ?? FALLBACK_TYPE
}

// Capture state. `open` is the pure reducer for { open, type, text }.
export function initialCaptureState() {
  return { open: false, type: FALLBACK_TYPE, text: '' }
}

// openCapture(state, route, { text?, type?, storage? }) -> new state
export function openCapture(state, route, opts = {}) {
  const type = TYPES.includes(opts.type) ? opts.type : defaultCaptureType(route, opts.storage)
  const text = typeof opts.text === 'string' ? opts.text : ''
  return { ...state, open: true, type, text }
}

// Choosing a chip changes the type and remembers it as the last used.
export function setCaptureType(state, type, storage) {
  if (!TYPES.includes(type)) return state
  saveLastType(type, storage)
  return { ...state, type }
}

export function closeCapture(state) {
  return { ...state, open: false, text: '' }
}
