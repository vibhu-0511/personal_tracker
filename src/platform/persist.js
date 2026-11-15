// Storage persistence helpers. Every export is total: it never throws and
// never rejects, so callers can fire and forget without a try/catch.
//
// Why: Safari tabs can lose IndexedDB after 7 days without interaction
// (Home Screen apps are exempt), and the browser may evict an origin under
// storage pressure unless persistence is granted. The call site (App.jsx)
// is left to the shell owner.

function getStorage(nav) {
  try {
    const n = nav === undefined ? globalThis.navigator : nav
    return n && n.storage ? n.storage : null
  } catch {
    return null
  }
}

// Ask the browser to mark this origin's storage as persistent.
// Resolves to true (granted or already persisted), false (denied,
// unsupported, or the call failed).
export async function requestPersistence(nav) {
  try {
    const storage = getStorage(nav)
    if (!storage || typeof storage.persist !== 'function') return false
    if (typeof storage.persisted === 'function') {
      try {
        if ((await storage.persisted()) === true) return true
      } catch {
        // fall through and ask anyway
      }
    }
    return (await storage.persist()) === true
  } catch {
    return false
  }
}

// Report usage and quota in bytes, or null for fields the browser does not
// give us. `supported` is false when navigator.storage.estimate is missing
// or the call failed.
export async function getStorageEstimate(nav) {
  const none = { supported: false, usage: null, quota: null, percent: null }
  try {
    const storage = getStorage(nav)
    if (!storage || typeof storage.estimate !== 'function') return none
    const est = await storage.estimate()
    const usage = Number.isFinite(est?.usage) ? est.usage : null
    const quota = Number.isFinite(est?.quota) && est.quota > 0 ? est.quota : null
    const percent = usage !== null && quota !== null ? (usage / quota) * 100 : null
    return { supported: true, usage, quota, percent }
  } catch {
    return none
  }
}

// One-shot convenience: request persistence, then report the estimate.
// Resolves to { persisted, supported, usage, quota, percent }.
export async function initStoragePersistence(nav) {
  const persisted = await requestPersistence(nav)
  const estimate = await getStorageEstimate(nav)
  return { persisted, ...estimate }
}
