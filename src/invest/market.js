// Market data client: memory-only TTL cache plus in-flight dedupe for stock
// quotes (/api/quote), MF search and MF NAV (api.mfapi.in). Not a synced key.
//
// Pure module: apiFetch and fetchImpl are injected so tests never touch the
// network or supabaseClient.js. The app wires the real ones in useQuotes.js.
// Replaces the per-render refetch in tabs/Invest.jsx (every items change,
// even a note edit, refetched all quotes and NAVs).

export const TTL_MS = 60_000
export const MAX_QUOTE_SYMBOLS = 25 // api/quote.js MAX_SYMBOLS
const TIMEOUT_MS = 8000
const MF_BASE = 'https://api.mfapi.in/mf'

function timeoutSignal() {
  return typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(TIMEOUT_MS) : undefined
}

async function getJson(doFetch, url) {
  const r = await doFetch(url, { signal: timeoutSignal() })
  if (r.ok === false) throw new Error(`HTTP ${r.status}`)
  return r.json()
}

// apiFetch(path, init): fetch for our own /api routes (base url + auth).
// fetchImpl(url, init): plain fetch for third-party hosts (mfapi.in).
export function createMarketClient({ apiFetch, fetchImpl, ttlMs = TTL_MS, now = Date.now } = {}) {
  const ext = (...a) => (fetchImpl ?? globalThis.fetch)(...a)
  const api = (...a) => (apiFetch ?? ext)(...a)

  // Three independent namespaces so keys can never collide.
  const stores = { quote: new Map(), nav: new Map(), search: new Map() }
  const inflight = { quote: new Map(), nav: new Map(), search: new Map() }

  const fresh = (store, key) => {
    const hit = store.get(key)
    if (!hit) return undefined
    if (now() - hit.at >= ttlMs) { store.delete(key); return undefined }
    return hit
  }

  // Resolve one key through cache, then in-flight, then `load`. Errors are never cached.
  function cached(kind, key, load, force) {
    if (!force) {
      const hit = fresh(stores[kind], key)
      if (hit) return Promise.resolve(hit.value)
      const pending = inflight[kind].get(key)
      if (pending) return pending
    }
    const p = load()
      .then((value) => {
        if (!value?.error) stores[kind].set(key, { at: now(), value })
        return value
      })
      .finally(() => { if (inflight[kind].get(key) === p) inflight[kind].delete(key) })
    inflight[kind].set(key, p)
    return p
  }

  // symbols -> { [symbol]: quote | { error: true } }. One failed symbol never
  // fails the others; a failed request marks only the symbols it carried.
  async function getQuotes(symbols, { force = false } = {}) {
    const list = [...new Set((symbols || []).filter(Boolean))]
    const out = {}
    const toFetch = []
    const waiting = []
    for (const s of list) {
      if (!force) {
        const hit = fresh(stores.quote, s)
        if (hit) { out[s] = hit.value; continue }
        const pending = inflight.quote.get(s)
        if (pending) { waiting.push(pending.then((v) => { out[s] = v })); continue }
      }
      toFetch.push(s)
    }

    for (let i = 0; i < toFetch.length; i += MAX_QUOTE_SYMBOLS) {
      const chunk = toFetch.slice(i, i + MAX_QUOTE_SYMBOLS)
      const batch = getJson(api, `/api/quote?symbols=${chunk.map(encodeURIComponent).join(',')}`)
        .then((data) => {
          const map = {}
          ;(data?.quotes || []).forEach((q) => { map[q.symbol] = q })
          return map
        })
        .catch(() => ({}))
      for (const s of chunk) {
        const p = batch
          .then((map) => {
            const value = map[s] && !map[s].error ? map[s] : { error: true }
            if (!value.error) stores.quote.set(s, { at: now(), value })
            return value
          })
          .finally(() => { if (inflight.quote.get(s) === p) inflight.quote.delete(s) })
        inflight.quote.set(s, p)
        waiting.push(p.then((v) => { out[s] = v }))
      }
    }
    await Promise.all(waiting)
    return out
  }

  // schemeCodes -> { [code]: { code, nav, date } | { code, error: true } }
  async function getNavs(codes, { force = false } = {}) {
    const list = [...new Set((codes || []).filter((c) => c !== undefined && c !== null && c !== ''))]
    const results = await Promise.all(list.map((code) =>
      cached('nav', String(code), async () => {
        try {
          const d = await getJson(ext, `${MF_BASE}/${encodeURIComponent(code)}/latest`)
          const row = d?.data?.[0]
          if (!row || row.nav === undefined) return { code, error: true }
          return { code, nav: row.nav, date: row.date }
        } catch {
          return { code, error: true }
        }
      }, force)
    ))
    const out = {}
    list.forEach((code, i) => { out[code] = results[i] })
    return out
  }

  // Query -> array of { schemeCode, schemeName } (max 15). Failure yields [] and is not cached.
  async function searchMf(query, { force = false } = {}) {
    const q = String(query ?? '').trim().toLowerCase()
    if (q.length < 3) return []
    const r = await cached('search', q, async () => {
      try {
        const data = await getJson(ext, `${MF_BASE}/search?q=${encodeURIComponent(q)}`)
        return { list: Array.isArray(data) ? data.slice(0, 15) : [] }
      } catch {
        return { error: true, list: [] }
      }
    }, force)
    return r.list
  }

  function clear() {
    for (const s of Object.values(stores)) s.clear()
    // Entries already in flight finish and settle their own waiters.
  }

  return { getQuotes, getNavs, searchMf, clear }
}
