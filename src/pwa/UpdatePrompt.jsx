import { useEffect, useMemo, useRef, useState } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { flush } from '../store.js'
import { createUpdateFlow, scheduleUpdateChecks } from './updateFlow.js'
import './update-prompt.css'

export default function UpdatePrompt() {
  const stopChecks = useRef(null)
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_swUrl, registration) {
      if (stopChecks.current) stopChecks.current()
      stopChecks.current = scheduleUpdateChecks(registration)
    },
  })
  useEffect(() => () => { if (stopChecks.current) stopChecks.current() }, [])

  const [busy, setBusy] = useState(false)
  const confirmUpdate = useMemo(
    () => createUpdateFlow({ flush, updateServiceWorker }),
    [updateServiceWorker],
  )

  async function onReload() {
    setBusy(true)
    try {
      await confirmUpdate()
    } finally {
      setBusy(false)
    }
  }

  if (needRefresh) {
    return (
      <div className="update-prompt" role="status" aria-live="polite">
        <span className="update-prompt-msg">A new version is ready</span>
        <span className="update-prompt-actions">
          <button type="button" onClick={() => setNeedRefresh(false)} disabled={busy}>Later</button>
          <button type="button" className="update-prompt-primary" onClick={onReload} disabled={busy}>
            {busy ? 'Saving…' : 'Reload'}
          </button>
        </span>
      </div>
    )
  }

  if (offlineReady) {
    return (
      <div className="update-prompt" role="status" aria-live="polite">
        <span className="update-prompt-msg">Ready to work offline</span>
        <span className="update-prompt-actions">
          <button type="button" onClick={() => setOfflineReady(false)}>OK</button>
        </span>
      </div>
    )
  }

  return null
}
