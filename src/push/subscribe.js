// Client side of Web Push. Push stays OFF until the owner sets the public VAPID
// key (env VITE_VAPID_PUBLIC_KEY, owner task P5-U2). Until then subscribe() is a
// no-op that reports 'not-configured'. Nothing here runs on import and nothing
// prompts for notification permission except subscribe({ gesture: true }), which
// the caller must invoke from a tap/click handler (iOS requires that).

export const STATUS = Object.freeze({
  NOT_CONFIGURED: 'not-configured',
  INVALID_KEY: 'invalid-key',
  UNSUPPORTED: 'unsupported',
  NO_GESTURE: 'gesture-required',
  DENIED: 'denied',
  FAILED: 'failed',
  SUBSCRIBED: 'subscribed',
})

function envKey() {
  try {
    return import.meta.env?.VITE_VAPID_PUBLIC_KEY || ''
  } catch {
    return ''
  }
}

function resolve(opts = {}) {
  const w = opts.win ?? globalThis
  return {
    key: typeof opts.publicKey === 'string' ? opts.publicKey : envKey(),
    nav: opts.nav ?? w.navigator,
    win: w,
    Notif: opts.Notification ?? w.Notification,
    PM: opts.PushManager ?? w.PushManager,
  }
}

// Decode a base64url VAPID public key to bytes, or null when it is not a P-256
// uncompressed point (65 bytes starting 0x04).
export function decodeVapidKey(key) {
  try {
    if (typeof key !== 'string' || !/^[A-Za-z0-9_-]+={0,2}$/.test(key)) return null
    const b64 = key.replace(/=+$/, '').replace(/-/g, '+').replace(/_/g, '/')
    const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4))
    const out = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
    return out.length === 65 && out[0] === 4 ? out : null
  } catch {
    return null
  }
}

export function isConfigured(opts) {
  return Boolean(resolve(opts).key)
}

export function isIOS(nav) {
  const ua = nav?.userAgent || ''
  return /iPad|iPhone|iPod/.test(ua) || (nav?.platform === 'MacIntel' && nav?.maxTouchPoints > 1)
}

export function isStandalone(nav, win) {
  if (nav?.standalone === true) return true
  try {
    return Boolean(win?.matchMedia?.('(display-mode: standalone)')?.matches)
  } catch {
    return false
  }
}

// True when Web Push can work here. iOS Safari only supports it for an installed
// Home Screen app (iOS 16.4+), never in a normal tab.
export function isSupported(opts) {
  const { nav, win, Notif, PM } = resolve(opts)
  if (!nav || !('serviceWorker' in nav) || !PM || !Notif) return false
  if (isIOS(nav) && !isStandalone(nav, win)) return false
  return true
}

// Subscribe this device. Resolves to { ok, status, reason?, subscription? } and
// never throws. `subscription` is the plain JSON form ({ endpoint, keys }).
export async function subscribe(opts = {}) {
  const r = resolve(opts)
  if (!r.key) return { ok: false, status: STATUS.NOT_CONFIGURED, reason: 'not configured' }
  const appKey = decodeVapidKey(r.key)
  if (!appKey) return { ok: false, status: STATUS.INVALID_KEY, reason: 'invalid VAPID public key' }
  if (!isSupported(opts)) return { ok: false, status: STATUS.UNSUPPORTED, reason: 'unsupported' }
  if (opts.gesture !== true) {
    return { ok: false, status: STATUS.NO_GESTURE, reason: 'must be called from a user gesture' }
  }
  try {
    let perm = r.Notif.permission
    if (perm === 'default') perm = await r.Notif.requestPermission()
    if (perm !== 'granted') return { ok: false, status: STATUS.DENIED, reason: 'permission ' + perm }
    const reg = await r.nav.serviceWorker.ready
    const existing = await reg.pushManager.getSubscription()
    const sub =
      existing ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: appKey }))
    return { ok: true, status: STATUS.SUBSCRIBED, subscription: sub.toJSON() }
  } catch (e) {
    return { ok: false, status: STATUS.FAILED, reason: e?.message || 'subscribe failed' }
  }
}
