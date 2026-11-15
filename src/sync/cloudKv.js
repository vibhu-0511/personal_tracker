// Cloud kv_store access, extracted from store.js so it can be tested with an
// injected fake supabase client. supabase-js (postgrest-js) does NOT throw on
// failure: it resolves { data, error }. Both read and write must surface that
// error as a rejection or callers treat failed writes as successful.

function toError(error, fallbackMessage) {
  if (error instanceof Error) return error
  const err = new Error(error?.message || fallbackMessage)
  err.cause = error
  return err
}

export function createCloudKv(supabase) {
  return {
    getSession: () => supabase.auth.getSession(),
    async read(key, userId) {
      const { data, error } = await supabase
        .from('kv_store')
        .select('value, updated_at')
        .eq('key', key)
        .eq('user_id', userId)
        .maybeSingle()
      if (error) throw toError(error, 'kv_store read failed')
      return data
    },
    async write(key, userId, wrapped) {
      const { error } = await supabase.from('kv_store').upsert({
        user_id: userId,
        key,
        value: wrapped.data,
        updated_at: new Date(wrapped.updatedAt).toISOString(),
      })
      if (error) throw toError(error, 'kv_store write failed')
    },
  }
}
