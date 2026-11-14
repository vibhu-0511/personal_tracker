import test from 'node:test'
import assert from 'node:assert/strict'
import {
  createOutbox, classifyError, backoffDelay, isRetryable, ERROR_KIND,
  BATCH_SIZE, RETRY_BASE_MS, RETRY_MAX_MS,
} from '../src/sync/outbox.js'

const hlc = (n) => `${String(1_700_000_000_000 + n).padStart(15, '0')}-0000-dev-a`

function fakeClock(t = 1_000_000) {
  return { now: () => t, advance: (ms) => { t += ms } }
}

const httpErr = (status, extra = {}) => Object.assign(new Error(`http ${status}`), { status, ...extra })

test('3 edits to one record coalesce to 1 dirty entry', () => {
  const ob = createOutbox()
  ob.mark('tasks', 't1', hlc(1))
  ob.mark('tasks', 't1', hlc(2))
  ob.mark('tasks', 't1', hlc(3))
  assert.equal(ob.size(), 1)
  assert.deepEqual(ob.nextBatch(), [{ collection: 'tasks', id: 't1', hlc: hlc(3) }])
  // different id or collection is a different entry
  ob.mark('tasks', 't2', hlc(4))
  ob.mark('notes', 't1', hlc(5))
  assert.equal(ob.size(), 3)
})

test('outbox stores no payloads, only collection, id and hlc', () => {
  const ob = createOutbox()
  ob.mark('tasks', 't1', hlc(1))
  assert.deepEqual(ob.snapshot(), { dirty: [['tasks', 't1', hlc(1)]], quarantined: [] })
})

test('ack removes an entry only if its hlc still equals the pushed hlc', () => {
  const ob = createOutbox()
  ob.mark('tasks', 't1', hlc(1))
  ob.mark('tasks', 't2', hlc(1))
  const pushed = ob.nextBatch()
  // t1 is edited again while the push is in flight
  ob.mark('tasks', 't1', hlc(2))
  assert.equal(ob.ack(pushed), 1)
  assert.equal(ob.has('tasks', 't2'), false)
  assert.equal(ob.has('tasks', 't1'), true)
  assert.equal(ob.hlcOf('tasks', 't1'), hlc(2))
  // acking the stale hlc again is still a no-op
  assert.equal(ob.ack(pushed), 0)
  assert.equal(ob.size(), 1)
})

test('drainOnce acks with the pushed snapshot, so an in-flight edit stays dirty', async () => {
  const ob = createOutbox()
  ob.mark('tasks', 't1', hlc(1))
  const r = await ob.drainOnce({
    send: async () => { ob.mark('tasks', 't1', hlc(2)) },
  })
  assert.equal(r.status, 'sent')
  assert.equal(r.sent, 0)
  assert.equal(ob.size(), 1)
  assert.equal(ob.hlcOf('tasks', 't1'), hlc(2))
})

test('send may report the entries it actually pushed', async () => {
  const ob = createOutbox()
  ob.mark('tasks', 't1', hlc(1))
  // store held a newer hlc than the one marked: pushing hlc(2) must not ack hlc(1)
  await ob.drainOnce({ send: async () => [{ collection: 'tasks', id: 't1', hlc: hlc(2) }] })
  assert.equal(ob.size(), 1)
})

test('batches of 200, oldest first', async () => {
  assert.equal(BATCH_SIZE, 200)
  const ob = createOutbox()
  for (let i = 0; i < 450; i++) ob.mark('tasks', `t${i}`, hlc(i))
  const sizes = []
  const r = await ob.drain({ send: async (entries) => { sizes.push(entries.length) } })
  assert.deepEqual(sizes, [200, 200, 50])
  assert.equal(r.status, 'idle')
  assert.equal(r.sent, 450)
  assert.equal(ob.size(), 0)
})

test('drain with nothing dirty is idle and never calls send', async () => {
  const ob = createOutbox()
  const r = await ob.drain({ send: async () => { throw new Error('should not send') } })
  assert.equal(r.status, 'idle')
})

test('backoffDelay doubles from 1s and caps at 300s (no jitter)', () => {
  const zero = () => 0
  const delays = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 40, 1000].map((a) => backoffDelay(a, { random: zero }))
  assert.deepEqual(delays, [
    1000, 2000, 4000, 8000, 16000, 32000, 64000, 128000, 256000, 300000, 300000, 300000, 300000,
  ])
  assert.equal(RETRY_BASE_MS, 1000)
  assert.equal(RETRY_MAX_MS, 300000)
})

