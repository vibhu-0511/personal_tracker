// Pure client helper (no React): fetch a JSON endpoint and turn network, HTTP
// and parse failures into friendly typed errors, so tabs never show a raw
// "Unexpected token <" SyntaxError. Built on apiFetch (R5-01), which adds the
// API base and the Bearer token.
//
//   const data = await fetchJson('/api/cf?handle=x', { signal, timeoutMs: 8000 })
//   if (isCancelled(data)) return            // aborted via signal: not an error
//   try { ... } catch (e) { e.kind, e.message }
//
// Error kinds:
//   offline  - the request never reached a server (network failure)
//   timeout  - timeoutMs elapsed before a response arrived
//   server   - HTTP 5xx (including an HTML platform 504 page)
//   client   - HTTP 4xx
//   parse    - a 2xx response whose body is not valid JSON

export const ERROR_KINDS = Object.freeze(['offline', 'timeout', 'server', 'client', 'parse'])

export const DEFAULT_TIMEOUT_MS = 15000

const FRIENDLY = {
  offline: "You appear to be offline. Check your connection and try again.",
  timeout: 'The request took too long. Please try again.',
  server: 'Server error. Please try again in a moment.',
  client: 'The request could not be completed.',
  parse: 'The server sent a response that could not be read. Please try again.',
}

export class FetchJsonError extends Error {
  constructor(kind, message, { status = null, cause } = {}) {
    super(message || FRIENDLY[kind] || FRIENDLY.client)
    this.name = 'FetchJsonError'
    this.kind = kind
    this.status = status
    if (cause !== undefined) this.cause = cause
  }
}

// Marker resolved (not thrown) when the caller aborts via its own signal.
export const CANCELLED = Object.freeze({ cancelled: true })
export const isCancelled = (v) => v === CANCELLED || (v != null && v.cancelled === true && Object.keys(v).length === 1)

// Pull a human message out of a parsed JSON error body, if there is one.
function bodyMessage(data) {
  if (data && typeof data === 'object') {
    const m = data.error ?? data.message
    if (typeof m === 'string' && m.trim()) return m.trim()
    if (m && typeof m === 'object' && typeof m.message === 'string' && m.message.trim()) return m.message.trim()
  }
  return null
}

function tryParse(text) {
  try { return { ok: true, value: JSON.parse(text) } } catch { return { ok: false } }
}

// Lazily resolve the real apiFetch so this module stays importable in node
// tests (client.js imports supabaseClient.js and import.meta.env).
let realApiFetch
async function defaultApiFetch(path, init) {
  if (!realApiFetch) realApiFetch = (await import('../api/client.js')).apiFetch
  return realApiFetch(path, init)
}

// Build a fetchJson bound to an apiFetch implementation (injectable for tests).
export function createFetchJson({ apiFetch = defaultApiFetch, timeoutMs: defaultTimeout = DEFAULT_TIMEOUT_MS } = {}) {
  return async function fetchJson(path, options = {}) {
    const { signal, timeoutMs = defaultTimeout, ...init } = options

    if (signal?.aborted) return CANCELLED

    const ctrl = new AbortController()
    let timedOut = false
    let timer
    let onAbort
    // Settles when the caller aborts or the timeout fires, even if the fetch
    // implementation ignores the signal.
    const interrupted = new Promise((resolve) => {
      onAbort = () => { ctrl.abort(); resolve('cancelled') }
      signal?.addEventListener('abort', onAbort, { once: true })
      if (Number.isFinite(timeoutMs) && timeoutMs > 0) {
        timer = setTimeout(() => { timedOut = true; ctrl.abort(); resolve('timeout') }, timeoutMs)
      }
    })
    const cleanup = () => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
    }
    const guard = (p) => {
      p.catch(() => {}) // a late rejection after we stopped waiting must not go unhandled
      return Promise.race([p.then((value) => ({ value })), interrupted.then((why) => ({ why }))])
    }

    try {
      let r = await guard(Promise.resolve().then(() => apiFetch(path, { ...init, signal: ctrl.signal })).catch((e) => { throw { fetchFailure: e } }))
      if (r.why) return r.why === 'cancelled' ? CANCELLED : fail('timeout')
      const res = r.value

      r = await guard(res.text().catch((e) => { throw { fetchFailure: e } }))
      if (r.why) return r.why === 'cancelled' ? CANCELLED : fail('timeout')
      const text = r.value
      const parsed = text.trim() === '' ? { ok: true, value: null } : tryParse(text)

      if (!res.ok) {
        const status = res.status
        const kind = status >= 500 ? 'server' : 'client'
        const msg = parsed.ok ? bodyMessage(parsed.value) : null
        throw new FetchJsonError(kind, msg || (kind === 'client' && status === 404 ? 'Not found.' : undefined), { status })
      }
      if (!parsed.ok) throw new FetchJsonError('parse', undefined, { status: res.status })
      return parsed.value
    } catch (e) {
      if (e instanceof FetchJsonError) throw e
      const inner = e && e.fetchFailure !== undefined ? e.fetchFailure : e
      // An abort surfacing as an exception is still a cancel/timeout, not offline.
      if (signal?.aborted) return CANCELLED
      if (timedOut) throw new FetchJsonError('timeout', undefined, { cause: inner })
      throw new FetchJsonError('offline', undefined, { cause: inner })
    } finally {
      cleanup()
    }

    function fail(kind) { throw new FetchJsonError(kind) }
  }
}

export const fetchJson = createFetchJson()
