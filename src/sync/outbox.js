// Pure outbox for sync v2. No I/O, no timers, no globals: the clock and the
// random source are injected, and the actual network send is a callback, so
// every branch is unit testable. Not wired into the live sync path (engine.js);
// the sync tasks that follow will drive it.
//
// The outbox stores only dirty (collection, id) pairs plus the hlc each pair
// was last marked at. It never stores payloads: the send callback reads the
// current record from the record store at send time. Consequences:
//   - 3 edits to one record coalesce into 1 dirty entry (mark overwrites).
//   - replays are idempotent by (collection, id, hlc); the server's
//     `hlc < excluded.hlc` guard makes a re-push a no-op.
//   - ack removes an entry only if its hlc still equals the pushed hlc, so an
//     edit made while a push was in flight stays dirty.
//
// Drain rules (docs/plan/research/R6-report.md):
//   - batches of 200
//   - network and 5xx errors are retryable: 1 s, 2 s, 4 s ... cap 300 s, plus jitter
//   - 401 refreshes the session once, then retries immediately
//   - a constraint error rejects the whole batch server side, so the batch is
//     bisected to isolate one bad record, which is quarantined

export const BATCH_SIZE = 200
export const RETRY_BASE_MS = 1000
export const RETRY_MAX_MS = 5 * 60 * 1000
// Jitter is additive, uniform in [0, JITTER_RATIO * delay).
export const JITTER_RATIO = 0.2

export const ERROR_KIND = Object.freeze({
  NETWORK: 'network',
  SERVER: 'server',
  AUTH: 'auth',
  CONSTRAINT: 'constraint',
  FATAL: 'fatal',
})

const NETWORK_CODES = new Set([
  'ECONNRESET', 'ECONNREFUSED', 'ECONNABORTED', 'ETIMEDOUT', 'ENOTFOUND',
  'EAI_AGAIN', 'EPIPE', 'ENETUNREACH', 'EHOSTUNREACH', 'UND_ERR_SOCKET',
  'UND_ERR_CONNECT_TIMEOUT',
])

function statusOf(err) {
  if (err == null) return undefined
  const s = err.status ?? err.statusCode ?? err.response?.status
  return Number.isInteger(s) ? s : undefined
}

// Sort an error into a retry class.
//   network    no HTTP response (fetch TypeError, reset, timeout, offline); retry with backoff
//   server     5xx, 408 or 429; retry with backoff
//   auth       401; refresh the session, then retry
//   constraint SQLSTATE class 23 (integrity constraint violation), HTTP 409, or
//              err.kind === 'constraint'; bisect the batch
//   fatal      anything else (403, 404, other 4xx, unknown errors); not retried
//              by classification, the drain only backs off so it cannot hot-loop
export function classifyError(err) {
  if (err != null && err.kind === ERROR_KIND.CONSTRAINT) return ERROR_KIND.CONSTRAINT
  const status = statusOf(err)
  if (status === 401) return ERROR_KIND.AUTH
  if (typeof err?.code === 'string' && err.code.startsWith('23')) return ERROR_KIND.CONSTRAINT
  if (status === 409) return ERROR_KIND.CONSTRAINT
  if (status !== undefined) {
    if (status >= 500 || status === 408 || status === 429) return ERROR_KIND.SERVER
    if (status === 0) return ERROR_KIND.NETWORK
    return ERROR_KIND.FATAL
  }
  if (err instanceof TypeError) return ERROR_KIND.NETWORK
  if (err != null && (err.name === 'NetworkError' || err.name === 'AbortError' || err.name === 'TimeoutError')) {
    return ERROR_KIND.NETWORK
  }
  if (err != null && NETWORK_CODES.has(err.code)) return ERROR_KIND.NETWORK
  return ERROR_KIND.FATAL
}

export function isRetryable(kind) {
  return kind === ERROR_KIND.NETWORK || kind === ERROR_KIND.SERVER || kind === ERROR_KIND.AUTH
}

// Delay before retry number `attempt` (0-based): base * 2^attempt capped at
// maxMs, plus jitter in [0, jitterRatio * capped). random() must return [0, 1).
export function backoffDelay(attempt, {
  baseMs = RETRY_BASE_MS,
  maxMs = RETRY_MAX_MS,
  jitterRatio = JITTER_RATIO,
  random = Math.random,
} = {}) {
  const n = Math.max(0, Math.floor(attempt) || 0)
  const capped = Math.min(baseMs * 2 ** Math.min(n, 60), maxMs)
  return Math.floor(capped + random() * jitterRatio * capped)
}

const keyOf = (collection, id) => `${collection}\u0000${id}`

