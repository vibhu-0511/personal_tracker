import { useEffect, useState } from 'react'
import { onToastsChange, dismissToast, pauseToast, resumeToast } from './toast.js'

export default function ToastHost() {
  const [toasts, setToasts] = useState([])
  useEffect(() => onToastsChange(setToasts), [])

  if (toasts.length === 0) return null
  return (
    <div className="toast-stack" aria-live="polite">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="toast"
          onMouseEnter={() => pauseToast(t.id)}
          onMouseLeave={() => resumeToast(t.id)}
          onFocus={() => pauseToast(t.id)}
          onBlur={() => resumeToast(t.id)}
        >
          <span>{t.message}</span>
          {t.undo && (
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => {
                t.undo()
                dismissToast(t.id)
              }}
            >
              Undo
            </button>
          )}
        </div>
      ))}
    </div>
  )
}
