import { useEffect, useState } from 'react'
import { onToastsChange, dismissToast } from './toast.js'

export default function ToastHost() {
  const [toasts, setToasts] = useState([])
  useEffect(() => onToastsChange(setToasts), [])

  if (toasts.length === 0) return null
  return (
    <div className="toast-stack">
      {toasts.map((t) => (
        <div key={t.id} className="toast">
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
