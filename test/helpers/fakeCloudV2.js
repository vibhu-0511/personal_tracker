// In-memory fake of the sync v2 cloud (public.records + forge_push + realtime).
// It mirrors the SQL in docs/plan/research/R6-sync-v2.sql, which is the same
// DDL as supabase/migrations/0001_sync_v2.sql. It never contacts any service.
//
// What is mirrored (section numbers refer to the SQL file):
//  1. Row shape and constraints: PK (user_id, collection, id); collection, id,
//     hlc and tombstone CHECKs; body < 262144 bytes; NOT NULL columns.
//     rev is stamped from one sequence on every insert and every applied
//     update (the records_stamp trigger), server_at likewise.
//  2. RLS: a client only ever sees and writes rows of its session user. There is
//     no physical DELETE for clients; deletes are tombstone upserts.
//  3. forge_push(rows): batched, atomic and idempotent.
//       - more than 500 rows: the whole batch is silently dropped (returns []).
//       - a row whose hlc physical part (substr(hlc,1,15)) is more than 24 h
//         ahead of the server clock is silently dropped (not an error).
//       - a row whose hlc is NULL is silently dropped too (the WHERE is NULL).
//       - on conflict the row is updated only when stored.hlc < incoming.hlc
//         (plain string compare), so a replay or a stale row changes nothing
//         and is not returned.
//       - only applied rows are returned, as { out_collection, out_id, out_rev }.
//       - any constraint error rejects the WHOLE batch; nothing is applied.
//  4. Realtime: INSERT and UPDATE events (deletes are tombstone UPDATEs), only
//     to subscribers of the row's user. UPDATE `old` carries only the primary
//     key (default replica identity).
//  5. forge_gc_tombstones: gcTombstones() below (no realtime event is emitted).
//
// Not modelled, on purpose: sequence gaps (Postgres also burns sequence values
// for rows that conflict or fail, here rev only moves on applied writes, so
// code must rely on "strictly increasing", never "contiguous"); commits becoming
// visible out of rev order; duplicate (collection, id) pairs inside ONE batch
// (applied here in order; real Postgres behaviour was not validated, so the
// client must coalesce); jsonb internals (pg_column_size is approximated by the
// UTF-8 length of the JSON text); collate "C" vs JS string order differ only for
// non-ASCII node ids; Realtime delivery latency and ordering.
//
// Wire format is snake_case like PostgREST: rows are { user_id, collection, id,
// body, pos, hlc, device_id, deleted_at, rev, server_at }.
//
// Usage:
//   const cloud = createFakeCloudV2({ userId: 'u1', now: () => clockMs })
//   const phone = cloud.fork()                 // same server, own session/outage state
//   const other = cloud.fork({ userId: 'u2' }) // a different signed-in user
//   await cloud.push([{ collection, id, body, pos, hlc, device_id, deleted_at }])
//   await cloud.pull({ sinceRev: 0 })
//   const sub = cloud.subscribe((evt) => ..., { onStatus: (s) => ... })
//   cloud.inject('503', { times: 2 }); cloud.setOffline(true)

export const MAX_PUSH_ROWS = 500
export const MAX_BODY_BYTES = 262144 // records_body_size_chk: pg_column_size(body) < 262144
export const MAX_DRIFT_MS = 86400000 // forge_push: now + 24 h

const COLLECTION_RE = /^[A-Za-z][A-Za-z0-9_]{0,39}$/
const HLC_RE = /^[0-9]{15}-[0-9a-f]{4}-.{1,32}$/s // PG '.' matches newlines
const BIGINT_RE = /^\s*[+-]?\d+\s*$/
const DAY_MS = 86400000

function pgError(code, message, status = 400) {
  return Object.assign(new Error(message), { code, status })
}

const clone = (v) => (v === undefined ? v : JSON.parse(JSON.stringify(v)))
const keyOf = (uid, collection, id) => `${uid}\u0000${collection}\u0000${id}`

function checkViolation(name) {
  return pgError('23514', `new row for relation "records" violates check constraint "${name}"`)
}

