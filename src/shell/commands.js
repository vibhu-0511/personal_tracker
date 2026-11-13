// Command registry, fuzzy filter and keyboard-shortcut matcher. Everything
// except `useCommand` is pure and runs in node (test/commands.test.js).
import { useEffect, useRef } from 'react'
import { ROUTES, TAB_IDS } from '../routes.js'
import { navigate } from '../router.js'
import { fuzzyScore, rank } from './searchIndex.js'

// --- registry ---------------------------------------------------------------
// A command is { id, label, run, hint?, keywords?: string[] }.
export function createRegistry() {
  const commands = new Map()
  const listeners = new Set()
  let snapshot = []
  const changed = () => {
    snapshot = [...commands.values()]
    listeners.forEach((l) => l())
  }

  function unregister(id, only) {
    const cur = commands.get(id)
    if (!cur) return false
    if (only && cur !== only) return false // a newer registration owns the id
    commands.delete(id)
    changed()
    return true
  }

  return {
    // Registers (or replaces) a command and returns its unregister function.
    register(cmd) {
      if (!cmd || typeof cmd.id !== 'string' || !cmd.id) throw new Error('command needs an id')
      if (typeof cmd.run !== 'function') throw new Error(`command "${cmd.id}" needs a run function`)
      const entry = { ...cmd, label: cmd.label ?? cmd.id }
      commands.set(entry.id, entry)
      changed()
      return () => unregister(entry.id, entry)
    },
    unregister: (id) => unregister(id),
    has: (id) => commands.has(id),
    get: (id) => commands.get(id) ?? null,
    // Stable array between changes, so it is safe as a useSyncExternalStore snapshot.
    list: () => snapshot,
    // Runs a command by id; returns false when it is not registered.
    run(id, ...args) {
      const cmd = commands.get(id)
      if (!cmd) return false
      cmd.run(...args)
      return true
    },
    subscribe(cb) {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
  }
}

export const registry = createRegistry()

// Tabs call this to expose handlers, e.g. useCommand('new', 'New task', addTask)
// and useCommand('complete', 'Complete selected', done). The latest `fn` is
// always the one run, without re-registering on every render.
export function useCommand(id, label, fn, options = {}) {
  const fnRef = useRef(fn)
  fnRef.current = fn
  const { hint, keywords } = options
  useEffect(() => {
    if (!id) return undefined
    return registry.register({
      id,
      label,
      hint,
      keywords,
      run: (...args) => fnRef.current?.(...args),
    })
  }, [id, label, hint, keywords])
}

// --- built-in navigation commands --------------------------------------------
export function navigationCommands(go = navigate) {
  const out = []
  TAB_IDS.forEach((tab, i) => {
    out.push({
      id: `go:${tab}`,
      label: `Go to ${ROUTES[tab].label}`,
      hint: `⌘${i + 1}`,
      run: () => go({ tab }),
    })
  })
  return out
}

// --- fuzzy filter -----------------------------------------------------------
// Ranks commands by label (keywords count for less). Empty query keeps order.
export function filterCommands(commands, query) {
  const q = typeof query === 'string' ? query.trim() : ''
  return rank(commands, q, (c) => {
    let best = fuzzyScore(q, c.label)
    for (const k of c.keywords ?? []) {
      const s = fuzzyScore(q, k)
      if (s !== null && s > 0 && (best === null || Math.floor(s / 4) > best)) best = Math.floor(s / 4)
    }
    return best
  })
}

// --- shortcut matcher ---------------------------------------------------------
// True when a keystroke is going into a text field, where plain character
// shortcuts must stay out of the way (also covers contenteditable).
export function isTypingTarget(target) {
  if (!target) return false
  if (target.isContentEditable) return true
  const tag = typeof target.tagName === 'string' ? target.tagName.toUpperCase() : ''
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
}

// Maps a keydown event to an action, or null when it is not ours:
//   Cmd/Ctrl+K        -> { type: 'palette' }
//   Cmd/Ctrl+1..6     -> { type: 'tab', tab, index }
//   N                 -> { type: 'command', id: 'new' }
//   X                 -> { type: 'command', id: 'complete' }
// Cmd/Ctrl chords work everywhere, including inside text fields. The plain
// letter keys never fire while typing and can be switched off with
// `charKeys: false` (the settings.shortcuts toggle, WCAG 2.1.4).
export function matchShortcut(event, { charKeys = true } = {}) {
  if (!event || event.defaultPrevented || event.isComposing) return null
  const key = typeof event.key === 'string' ? event.key.toLowerCase() : ''
  const mod = Boolean(event.metaKey || event.ctrlKey)

  if (mod) {
    if (event.altKey || event.shiftKey) return null
    if (key === 'k') return { type: 'palette' }
    if (/^[1-9]$/.test(key)) {
      const index = Number(key) - 1
      const tab = TAB_IDS[index]
      return tab ? { type: 'tab', tab, index } : null
    }
    return null
  }

  if (!charKeys || event.altKey || event.shiftKey || event.repeat) return null
  if (isTypingTarget(event.target)) return null
  if (key === 'n') return { type: 'command', id: 'new' }
  if (key === 'x') return { type: 'command', id: 'complete' }
  return null
}
