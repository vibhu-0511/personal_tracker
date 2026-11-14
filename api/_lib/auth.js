// Owner gate for the /api/agent proxy. Fail-closed: any missing input, verifier
// error or mismatch resolves to false. The verifier is injectable so tests (and
// later a local JWT check) never need the network.

export function extractBearerToken(req) {
  const h = req?.headers?.authorization
  if (typeof h !== 'string') return ''
  return h.replace(/^Bearer\s+/i, '').trim()
}

// Default verifier: asks Supabase who owns the token. Returns a user id or null.
// supabase-js is imported lazily so importing this module costs nothing.
export function createSupabaseVerifier(env = process.env) {
  return async function verify(token) {
    const url = env.VITE_SUPABASE_URL
    const anonKey = env.VITE_SUPABASE_ANON_KEY
    if (!url || !anonKey) return null
    const { createClient } = await import('@supabase/supabase-js')
    const supabase = createClient(url, anonKey)
    const { data, error } = await supabase.auth.getUser(token)
    return error ? null : data?.user?.id ?? null
  }
}

// verifier(token) resolves to a user id string, or { id }, or a falsy value.
export async function isOwner(req, { env = process.env, verifier } = {}) {
  const ownerUserId = env.OWNER_USER_ID
  const token = extractBearerToken(req)
  if (!ownerUserId || !token) return false
  const verify = verifier || createSupabaseVerifier(env)
  try {
    const result = await verify(token)
    const id = result && typeof result === 'object' ? result.id : result
    return typeof id === 'string' && id !== '' && id === ownerUserId
  } catch {
    return false
  }
}
