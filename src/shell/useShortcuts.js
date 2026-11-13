import { useEffect, useRef } from 'react'
import { navigate } from '../router.js'
import { matchShortcut, registry } from './commands.js'

// Global keyboard shortcuts. Mount once in the shell.
//   onOpenPalette  called for Cmd/Ctrl+K (toggle it in the caller)
//   charKeys       false disables plain N / X (settings.shortcuts toggle)
// Cmd/Ctrl+1..6 navigates to the tab; N and X run the 'new' and 'complete'
// commands that tabs register with useCommand, and do nothing if none is.
export function useShortcuts({ onOpenPalette, charKeys = true } = {}) {
  const openRef = useRef(onOpenPalette)
  openRef.current = onOpenPalette

  useEffect(() => {
    const w = globalThis.window
    if (!w) return undefined
    function onKeyDown(e) {
      // Plain keys must not fire behind an open modal (the palette, a Sheet).
      const modalOpen = Boolean(w.document.querySelector('dialog[open]'))
      const action = matchShortcut(e, { charKeys: charKeys && !modalOpen })
      if (!action) return
      if (action.type === 'palette') {
        e.preventDefault()
        openRef.current?.()
      } else if (action.type === 'tab') {
        e.preventDefault()
        navigate({ tab: action.tab })
      } else if (action.type === 'command') {
        if (registry.run(action.id)) e.preventDefault()
      }
    }
    w.addEventListener('keydown', onKeyDown)
    return () => w.removeEventListener('keydown', onKeyDown)
  }, [charKeys])
}
