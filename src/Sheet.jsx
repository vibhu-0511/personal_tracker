import { useEffect, useRef } from 'react'

// Wraps a native <dialog> with showModal(): Escape-to-close, a focus trap,
// focus restore on close, and backdrop-click-to-close all come from the
// browser for free — the ad-hoc <div className="money-backdrop" onClick>
// sheets had none of that.
// variant="side" adds .sheet-dialog--side: a right-hand sheet from 600px
// (bottom sheet on phones); styled in styles/inspector.css.
export default function Sheet({ open, onClose, variant, className = '', children }) {
  const ref = useRef(null)
  const closedByProp = useRef(false)   // a close we caused is not a user dismissal

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) { closedByProp.current = true; dialog.close() }
  }, [open])

  return (
    <dialog
      ref={ref}
      className={`sheet-dialog${variant === 'side' ? ' sheet-dialog--side' : ''} ${className}`.trim()}
      onClose={() => { if (closedByProp.current) { closedByProp.current = false; return } if (onClose) onClose() }}
      onClick={(e) => { if (e.target === ref.current) onClose() }}
    >
      {children}
    </dialog>
  )
}
