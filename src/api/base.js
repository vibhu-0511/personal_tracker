// Pure API helpers. Env and token source are passed in so tests never import
// supabaseClient.js (which throws without env).

// Join an optional absolute base with an API path, without a double slash.
export function apiUrl(path, base = '') {
  const p = String(path ?? '')
  const b = String(base ?? '').trim().replace(/\/+$/, '')
  if (!b) return p
  return b + (p.startsWith('/') ? p : '/' + p)
}

// Build an apiFetch bound to a base, a token getter and a fetch implementation.
// Authorization is attached only when getToken() yields a token, and an
// explicit caller-supplied Authorization header is never overwritten.
export function createApiFetch({ base = '', getToken, fetchImpl } = {}) {
  return async function apiFetch(path, init = {}) {
    const doFetch = fetchImpl ?? globalThis.fetch
    const token = getToken ? await getToken() : null
    const headers = new Headers(init.headers)
    if (token && !headers.has('Authorization')) headers.set('Authorization', `Bearer ${token}`)
    return doFetch(apiUrl(path, base), { ...init, headers })
  }
}