function assertPair(collection, id, hlc) {
  if (typeof collection !== 'string' || collection === '') {
    throw new TypeError('outbox: collection must be a non-empty string')
  }
  if (id == null || id === '') throw new TypeError('outbox: id is required')
  if (typeof hlc !== 'string' || hlc === '') throw new TypeError('outbox: hlc must be a non-empty string')
}

export function createOutbox({
  now = Date.now,
  random = Math.random,
  batchSize = BATCH_SIZE,
  baseMs = RETRY_BASE_MS,
  maxMs = RETRY_MAX_MS,
  jitterRatio = JITTER_RATIO,
  initial = null,
} = {}) {
  // key -> { collection, id, hlc }. Insertion order is send order; re-marking
  // an existing key keeps its position.
  const dirty = new Map()
  // key -> { collection, id, hlc, reason }. Isolated bad records, never sent.
  const quarantined = new Map()
  let attempts = 0
  let retryAt = 0
  let draining = null
  let ackedTotal = 0

  if (initial) {
    for (const [collection, id, hlc] of initial.dirty || []) {
      assertPair(collection, id, hlc)
      dirty.set(keyOf(collection, id), { collection, id: String(id), hlc })
    }
    for (const [collection, id, hlc, reason] of initial.quarantined || []) {
      assertPair(collection, id, hlc)
      quarantined.set(keyOf(collection, id), { collection, id: String(id), hlc, reason: reason ?? null })
    }
  }

  // Record that (collection, id) changed at hlc. Coalesces: a second mark of the
  // same pair overwrites the hlc instead of adding an entry. A newer hlc on a
  // quarantined pair is a fresh edit, so it leaves quarantine and is retried.
  function mark(collection, id, hlc) {
    assertPair(collection, id, hlc)
    const key = keyOf(collection, id)
    const q = quarantined.get(key)
    if (q) {
      if (q.hlc === hlc) return false
      quarantined.delete(key)
    }
    dirty.set(key, { collection, id: String(id), hlc })
    return true
  }

  // Remove entries confirmed pushed. An entry goes only if its hlc still equals
  // the pushed hlc; one re-marked meanwhile stays dirty. Returns the removed count.
  function ack(pushed) {
    let removed = 0
    for (const { collection, id, hlc } of pushed) {
      const key = keyOf(collection, id)
      const cur = dirty.get(key)
      if (cur && cur.hlc === hlc) {
        dirty.delete(key)
        removed += 1
      }
    }
    return removed
  }

  function quarantine(entry, reason) {
    const key = keyOf(entry.collection, entry.id)
    const cur = dirty.get(key)
    // Only quarantine the version that failed; a newer edit stays dirty.
    if (!cur || cur.hlc !== entry.hlc) return false
    dirty.delete(key)
    quarantined.set(key, { collection: cur.collection, id: cur.id, hlc: cur.hlc, reason: reason ?? null })
    return true
  }

  // Put a quarantined pair back into the dirty set (manual retry).
  function release(collection, id) {
    const key = keyOf(collection, id)
    const q = quarantined.get(key)
    if (!q) return false
    quarantined.delete(key)
    if (!dirty.has(key)) dirty.set(key, { collection: q.collection, id: q.id, hlc: q.hlc })
    return true
  }

  // True when a drain may run now (not inside a backoff window).
  function isDue() {
    return now() >= retryAt
  }

  // Up to `limit` dirty entries, oldest first, as detached copies.
  function nextBatch(limit = batchSize) {
    const out = []
    for (const e of dirty.values()) {
      if (out.length >= limit) break
      out.push({ collection: e.collection, id: e.id, hlc: e.hlc })
    }
    return out
  }

  function scheduleRetry() {
    const delayMs = backoffDelay(attempts, { baseMs, maxMs, jitterRatio, random })
    attempts += 1
    retryAt = now() + delayMs
    return delayMs
  }

  function resetBackoff() {
    attempts = 0
    retryAt = 0
  }

  async function sendAndAck(entries, send) {
    const result = await send(entries)
    // send may report what it actually pushed (payload hlc read from the store);
    // otherwise the snapshot it was given is what was pushed.
    ackedTotal += ack(Array.isArray(result) ? result : entries)
  }

  // Isolate bad records in a batch the server rejected with a constraint error.
  // Halves are sent separately; good halves are acked, a failing single entry
  // is quarantined. Any non-constraint error aborts and propagates, leaving the
  // untried entries dirty. Quarantined entries are pushed onto `bad`.
  async function bisect(entries, send, reason, bad) {
    async function go(part) {
      if (part.length === 0) return
      try {
        await sendAndAck(part, send)
      } catch (err) {
        if (classifyError(err) !== ERROR_KIND.CONSTRAINT) throw err
        if (part.length === 1) {
          if (quarantine(part[0], err?.message ?? reason)) bad.push(part[0])
          return
        }
        const mid = Math.ceil(part.length / 2)
        await go(part.slice(0, mid))
        await go(part.slice(mid))
      }
    }
    // The whole batch already failed once; start with its halves.
    if (entries.length === 1) {
      if (quarantine(entries[0], reason)) bad.push(entries[0])
      return
    }
    const mid = Math.ceil(entries.length / 2)
    await go(entries.slice(0, mid))
    await go(entries.slice(mid))
  }

  // Send one batch. `send(entries)` reads the payloads from the record store and
  // pushes them; it resolves on success (optionally with the array of
  // { collection, id, hlc } actually pushed) and throws on failure.
  // `refreshSession()` is called at most once per drainOnce on a 401.
  // Result: { status, sent, quarantined, remaining, delayMs?, kind?, error? }
  //   status 'idle'      nothing dirty
  //   status 'waiting'   inside a backoff window; nothing was sent
  //   status 'sent'      batch pushed (quarantined lists isolated bad records)
  //   status 'retry'     retryable failure; delayMs until the next try
  //   status 'blocked'   fatal failure; entries stay dirty, backoff applied
  async function drainOnce({ send, refreshSession } = {}) {
    if (typeof send !== 'function') throw new TypeError('outbox: drainOnce needs a send function')
    if (dirty.size === 0) return { status: 'idle', sent: 0, quarantined: [], remaining: 0 }
    if (!isDue()) {
      return { status: 'waiting', sent: 0, quarantined: [], remaining: dirty.size, delayMs: retryAt - now() }
    }
    const batch = nextBatch()
    const ackedBefore = ackedTotal
    let refreshed = false
    for (;;) {
      try {
        await sendAndAck(batch, send)
        resetBackoff()
        return { status: 'sent', sent: ackedTotal - ackedBefore, quarantined: [], remaining: dirty.size }
      } catch (err) {
        const kind = classifyError(err)
        if (kind === ERROR_KIND.AUTH && !refreshed && typeof refreshSession === 'function') {
          refreshed = true
          try {
            await refreshSession()
          } catch (refreshErr) {
            const delayMs = scheduleRetry()
            return { status: 'retry', kind, error: refreshErr, sent: 0, quarantined: [], remaining: dirty.size, delayMs }
          }
          continue
        }
        if (kind === ERROR_KIND.CONSTRAINT) {
          const bad = []
          try {
            await bisect(batch, send, err?.message, bad)
          } catch (inner) {
            return failure(inner, ackedBefore, bad)
          }
          resetBackoff()
          return { status: 'sent', sent: ackedTotal - ackedBefore, quarantined: bad, remaining: dirty.size }
        }
        return failure(err, ackedBefore, [])
      }
    }
  }

  function failure(err, ackedBefore, bad) {
    const kind = classifyError(err)
    const delayMs = scheduleRetry()
    return {
      status: isRetryable(kind) ? 'retry' : 'blocked',
      kind,
      error: err,
      sent: ackedTotal - ackedBefore,
      quarantined: bad,
      remaining: dirty.size,
      delayMs,
    }
  }

  // Drain batch after batch until empty, backed off, or blocked. Concurrent
  // callers share one run. Result is the last drainOnce result with totals.
  function drain(opts) {
    if (draining) return draining
    draining = (async () => {
      let sent = 0
      const bad = []
      try {
        for (;;) {
          const r = await drainOnce(opts)
          sent += r.sent
          bad.push(...r.quarantined)
          if (r.status !== 'sent' || dirty.size === 0) {
            return { ...r, status: r.status === 'sent' ? 'idle' : r.status, sent, quarantined: bad }
          }
        }
      } finally {
        draining = null
      }
    })()
    return draining
  }

  // Plain-data snapshot for persistence (r2:outbox). Backoff state is not saved.
  function snapshot() {
    return {
      dirty: [...dirty.values()].map((e) => [e.collection, e.id, e.hlc]),
      quarantined: [...quarantined.values()].map((e) => [e.collection, e.id, e.hlc, e.reason]),
    }
  }

  return {
    mark,
    ack,
    release,
    isDue,
    nextBatch,
    drainOnce,
    drain,
    snapshot,
    has: (collection, id) => dirty.has(keyOf(collection, id)),
    hlcOf: (collection, id) => dirty.get(keyOf(collection, id))?.hlc,
    size: () => dirty.size,
    quarantinedEntries: () => [...quarantined.values()].map((e) => ({ ...e })),
    attempts: () => attempts,
    retryAt: () => retryAt,
  }
}
