// Per-user sliding-window rate limit. Pure logic over an injected storage
// adapter so it can be tested without a network and wired to Supabase by the
// handler (R5-08).
//
// Storage adapter contract (both methods may be async):
//   listSince(userId, sinceMs) -> number[]   epoch-ms timestamps of this user's
//                                            recorded calls with at >= sinceMs
//   record(userId, atMs)       -> void       store one call
//
// Known limit: check-then-record is not atomic, so a burst of truly concurrent
// requests can overshoot the limit slightly. Acceptable for a single-owner proxy.

export const MINUTE_MS = 60 * 1000
export const DAY_MS = 24 * 60 * MINUTE_MS

function assertLimit(name, v) {
  if (!Number.isInteger(v) || v < 1) throw new Error(`${name} must be a positive integer`)
}

// Seconds until the oldest call inside the window slides out (at least 1).
function waitSec(timestamps, windowMs, now) {
  const oldest = Math.min(...timestamps)
  return Math.max(1, Math.ceil((oldest + windowMs - now) / 1000))
}

// Returns { allowed: true } and records the call, or
// { allowed: false, retryAfterSec } without recording it.
export async function checkRateLimit({ storage, userId, perMinute, perDay, now = Date.now() }) {
  if (!storage || typeof storage.listSince !== 'function' || typeof storage.record !== 'function') {
    throw new Error('storage adapter with listSince and record is required')
  }
  if (!userId) throw new Error('userId is required')
  assertLimit('perMinute', perMinute)
  assertLimit('perDay', perDay)

  const dayHits = (await storage.listSince(userId, now - DAY_MS)).filter(
    (t) => Number.isFinite(t) && t > now - DAY_MS && t <= now,
  )
  const minuteHits = dayHits.filter((t) => t > now - MINUTE_MS)

  // Only the newest `limit` calls matter: once the count reaches the limit, the
  // call that frees a slot is the (count - limit + 1)th oldest, not the oldest.
  const waits = []
  if (minuteHits.length >= perMinute) {
    const sorted = [...minuteHits].sort((a, b) => a - b)
    waits.push(waitSec([sorted[sorted.length - perMinute]], MINUTE_MS, now))
  }
  if (dayHits.length >= perDay) {
    const sorted = [...dayHits].sort((a, b) => a - b)
    waits.push(waitSec([sorted[sorted.length - perDay]], DAY_MS, now))
  }
  if (waits.length) return { allowed: false, retryAfterSec: Math.max(...waits) }

  await storage.record(userId, now)
  return { allowed: true }
}

// Adapter over a Supabase client built with the caller's JWT (anon key plus an
// Authorization header), so RLS on public.agent_usage applies and no
// service-role key is needed. See docs/sql/agent_usage.sql.
export function supabaseUsageStorage(supabase, { table = 'agent_usage', maxRows = 10000 } = {}) {
  return {
    async listSince(userId, sinceMs) {
      const { data, error } = await supabase
        .from(table)
        .select('at')
        .eq('user_id', userId)
        .gte('at', new Date(sinceMs).toISOString())
        .order('at', { ascending: true })
        .limit(maxRows)
      if (error) throw new Error(`usage read failed: ${error.message}`)
      return data.map((row) => Date.parse(row.at))
    },
    async record(userId, atMs) {
      const { error } = await supabase
        .from(table)
        .insert({ user_id: userId, at: new Date(atMs).toISOString() })
      if (error) throw new Error(`usage write failed: ${error.message}`)
    },
  }
}

// In-memory adapter for tests and local development.
export function memoryUsageStorage() {
  const rows = new Map()
  return {
    async listSince(userId, sinceMs) {
      return (rows.get(userId) || []).filter((t) => t >= sinceMs)
    },
    async record(userId, atMs) {
      rows.set(userId, [...(rows.get(userId) || []), atMs])
    },
  }
}