test('backoffDelay adds jitter from the injected random source', () => {
  const lo = backoffDelay(2, { random: () => 0 })
  const mid = backoffDelay(2, { random: () => 0.5 })
  const hi = backoffDelay(2, { random: () => 0.999999 })
  assert.equal(lo, 4000)
  assert.ok(mid > lo && hi > mid, `${lo} ${mid} ${hi}`)
  assert.ok(hi < 4000 * 1.2 + 1)
  // jitter applies at the cap too
  assert.ok(backoffDelay(30, { random: () => 0.5 }) > 300000)
})

test('classifyError: network and 5xx are retryable', () => {
  assert.equal(classifyError(new TypeError('Failed to fetch')), ERROR_KIND.NETWORK)
  assert.equal(classifyError(Object.assign(new Error('x'), { code: 'ECONNRESET' })), ERROR_KIND.NETWORK)
  assert.equal(classifyError(httpErr(0)), ERROR_KIND.NETWORK)
  assert.equal(classifyError(httpErr(500)), ERROR_KIND.SERVER)
  assert.equal(classifyError(httpErr(503)), ERROR_KIND.SERVER)
  assert.equal(classifyError(httpErr(429)), ERROR_KIND.SERVER)
  assert.equal(classifyError(httpErr(401)), ERROR_KIND.AUTH)
  assert.equal(classifyError(httpErr(409)), ERROR_KIND.CONSTRAINT)
  assert.equal(classifyError(Object.assign(new Error('dup'), { code: '23505' })), ERROR_KIND.CONSTRAINT)
  assert.equal(classifyError(httpErr(403)), ERROR_KIND.FATAL)
  assert.equal(classifyError(new Error('???')), ERROR_KIND.FATAL)
  assert.equal(isRetryable(ERROR_KIND.NETWORK), true)
  assert.equal(isRetryable(ERROR_KIND.SERVER), true)
  assert.equal(isRetryable(ERROR_KIND.CONSTRAINT), false)
  assert.equal(isRetryable(ERROR_KIND.FATAL), false)
})

test('network and 5xx failures back off 1s, 2s, 4s ... and keep entries dirty', async () => {
  const clock = fakeClock()
  const ob = createOutbox({ now: clock.now, random: () => 0 })
  ob.mark('tasks', 't1', hlc(1))
  const errs = [new TypeError('Failed to fetch'), httpErr(500), httpErr(503), httpErr(502)]
  const delays = []
  for (const e of errs) {
    const r = await ob.drainOnce({ send: async () => { throw e } })
    assert.equal(r.status, 'retry')
    assert.equal(r.kind === ERROR_KIND.NETWORK || r.kind === ERROR_KIND.SERVER, true)
    delays.push(r.delayMs)
    assert.equal(ob.size(), 1)
    clock.advance(r.delayMs)
  }
  assert.deepEqual(delays, [1000, 2000, 4000, 8000])
  // success resets the backoff
  const ok = await ob.drainOnce({ send: async () => {} })
  assert.equal(ok.status, 'sent')
  assert.equal(ob.attempts(), 0)
  assert.equal(ob.size(), 0)
})

test('inside the backoff window drainOnce waits without sending', async () => {
  const clock = fakeClock()
  const ob = createOutbox({ now: clock.now, random: () => 0 })
  ob.mark('tasks', 't1', hlc(1))
  await ob.drainOnce({ send: async () => { throw httpErr(500) } })
  let calls = 0
  const send = async () => { calls += 1 }
  clock.advance(999)
  const w = await ob.drainOnce({ send })
  assert.equal(w.status, 'waiting')
  assert.equal(w.delayMs, 1)
  assert.equal(calls, 0)
  clock.advance(1)
  assert.equal(ob.isDue(), true)
  assert.equal((await ob.drainOnce({ send })).status, 'sent')
  assert.equal(calls, 1)
})

test('401 refreshes the session once, then retries the same batch', async () => {
  const ob = createOutbox()
  ob.mark('tasks', 't1', hlc(1))
  const order = []
  let authed = false
  const r = await ob.drainOnce({
    send: async () => { order.push('send'); if (!authed) throw httpErr(401) },
    refreshSession: async () => { order.push('refresh'); authed = true },
  })
  assert.deepEqual(order, ['send', 'refresh', 'send'])
  assert.equal(r.status, 'sent')
  assert.equal(ob.size(), 0)
  assert.equal(ob.attempts(), 0)
})