// Validates one incoming recordset row against column types, NOT NULLs and CHECKs.
// Returns the normalised proposed row, or throws the Postgres-style error.
function normaliseRow(r) {
  const notNull = (col) => pgError('23502', `null value in column "${col}" of relation "records" violates not-null constraint`)
  const text = (v, col) => {
    if (typeof v !== 'string') throw pgError('22P02', `invalid input for text column "${col}" (fake accepts strings only)`)
    return v
  }
  if (r.collection == null) throw notNull('collection')
  if (r.id == null) throw notNull('id')
  if (r.device_id == null) throw notNull('device_id')
  const collection = text(r.collection, 'collection')
  const id = text(r.id, 'id')
  const device_id = text(r.device_id, 'device_id')
  const hlc = text(r.hlc, 'hlc')

  let pos = r.pos ?? null
  if (pos !== null && !(typeof pos === 'number' && Number.isFinite(pos))) {
    throw pgError('22P02', 'invalid input syntax for type double precision')
  }
  let deleted_at = r.deleted_at ?? null
  if (deleted_at !== null) {
    const ms = typeof deleted_at === 'string' ? Date.parse(deleted_at) : NaN
    if (Number.isNaN(ms)) throw pgError('22007', 'invalid input syntax for type timestamp with time zone')
    deleted_at = new Date(ms).toISOString()
  }
  const body = r.body === undefined || r.body === null ? null : clone(r.body)

  if (!COLLECTION_RE.test(collection)) throw checkViolation('records_collection_chk')
  const idLen = [...id].length
  if (idLen < 1 || idLen > 200) throw checkViolation('records_id_chk')
  if (!HLC_RE.test(hlc)) throw checkViolation('records_hlc_chk')
  if (body !== null && Buffer.byteLength(JSON.stringify(body), 'utf8') >= MAX_BODY_BYTES) {
    throw checkViolation('records_body_size_chk')
  }
  if ((deleted_at === null) !== (body !== null)) throw checkViolation('records_tombstone_chk')
  return { collection, id, body, pos, hlc, device_id, deleted_at }
}

function makeServer({ now }) {
  const table = new Map() // keyOf(user_id, collection, id) -> stored row
  const clients = new Set()
  let seq = 0

  const server = {
    table,
    clients,
    now,
    nextRev: () => ++seq,
    get lastRev() { return seq },

    // forge_push body for an authenticated uid. Throws before mutating anything.
    push(uid, rows) {
      if (!Array.isArray(rows)) throw pgError('22023', 'cannot get array length of a non-array')
      if (rows.length > MAX_PUSH_ROWS) return []
      const ceiling = server.now() + DAY_MS
      const staged = []
      for (const r of rows) {
        if (r === null || typeof r !== 'object') throw pgError('22023', 'recordset element is not an object')
        if (r.hlc == null) continue // substr(NULL)::bigint is NULL, the WHERE drops the row
        const head = String(r.hlc).slice(0, 15)
        if (!BIGINT_RE.test(head)) throw pgError('22P02', `invalid input syntax for type bigint: "${head}"`)
        if (Number(head) > ceiling) continue // clock-drift guard, silent drop
        staged.push(normaliseRow(r))
      }
      // All validation passed: now apply (atomic from the caller's point of view).
      const out = []
      for (const p of staged) {
        const k = keyOf(uid, p.collection, p.id)
        const existing = table.get(k)
        if (existing && !(existing.hlc < p.hlc)) continue // replay or stale: no change, not returned
        const row = { user_id: uid, ...p, rev: ++seq, server_at: new Date(server.now()).toISOString() }
        table.set(k, row)
        out.push({ out_collection: p.collection, out_id: p.id, out_rev: row.rev })
        server.emit(existing
          ? { eventType: 'UPDATE', new: row, old: { user_id: uid, collection: p.collection, id: p.id } }
          : { eventType: 'INSERT', new: row, old: {} })
      }
      return out
    },

    // records_select policy plus the delta-pull query: rev > sinceRev order by rev limit n.
    pull(uid, { sinceRev = 0, limit = 1000 }) {
      return [...table.values()]
        .filter((r) => r.user_id === uid && r.rev > sinceRev)
        .sort((a, b) => a.rev - b.rev)
        .slice(0, limit)
        .map(clone)
    },

    emit(change) {
      const evt = { schema: 'public', table: 'records', ...clone(change) }
      for (const c of clients) c._deliver(evt)
    },

    // forge_gc_tombstones(retain): physical delete of old tombstones, returns the count.
    gc(retainMs) {
      const cutoff = server.now() - retainMs
      let n = 0
      for (const [k, r] of table) {
        if (r.deleted_at !== null && Date.parse(r.deleted_at) < cutoff) { table.delete(k); n++ }
      }
      return n
    },
  }
  return server
}

