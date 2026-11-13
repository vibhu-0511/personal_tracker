// Seed data for the hermetic E2E run. Everything here is fake and local.

export const E2E_USER_ID = '00000000-0000-4000-8000-0000000000e2'
export const E2E_EMAIL = 'e2e@example.test'

// Supabase host label from .env.e2e (https://e2e.supabase.co). supabase-js
// reads its session from localStorage key `sb-<first host label>-auth-token`.
export const AUTH_STORAGE_KEY = 'sb-e2e-auth-token'

function b64url(obj) {
  return Buffer.from(JSON.stringify(obj)).toString('base64url')
}

// JWT-shaped (header.payload.signature) but unsigned and meaningless.
function fakeJwt(exp) {
  return `${b64url({ alg: 'none', typ: 'JWT' })}.${b64url({
    sub: E2E_USER_ID, aud: 'authenticated', role: 'authenticated', exp,
  })}.e2e`
}

// Far-future expiry so getSession() resolves from storage with no refresh call.
export function buildSession(nowSec = Math.floor(Date.now() / 1000)) {
  const expiresAt = nowSec + 60 * 60 * 24 * 365 * 10
  return {
    access_token: fakeJwt(expiresAt),
    refresh_token: 'e2e-refresh-token',
    token_type: 'bearer',
    expires_in: expiresAt - nowSec,
    expires_at: expiresAt,
    user: {
      id: E2E_USER_ID,
      aud: 'authenticated',
      role: 'authenticated',
      email: E2E_EMAIL,
      app_metadata: {},
      user_metadata: {},
      created_at: '2026-01-01T00:00:00.000Z',
    },
  }
}

// kv_store values keyed by the app's SYNCED_KEYS. Only keys listed here get a
// row; every other key reads as "no row" (null).
export const KV_SEED = {
  settings: { cfHandle: 'e2e_handle', theme: 'ocean' },
  tasks: [
    { id: 't1', title: 'Seeded task', due: null, dueAt: null, done: false, doneAt: null, createdAt: 1760000000000, urgent: false, important: false },
    { id: 't2', title: 'Seeded done task', due: null, dueAt: null, done: true, doneAt: 1760000100000, createdAt: 1760000000000, urgent: false, important: false },
  ],
  notes: [],
  habits: [],
}

// Rows as PostgREST returns them. updated_at is old so local writes win.
export function buildKvRows(seed = KV_SEED) {
  return Object.entries(seed).map(([key, value]) => ({
    user_id: E2E_USER_ID,
    key,
    value,
    updated_at: '2026-01-01T00:00:00.000Z',
  }))
}

// Fixture JSON for the app's own /api/* endpoints.
export const API_FIXTURES = {
  cf: { user: { handle: 'e2e_handle', rating: 1200 }, solved: [], recent: [] },
  puzzle: { id: 'e2e', title: 'E2E puzzle', prompt: 'Fixture puzzle', answer: 'x' },
  quote: { quoteResponse: { result: [], error: null } },
  agent: { reply: 'Fixture agent reply' },
}