test('401 that persists after one refresh backs off instead of looping', async () => {
  const clock = fakeClock()
  const ob = createOutbox({ now: clock.now, random: () => 0 })
  ob.mark('tasks', 't1', hlc(1))
  let refreshes = 0
  let sends = 0
  const r = await ob.drainOnce({
    send: async () => { sends += 1; throw httpErr(401) },
    refreshSession: async () => { refreshes += 1 },
  })
  assert.equal(refreshes, 1)
  assert.equal(sends, 2)
  assert.equal(r.status, 'retry')
  assert.equal(r.kind, ERROR_KIND.AUTH)
  assert.equal(r.delayMs, 1000)
  assert.equal(ob.size(), 1)
})

test('a failing refresh backs off and keeps the entries', async () => {
  const ob = createOutbox({ random: () => 0 })
  ob.mark('tasks', 't1', hlc(1))
  const r = await ob.drainOnce({
    send: async () => { throw httpErr(401) },
    refreshSession: async () => { throw new TypeError('offline') },
  })
  assert.equal(r.status, 'retry')
  assert.equal(ob.size(), 1)
})

// A server that rejects the whole batch when it holds a bad id, like forge_push.
function constraintServer(badIds) {
  const stored = new Set()
  const calls = []
  return {
    stored,
    calls,
    send: async (entries) => {
      calls.push(entries.map((e) => e.id))
      if (entries.some((e) => badIds.has(e.id))) {
        throw Object.assign(new Error('violates check constraint'), { code: '23514', status: 400 })
      }
      for (const e of entries) stored.add(e.id)
    },
  }
}

test('a constraint error bisects the batch to isolate and quarantine one bad record', async () => {
  const ob = createOutbox()
  for (let i = 0; i < 37; i++) ob.mark('tasks', `t${i}`, hlc(i))
  const srv = constraintServer(new Set(['t23']))
  const r = await ob.drainOnce({ send: srv.send })
  assert.equal(r.status, 'sent')
  assert.deepEqual(r.quarantined.map((e) => e.id), ['t23'])
  assert.equal(r.sent, 36)
  assert.equal(srv.stored.size, 36)
  assert.equal(srv.stored.has('t23'), false)
  assert.equal(ob.size(), 0)
  assert.deepEqual(ob.quarantinedEntries().map((e) => e.id), ['t23'])
  assert.match(ob.quarantinedEntries()[0].reason, /constraint/)
  // bisect, not one-by-one: far fewer calls than 37
  assert.ok(srv.calls.length < 37, `calls ${srv.calls.length}`)
  // the quarantined record is not sent again
  const again = await ob.drain({ send: srv.send })
  assert.equal(again.status, 'idle')
})

test('bisect quarantines several bad records and sends the rest', async () => {
  const ob = createOutbox()
  for (let i = 0; i < 20; i++) ob.mark('tasks', `t${i}`, hlc(i))
  const srv = constraintServer(new Set(['t0', 't13', 't19']))
  const r = await ob.drain({ send: srv.send })
  assert.deepEqual(r.quarantined.map((e) => e.id).sort(), ['t0', 't13', 't19'])
  assert.equal(srv.stored.size, 17)
  assert.equal(ob.size(), 0)
})

test('a single-record batch with a constraint error is quarantined directly', async () => {
  const ob = createOutbox()
  ob.mark('tasks', 'bad', hlc(1))
  const srv = constraintServer(new Set(['bad']))
  const r = await ob.drainOnce({ send: srv.send })
  assert.equal(srv.calls.length, 1)
  assert.deepEqual(r.quarantined.map((e) => e.id), ['bad'])
  assert.equal(ob.size(), 0)
})

test('a network error during bisect aborts, keeps untried entries dirty and backs off', async () => {
  const clock = fakeClock()
  const ob = createOutbox({ now: clock.now, random: () => 0 })
  for (let i = 0; i < 8; i++) ob.mark('tasks', `t${i}`, hlc(i))
  let n = 0
  const send = async (entries) => {
    n += 1
    if (n === 1) throw Object.assign(new Error('bad'), { code: '23505' })
    if (n === 2) return // first half ok
    throw new TypeError('Failed to fetch')
  }
  const r = await ob.drainOnce({ send })
  assert.equal(r.status, 'retry')
  assert.equal(r.kind, ERROR_KIND.NETWORK)
  assert.equal(r.sent, 4)
  assert.equal(ob.size(), 4)
  assert.equal(ob.quarantinedEntries().length, 0)
})

