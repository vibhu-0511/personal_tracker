/* Push and notification-click handlers, loaded into the generated service worker
 * through workbox `importScripts` (see vite.config.js). Plain classic-script JS:
 * no imports, no keys, no network calls of its own. */

// Only same-origin targets may be opened from a notification.
function safeTarget(raw) {
  try {
    const u = new URL(typeof raw === 'string' && raw ? raw : '/', self.location.origin)
    return u.origin === self.location.origin ? u.href : self.location.origin + '/'
  } catch (e) {
    return self.location.origin + '/'
  }
}

function parsePayload(event) {
  if (!event.data) return {}
  try {
    const j = event.data.json()
    return j && typeof j === 'object' ? j : { body: String(j) }
  } catch (e) {
    try {
      return { body: event.data.text() }
    } catch (e2) {
      return {}
    }
  }
}

self.addEventListener('push', (event) => {
  const p = parsePayload(event)
  const title = typeof p.title === 'string' && p.title ? p.title : 'Tracker'
  const options = {
    body: typeof p.body === 'string' ? p.body : '',
    icon: typeof p.icon === 'string' ? p.icon : '/icons/pwa-192x192.png',
    badge: typeof p.badge === 'string' ? p.badge : undefined,
    tag: typeof p.tag === 'string' ? p.tag : undefined,
    data: { url: safeTarget(p.url) },
  }
  // Safari and Chrome require every push to show a notification (userVisibleOnly).
  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = safeTarget(event.notification.data && event.notification.data.url)
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if (c.url === target && 'focus' in c) return c.focus()
      }
      for (const c of list) {
        if (new URL(c.url).origin === self.location.origin && 'navigate' in c && 'focus' in c) {
          return c.navigate(target).then((w) => (w || c).focus())
        }
      }
      return self.clients.openWindow ? self.clients.openWindow(target) : undefined
    }),
  )
})
