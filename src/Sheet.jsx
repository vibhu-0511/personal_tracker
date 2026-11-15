import { useEffect, useRef } from 'react'

// Wraps a native <dialog> with showModal(): Escape-to-close, a focus trap,
// focus restore on close, and backdrop-click-to-close all come from the
// browser for free — the ad-hoc <div className="money-backdrop" onClick>
// sheets had none of that.
// variant="side" adds .sheet-dialog--side: a right-hand sheet from 600px
// (bottom sheet on phones); styled in styles/inspector.css.
// A click is a backdrop click only when it lands on the <dialog> element itself AND outside its
// box. The dialog's own padding also targets the dialog, and a drag that starts in an input and
// ends on the backdrop must not count either, so the press has to start on the backdrop too.
function isBackdropHit(e, dialog) {
  if (!dialog || e.target !== dialog) return false
  const r = dialog.getBoundingClientRect()
  return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom
}

export default function Sheet({ open, onClose, variant, className = '', children }) {
  const ref = useRef(null)
  const closedByProp = useRef(false)   // a close we caused is not a user dismissal
  const downOnBackdrop = useRef(false) // press began on the backdrop, not inside the sheet

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
      onPointerDown={(e) => { downOnBackdrop.current = isBackdropHit(e, ref.current) }}
      onClick={(e) => {
        const wasBackdrop = downOnBackdrop.current
        downOnBackdrop.current = false
        if (wasBackdrop && isBackdropHit(e, ref.current) && onClose) onClose()
      }}
    >
      {children}
    </dialog>
  )
}
