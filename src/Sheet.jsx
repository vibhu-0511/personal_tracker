import { useEffect, useRef } from 'react'

// Wraps a native <dialog> with showModal(): Escape-to-close, a focus trap,
// focus restore on close, and backdrop-click-to-close all come from the
// browser for free — the ad-hoc <div className="money-backdrop" onClick>
// sheets had none of that.
export default function Sheet({ open, onClose, className = '', children }) {
  const ref = useRef(null)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      className={`sheet-dialog ${className}`}
      onClose={onClose}
      onClick={(e) => { if (e.target === ref.current) onClose() }}
    >
      {children}
    </dialog>
  )
}
