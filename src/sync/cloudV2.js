// Supabase glue for sync v2: forge_push RPC, delta pull by rev and the realtime
// subscription. Not wired into store.js or the app (v2 stays off). The supabase
// client is injected, as in createSyncEngine and createCloudKv, because
// src/supabaseClient.js throws at import without env vars.
//
// Wire format is snake_case (public.records, docs/plan/research/R6-sync-v2.sql);
// the sync modules use camelCase records { collection, id, body, pos, hlc,
// deviceId, deletedAt }. This file maps both ways and adds `rev` (and
// `serverAt`, `userId`) on rows that come back from the server.
//
// supabase-js (postgrest-js) does NOT throw on failure: it resolves { data,
// error }. Every call here surfaces that error as a rejection, keeping
// `status` and `code` so classifyError (outbox.js) can sort it.

export const PUSH_BATCH_SIZE = 200 // the server drops a whole batch above 500
export const PULL_PAGE_SIZE = 1000

function toError(error, status, fallbackMessage) {
  if (error instanceof Error) return error
  const err = new Error(error?.message || fallbackMessage)
  err.cause = error
  const s = status ?? error?.status
  if (s !== undefined) err.status = s
  if (error?.code !== undefined) err.code = error.code
  return err
}

// camelCase record -> forge_push row.
export function toWireRow(rec) {
  return {
    collection: rec.collection,
    id: rec.id,
    body: rec.body ?? null,
    pos: rec.pos ?? null,
    hlc: rec.hlc,
    device_id: rec.deviceId,
    deleted_at: rec.deletedAt ?? null,
  }
}

// public.records row (snake_case) -> camelCase record.
export function fromWireRow(row) {
  if (row == null) return row
  return {
    userId: row.user_id,
    collection: row.collection,
    id: row.id,
    body: row.body ?? null,
    pos: row.pos ?? null,
    hlc: row.hlc,
    deviceId: row.device_id,
    deletedAt: row.deleted_at ?? null,
    rev: row.rev == null ? row.rev : Number(row.rev),
    serverAt: row.server_at,
  }
}

export function createCloudV2(supabase, { pushBatchSize = PUSH_BATCH_SIZE, pullPageSize = PULL_PAGE_SIZE } = {}) {
  if (!supabase) throw new Error('createCloudV2: a supabase client is required')

  return {
    getSession: () => supabase.auth.getSession(),

    // Pushes camelCase records through rpc('forge_push', { rows }) in batches of
    // at most pushBatchSize, in order. Throws on the first {error}; earlier
    // batches stay applied, which is safe because forge_push is idempotent.
    // Resolves the applied rows: [{ collection, id, rev }].
    async push(records) {
      const applied = []
      for (let i = 0; i < records.length; i += pushBatchSize) {
        const rows = records.slice(i, i + pushBatchSize).map(toWireRow)
        const { data, error, status } = await supabase.rpc('forge_push', { rows })
        if (error) throw toError(error, status, 'forge_push failed')
        for (const r of data ?? []) {
          applied.push({ collection: r.out_collection, id: r.out_id, rev: Number(r.out_rev) })
        }
      }
      return applied
    },

    // Delta pull: own rows with rev > sinceRev, ascending, fetched in pages of
    // pullPageSize until a short page. Tombstones are ordinary rows. Resolves
    // { rows, cursor } where cursor is the highest rev seen (sinceRev if none).
    // The caller applies any overlap window (cursor - 50) and de-dupes by hlc.
    async pull({ sinceRev = 0 } = {}) {
      const rows = []
      let cursor = sinceRev
      for (;;) {
        const { data, error, status } = await supabase
          .from('records')
          .select('*')
          .gt('rev', cursor)
          .order('rev', { ascending: true })
          .limit(pullPageSize)
        if (error) throw toError(error, status, 'records pull failed')
        const page = (data ?? []).map(fromWireRow)
        rows.push(...page)
        if (page.length === 0) break
        const last = page[page.length - 1].rev
        if (!(last > cursor)) break // rev must advance; never loop on a bad page
        cursor = last
        if (page.length < pullPageSize) break
      }
      return { rows, cursor }
    },

    // One channel, filter user_id=eq.<uid>, event '*'. onChange gets
    // { eventType, record, old } (record is camelCase). onStatus gets the
    // channel status: 'SUBSCRIBED' on the first join and again after every
    // reconnect (events missed while down are lost, so the engine delta-pulls
    // on each SUBSCRIBED), 'CHANNEL_ERROR' / 'TIMED_OUT' / 'CLOSED' otherwise.
    // Returns { unsubscribe() }.
    subscribe(userId, onChange, { onStatus } = {}) {
      if (!userId) throw new Error('subscribe: userId is required')
      const channel = supabase
        .channel(`records:${userId}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'records', filter: `user_id=eq.${userId}` },
          (payload) => onChange({
            eventType: payload.eventType,
            record: payload.new && payload.new.id !== undefined ? fromWireRow(payload.new) : null,
            old: payload.old ?? {},
          }),
        )
        .subscribe((status, err) => onStatus?.(status, err))
      return {
        unsubscribe() {
          return supabase.removeChannel(channel)
        },
      }
    },
  }
}
