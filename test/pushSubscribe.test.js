import { test } from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import { readFileSync } from 'node:fs'
import { subscribe, isSupported, isConfigured, decodeVapidKey, STATUS } from '../src/push/subscribe.js'

// Test-only P-256 shaped key (0x04 + 64 bytes), not a real VAPID key.
const FAKE_KEY = Buffer.from([4, ...Array.from({ length: 64 }, (_, i) => i + 1)]).toString('base64url')

function makeEnv({ ios = false, standalone = false, permission = 'default', existing = null } = {}) {
  const calls = { requestPermission: 0, subscribe: [], getSubscription: 0 }
  const subscription = { toJSON: () => ({ endpoint: 'https://push.example/abc', keys: { p256dh: 'p', auth: 'a' } }) }
  const reg = {
    pushManager: {
      getSubscription: async () => {
        calls.getSubscription++
        return existing
      },
      subscribe: async (o) => {
        calls.subscribe.push(o)
        return subscription
      },
    },
  }
  const nav = {
    userAgent: ios ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari/604.1' : 'Mozilla/5.0 (X11; Linux) Chrome/120',
    serviceWorker: { ready: Promise.resolve(reg) },
    standalone: ios ? standalone : undefined,
  }
  const Notification = {
    permission,
    requestPermission: async () => {
      calls.requestPermission++
      return 'granted'
    },
  }
  const PushManager = function PushManager() {}
  const win = { navigator: nav, Notification, PushManager, matchMedia: () => ({ matches: false }) }
  return { opts: { win, publicKey: FAKE_KEY }, calls }
}

test('without a configured key it is a no-op and never prompts', async () => {
  const { opts, calls } = makeEnv()
  const r = await subscribe({ ...opts, publicKey: '', gesture: true })
  assert.equal(r.ok, false)
  assert.equal(r.status, STATUS.NOT_CONFIGURED)
  assert.equal(r.reason, 'not configured')
  assert.equal(calls.requestPermission, 0)
  assert.equal(calls.subscribe.length, 0)
  assert.equal(isConfigured({ ...opts, publicKey: '' }), false)
  // No env key set in the test process either.
  assert.equal((await subscribe({ win: opts.win, gesture: true })).status, STATUS.NOT_CONFIGURED)
})

test('rejects a malformed key', async () => {
  const { opts } = makeEnv()
  assert.equal(decodeVapidKey('not a key!'), null)
  assert.equal(decodeVapidKey('AAAA'), null)
  assert.equal((await subscribe({ ...opts, publicKey: 'AAAA', gesture: true })).status, STATUS.INVALID_KEY)
})

test('refuses to run without a gesture flag', async () => {
  const { opts, calls } = makeEnv()
  for (const g of [undefined, false, 'yes', 1]) {
    const r = await subscribe({ ...opts, gesture: g })
    assert.equal(r.ok, false)
    assert.equal(r.status, STATUS.NO_GESTURE)
  }
  assert.equal(calls.requestPermission, 0)
  assert.equal(calls.subscribe.length, 0)
})

test('with a gesture it asks permission and returns a JSON subscription', async () => {
  const { opts, calls } = makeEnv()
  const r = await subscribe({ ...opts, gesture: true })
  assert.equal(r.ok, true)
  assert.equal(r.status, STATUS.SUBSCRIBED)
  assert.deepEqual(r.subscription, { endpoint: 'https://push.example/abc', keys: { p256dh: 'p', auth: 'a' } })
  assert.equal(JSON.stringify(r.subscription).includes('toJSON'), false)
  assert.equal(calls.requestPermission, 1)
  assert.equal(calls.subscribe.length, 1)
  assert.equal(calls.subscribe[0].userVisibleOnly, true)
  assert.ok(calls.subscribe[0].applicationServerKey instanceof Uint8Array)
  assert.equal(calls.subscribe[0].applicationServerKey.length, 65)
})

test('reuses an existing subscription and skips the prompt when already granted', async () => {
  const existing = { toJSON: () => ({ endpoint: 'https://push.example/old', keys: {} }) }
  const { opts, calls } = makeEnv({ permission: 'granted', existing })
  const r = await subscribe({ ...opts, gesture: true })
  assert.equal(r.subscription.endpoint, 'https://push.example/old')
  assert.equal(calls.requestPermission, 0)
  assert.equal(calls.subscribe.length, 0)
})

test('denied permission is reported', async () => {
  const { opts, calls } = makeEnv({ permission: 'denied' })
  const r = await subscribe({ ...opts, gesture: true })
  assert.equal(r.status, STATUS.DENIED)
  assert.equal(calls.subscribe.length, 0)
})

test("reports 'unsupported' on iOS Safari outside an installed app", async () => {
  const { opts, calls } = makeEnv({ ios: true, standalone: false })
  assert.equal(isSupported(opts), false)
  const r = await subscribe({ ...opts, gesture: true })
  assert.equal(r.status, 'unsupported')
  assert.equal(calls.requestPermission, 0)
})

test('works on iOS when installed to the Home Screen', async () => {
  const { opts } = makeEnv({ ios: true, standalone: true })
  assert.equal(isSupported(opts), true)
  assert.equal((await subscribe({ ...opts, gesture: true })).status, STATUS.SUBSCRIBED)
})

test('reports unsupported when PushManager is missing', async () => {
  const { opts } = makeEnv()
  opts.win.PushManager = undefined
  assert.equal((await subscribe({ ...opts, gesture: true })).status, STATUS.UNSUPPORTED)
})

test('push-sw.js shows a notification on push and opens a same-origin url on click', async () => {
  const src = readFileSync(new URL('../public/push-sw.js', import.meta.url), 'utf8')
  const handlers = {}
  const shown = []
  const opened = []
  const self = {
    location: { origin: 'https://app.example' },
    addEventListener: (t, f) => (handlers[t] = f),
    registration: { showNotification: (title, o) => (shown.push({ title, o }), Promise.resolve()) },
    clients: { matchAll: async () => [], openWindow: (u) => (opened.push(u), Promise.resolve()) },
  }
  vm.runInNewContext(src, { self, URL })
  assert.equal(typeof handlers.push, 'function')
  assert.equal(typeof handlers.notificationclick, 'function')

  let waited
  handlers.push({
    data: { json: () => ({ title: 'Hi', body: 'Yo', url: 'https://evil.example/x' }) },
    waitUntil: (p) => (waited = p),
  })
  await waited
  assert.equal(shown[0].title, 'Hi')
  assert.equal(shown[0].o.data.url, 'https://app.example/')

  // empty payload still shows a notification
  handlers.push({ data: null, waitUntil: (p) => (waited = p) })
  await waited
  assert.equal(shown[1].title, 'Tracker')

  let closed = false
  handlers.notificationclick({
    notification: { close: () => (closed = true), data: { url: 'https://app.example/today' } },
    waitUntil: (p) => (waited = p),
  })
  await waited
  assert.ok(closed)
  assert.deepEqual(opened, ['https://app.example/today'])
})
