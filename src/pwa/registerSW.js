import React from 'react'
import { createRoot } from 'react-dom/client'
import UpdatePrompt from './UpdatePrompt.jsx'

// Capacitor (native) builds ship their assets in the app bundle; no service worker there.
function isNativePlatform() {
  try {
    return Boolean(globalThis.Capacitor?.isNativePlatform?.())
  } catch {
    return false
  }
}

// The dev server never gets a service worker (devOptions.enabled is false).
if (import.meta.env.PROD && typeof navigator !== 'undefined' && 'serviceWorker' in navigator && !isNativePlatform()) {
  // Separate React root so App.jsx stays untouched.
  const host = document.createElement('div')
  host.id = 'sw-update-root'
  document.body.appendChild(host)
  createRoot(host).render(React.createElement(UpdatePrompt))
}