test('a fresh edit of a quarantined record leaves quarantine; the same hlc does not', () => {
  const ob = createOutbox()
  ob.mark('tasks', 'bad', hlc(1))
  const [e] = ob.nextBatch()
  // simulate quarantine through a drain
  return ob.drainOnce({ send: async () => { throw Object.assign(new Error('x'), { code: '23505' }) } }).then(() => {
    assert.equal(ob.quarantinedEntries().length, 1)
    assert.equal(ob.mark('tasks', 'bad', e.hlc), false)
    assert.equal(ob.size(), 0)
    assert.equal(ob.mark('tasks', 'bad', hlc(2)), true)
    assert.equal(ob.size(), 1)
    assert.equal(ob.quarantinedEntries().length, 0)
  })
})

test('release puts a quarantined record back in the dirty set', async () => {
  const ob = createOutbox()
  ob.mark('tasks', 'bad', hlc(1))
  await ob.drainOnce({ send: async () => { throw httpErr(409) } })
  assert.equal(ob.release('tasks', 'bad'), true)
  assert.equal(ob.release('tasks', 'bad'), false)
  assert.equal(ob.size(), 1)
})

test('a fatal error blocks with backoff and keeps entries', async () => {
  const ob = createOutbox({ random: () => 0 })
  ob.mark('tasks', 't1', hlc(1))
  const r = await ob.drainOnce({ send: async () => { throw httpErr(403) } })
  assert.equal(r.status, 'blocked')
  assert.equal(r.kind, ERROR_KIND.FATAL)
  assert.equal(r.delayMs, 1000)
  assert.equal(ob.size(), 1)
})

test('drain stops at the first failing batch', async () => {
  const ob = createOutbox({ random: () => 0 })
  for (let i = 0; i < 250; i++) ob.mark('tasks', `t${i}`, hlc(i))
  let n = 0
  const r = await ob.drain({
    send: async () => { n += 1; if (n === 2) throw httpErr(503) },
  })
  assert.equal(r.status, 'retry')
  assert.equal(r.sent, 200)
  assert.equal(ob.size(), 50)
})

test('concurrent drain calls share one run', async () => {
  const ob = createOutbox()
  ob.mark('tasks', 't1', hlc(1))
  let calls = 0
  const send = async () => { calls += 1; await Promise.resolve() }
  const [a, b] = await Promise.all([ob.drain({ send }), ob.drain({ send })])
  assert.equal(calls, 1)
  assert.equal(a, b)
})

test('snapshot round-trips through initial, including quarantine', async () => {
  const ob = createOutbox()
  ob.mark('tasks', 't1', hlc(1))
  ob.mark('tasks', 'bad', hlc(2))
  await ob.drainOnce({
    send: async (entries) => {
      if (entries.length > 1) throw httpErr(409)
      if (entries[0].id === 'bad') throw httpErr(409)
    },
  })
  const snap = JSON.parse(JSON.stringify(ob.snapshot()))
  const restored = createOutbox({ initial: snap })
  assert.deepEqual(restored.snapshot(), ob.snapshot())
  assert.equal(restored.quarantinedEntries()[0].id, 'bad')
})

test('mark validates its arguments', () => {
  const ob = createOutbox()
  assert.throws(() => ob.mark('', 'a', hlc(1)), TypeError)
  assert.throws(() => ob.mark('tasks', '', hlc(1)), TypeError)
  assert.throws(() => ob.mark('tasks', 'a', ''), TypeError)
})

test('discardQuarantined forgets only the quarantined version it names', () => {
  const ob = createOutbox({})
  ob.mark('tasks', 't1', hlc(1))
  assert.equal(ob.quarantine({ collection: 'tasks', id: 't1', hlc: hlc(1) }, 'why'), true)
  assert.equal(ob.discardQuarantined('tasks', 't1', hlc(2)), false)
  assert.equal(ob.quarantinedEntries().length, 1)
  assert.equal(ob.discardQuarantined('tasks', 't1', hlc(1)), true)
  assert.equal(ob.quarantinedEntries().length, 0)
  assert.equal(ob.size(), 0)
})
