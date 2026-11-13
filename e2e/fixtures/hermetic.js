// Hermetic Playwright fixtures: the app boots signed in against a fake
// Supabase, and any request that leaves localhost fails the test.
import { test as base, expect } from '@playwright/test'
import { AUTH_STORAGE_KEY, API_FIXTURES, KV_SEED, buildKvRows, buildSession } from './data.js'

const json = (route, body, status = 200) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })

export const test = base.extend({
  // Override per test or per describe: test.use({ kvSeed: {...} })
  kvSeed: [KV_SEED, { option: true }],

  // Auto fixture. Returns what the test can assert on.
  hermetic: [
    async ({ context, page, kvSeed }, use) => {
      const unfulfilled = [] // non-localhost requests that hit the block-all route
      const pageErrors = []
      const upserts = new Map() // kv_store key -> last upserted row

      page.on('pageerror', (err) => pageErrors.push(err.message))

      // Playwright matches the LAST registered route first, so the catch-all
      // goes first and every stub below overrides it.
      await context.route(/^https?:\/\/(?!localhost[:/])(?!127\.0\.0\.1[:/])/, (route) => {
        unfulfilled.push(`${route.request().method()} ${route.request().url()}`)
        return route.abort('blockedbyclient')
      })

      // Supabase auth endpoints: nothing real to talk to.
      await context.route('https://e2e.supabase.co/auth/v1/**', (route) => json(route, {}))

      // kv_store REST: GET serves seeded rows, POST (upsert) records the body.
      await context.route('https://e2e.supabase.co/rest/v1/kv_store**', async (route) => {
        const request = route.request()
        const method = request.method()
        if (method === 'GET') {
          const key = new URL(request.url()).searchParams.get('key')?.replace(/^eq\./, '')
          const rows = buildKvRows(kvSeed).filter((r) => !key || r.key === key)
          const wantsObject = (request.headers().accept || '').includes('vnd.pgrst.object')
          if (!wantsObject) return json(route, rows)
          if (rows.length === 1) return json(route, rows[0])
          return json(route, { code: 'PGRST116', message: 'no rows', details: null, hint: null }, 406)
        }
        if (method === 'POST' || method === 'PATCH') {
          const body = request.postDataJSON()
          for (const row of [].concat(body ?? [])) upserts.set(row.key, row)
          return route.fulfill({ status: 201, contentType: 'application/json', body: '' })
        }
        return json(route, {})
      })

      // Realtime websocket: accept and swallow.
      await page.routeWebSocket(/e2e\.supabase\.co\/realtime/, () => {})

      // The app's own serverless endpoints.
      await page.route(/\/api\/(cf|puzzle|quote|agent)(\?|$|\/)/, (route) => {
        const name = new URL(route.request().url()).pathname.split('/').pop()
        return json(route, API_FIXTURES[name] ?? {})
      })

      // Signed-in session for the dummy project in .env.e2e.
      await page.addInitScript(
        ([storageKey, session]) => {
          try { localStorage.setItem(storageKey, JSON.stringify(session)) } catch { /* ignore */ }
        },
        [AUTH_STORAGE_KEY, buildSession()],
      )

      await use({ upserts, unfulfilled, pageErrors })

      expect(pageErrors, 'uncaught page errors').toEqual([])
      expect(unfulfilled, 'non-localhost requests with no fixture').toEqual([])
    },
    { auto: true },
  ],
})

export { expect }