function makeClient(server, { userId }) {
  let sessionUserId = userId
  let offline = false
  let realtimeUp = true
  let lastConnected = true
  const injections = []
  const subs = new Set()

  const offlineError = () => Object.assign(new Error('TypeError: Failed to fetch'), { status: 0 })

  // One-shot or counted failures. Constraint failures only match pushes whose batch
  // contains a row accepted by `match` (default: any row), so a "poison record" can be
  // isolated by a client that bisects the batch.
  function takeInjection(op, rows) {
    const i = injections.findIndex((f) => f.ops.includes(op) && (f.kind !== 'constraint' || rows.some(f.match)))
    if (i === -1) return null
    const f = injections[i]
    f.times -= 1
    if (f.times <= 0) injections.splice(i, 1)
    return f
  }

  function errorFor(f) {
    if (f.kind === 'offline') return offlineError()
    if (f.kind === '503') return Object.assign(new Error('Service Unavailable'), { status: 503 })
    if (f.kind === '401') return Object.assign(new Error('JWT expired (fake)'), { status: 401 })
    return checkViolation('records_hlc_chk') // 'constraint': injected check violation
  }

  const requireSession = () => {
    if (!sessionUserId) throw Object.assign(new Error('No session (fake): sign in first'), { status: 401 })
    return sessionUserId
  }

  const connected = () => !offline && realtimeUp
  function syncRealtimeState() {
    const now = connected()
    if (now === lastConnected) return
    lastConnected = now
    for (const s of subs) s.onStatus?.(now ? 'SUBSCRIBED' : 'CHANNEL_ERROR')
  }

  const client = {
    // supabase.auth.getSession() shape, same as the v1 fake in test/syncEngine.test.js.
    async getSession() {
      return { data: { session: sessionUserId ? { user: { id: sessionUserId } } : null } }
    },
    setSessionUserId(id) { sessionUserId = id },
    get userId() { return sessionUserId },

    calls: { push: 0, pull: 0 },
    pushed: [], // every batch this client attempted to push (clones), failed ones included

    // forge_push. Resolves the applied rows; rejects with an Error carrying .status/.code.
    async push(rows) {
      client.calls.push++
      client.pushed.push(clone(rows))
      if (offline) throw offlineError()
      const uid = requireSession()
      const f = takeInjection('push', Array.isArray(rows) ? rows : [])
      if (f && !f.ackLost) throw errorFor(f)
      const applied = server.push(uid, rows)
      if (f) throw errorFor(f) // ackLost: the write was committed, the response never arrived
      return applied
    },

    // Delta pull by rev: own rows with rev > sinceRev, ascending, at most `limit`.
    // Tombstones are ordinary rows here.
    async pull({ sinceRev = 0, limit = 1000 } = {}) {
      client.calls.pull++
      if (offline) throw offlineError()
      const uid = requireSession()
      const f = takeInjection('pull', [])
      if (f) throw errorFor(f)
      return server.pull(uid, { sinceRev, limit })
    },

    // Realtime: one channel filtered to user_id=eq.<uid>. handler gets
    // { schema, table, eventType: 'INSERT'|'UPDATE', new, old }. onStatus gets
    // 'SUBSCRIBED' now and after every outage, 'CHANNEL_ERROR' when the link drops.
    // Events that happen while down are lost, as in real life: the client must delta-pull.
    subscribe(handler, { userId: filterUserId, onStatus } = {}) {
      const uid = filterUserId ?? requireSession()
      const sub = { handler, onStatus, uid }
      subs.add(sub)
      onStatus?.(connected() ? 'SUBSCRIBED' : 'CHANNEL_ERROR')
      return { unsubscribe() { subs.delete(sub) } }
    },
    get subscriberCount() { return subs.size },

    // ---- failure injection ----

    // kind: 'offline' (network failure, status 0) | '503' | '401' | 'constraint' (23514, push only).
    // opts: times (default 1, Infinity = until clearFailures), ops (default both; constraint is
    // push-only), match(row) for constraint (default any row), ackLost: for offline/503 on push, the
    // batch IS committed but the call still rejects, so the client must replay idempotently.
    inject(kind, { times = 1, ops, match = () => true, ackLost = false } = {}) {
      if (!['offline', '503', '401', 'constraint'].includes(kind)) throw new Error(`fakeCloudV2: unknown failure ${kind}`)
      if (ackLost && !['offline', '503'].includes(kind)) throw new Error('fakeCloudV2: ackLost only applies to offline and 503')
      injections.push({ kind, times, ops: ops ?? (kind === 'constraint' ? ['push'] : ['push', 'pull']), match, ackLost })
      return client
    },
    clearFailures() { injections.length = 0 },

    // Persistent outage for this client (push, pull and realtime) until set back to false.
    setOffline(v) { offline = !!v; syncRealtimeState() },
    // Realtime-only outage (push and pull keep working).
    setRealtimeUp(v) { realtimeUp = !!v; syncRealtimeState() },

    // ---- server-side inspection and admin (shared by every client of this server) ----

    // Another device on the same server: own session, outage and failure state.
    // Defaults to the same user as this client.
    fork({ userId: forkUser = sessionUserId } = {}) { return makeClient(server, { userId: forkUser }) },
    // Every stored row of every user, ascending rev (what a dashboard superuser would see).
    allRows() { return [...server.table.values()].sort((a, b) => a.rev - b.rev).map(clone) },
    // One stored row of any user, or null.
    getRow(uid, collection, id) { return clone(server.table.get(keyOf(uid, collection, id))) ?? null },
    get lastRev() { return server.lastRev },
    gcTombstones({ retainMs = 90 * DAY_MS } = {}) { return server.gc(retainMs) },

    _deliver(evt) {
      if (!connected()) return
      for (const s of [...subs]) {
        // Realtime applies RLS: only the signed-in owner of the row gets it.
        if (evt.new.user_id === s.uid && evt.new.user_id === sessionUserId) {
          try { s.handler(clone(evt)) } catch { /* a throwing listener must not break the server */ }
        }
      }
    },
  }
  server.clients.add(client)
  return client
}

export function createFakeCloudV2({ userId = 'u1', now = () => Date.now() } = {}) {
  return makeClient(makeServer({ now }), { userId })
}
