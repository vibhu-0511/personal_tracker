import { test } from 'node:test'
import assert from 'node:assert/strict'
import { streamAgentReply, createEventReader, interpretEvent } from '../src/agents/stream.js'

const enc = new TextEncoder()
const ev = (o) => `data: ${JSON.stringify(o)}\n\n`

// Fake ReadableStream that emits the given string chunks, then closes.
function streamOf(chunks) {
  let i = 0
  return new ReadableStream({
    pull(controller) {
      if (i < chunks.length) controller.enqueue(enc.encode(chunks[i++]))
      else controller.close()
    },
  })
}

// Stream that emits chunks then hangs until cancelled; records cancellation.
function hangingStream(chunks, state) {
  let i = 0
  return new ReadableStream({
    pull(controller) {
      if (i < chunks.length) {
        controller.enqueue(enc.encode(chunks[i++]))
        return
      }
      return new Promise(() => {}) // never resolves; cancel() ends the read
    },
    cancel() {
      state.cancelled = true
    },
  })
}

function sseResponse(body, init = {}) {
  return new Response(body, {
    status: 200,
    headers: { 'content-type': 'text/event-stream; charset=utf-8' },
    ...init,
  })
}

test('onDelta fires once per event, in order, and the full reply is returned', async () => {
  const fetchFn = async () =>
    sseResponse(streamOf([ev({ delta: 'Hel' }), ev({ delta: 'lo' }), ev({ delta: ' there' }), 'data: [DONE]\n\n']))
  const seen = []
  const out = await streamAgentReply({ fetchFn, body: { messages: [] }, onDelta: (d, full) => seen.push([d, full]) })
  assert.deepEqual(seen, [['Hel', 'Hel'], ['lo', 'Hello'], [' there', 'Hello there']])
  assert.deepEqual(out, { reply: 'Hello there', streamed: true, aborted: false })
})

test('events split across arbitrary chunk boundaries still arrive intact', async () => {
  const text = ev({ delta: 'ab' }) + ev({ delta: 'cd' }) + 'data: [DONE]\n\n'
  const chunks = text.match(/[\s\S]{1,5}/g)
  const fetchFn = async () => sseResponse(streamOf(chunks))
  const seen = []
  const out = await streamAgentReply({ fetchFn, onDelta: (d) => seen.push(d) })
  assert.deepEqual(seen, ['ab', 'cd'])
  assert.equal(out.reply, 'abcd')
})

test('multibyte characters split across chunks are decoded whole', async () => {
  const bytes = enc.encode(ev({ delta: 'héllo €' }) + 'data: [DONE]\n\n')
  const cut = bytes.indexOf(0xc3) + 1 // inside the two-byte 'é'
  const stream = new ReadableStream({
    start(c) {
      c.enqueue(bytes.slice(0, cut))
      c.enqueue(bytes.slice(cut))
      c.close()
    },
  })
  const out = await streamAgentReply({ fetchFn: async () => sseResponse(stream) })
  assert.equal(out.reply, 'héllo €')
})

test('a final event without a trailing blank line is not lost', async () => {
  const fetchFn = async () => sseResponse(streamOf([ev({ delta: 'a' }), `data: ${JSON.stringify({ delta: 'b' })}`]))
  const out = await streamAgentReply({ fetchFn })
  assert.equal(out.reply, 'ab')
})

test('OpenAI-style delta chunks, comments and unknown fields are handled', async () => {
  const chunk = { choices: [{ delta: { content: 'x' } }] }
  const fetchFn = async () =>
    sseResponse(streamOf([': keep-alive\n\n', 'event: message\nid: 1\n' + ev(chunk), 'data: not json\n\n', ev({ delta: 'y' })]))
  const out = await streamAgentReply({ fetchFn })
  assert.equal(out.reply, 'xy')
})

test('request is a POST with stream:true, Accept header and the abort signal', async () => {
  let call
  const fetchFn = async (path, init) => {
    call = { path, init }
    return sseResponse(streamOf(['data: [DONE]\n\n']))
  }
  const ac = new AbortController()
  await streamAgentReply({ fetchFn, body: { systemPrompt: 's', messages: [{ role: 'user', content: 'hi' }] }, signal: ac.signal })
  assert.equal(call.path, '/api/agent')
  assert.equal(call.init.method, 'POST')
  assert.equal(call.init.headers.Accept, 'text/event-stream')
  assert.equal(call.init.signal, ac.signal)
  assert.deepEqual(JSON.parse(call.init.body), { systemPrompt: 's', messages: [{ role: 'user', content: 'hi' }], stream: true })
})

test('abort mid-stream cancels the reader and resolves with the partial reply', async () => {
  const state = { cancelled: false }
  const fetchFn = async () => sseResponse(hangingStream([ev({ delta: 'par' }), ev({ delta: 'tial' })], state))
  const ac = new AbortController()
  const seen = []
  const out = await streamAgentReply({
    fetchFn,
    signal: ac.signal,
    onDelta: (d) => {
      seen.push(d)
      if (seen.length === 2) setTimeout(() => ac.abort(), 0)
    },
  })
  assert.deepEqual(seen, ['par', 'tial'])
  assert.deepEqual(out, { reply: 'partial', streamed: true, aborted: true })
  assert.equal(state.cancelled, true)
})

test('no deltas are delivered after abort', async () => {
  const ac = new AbortController()
  const state = { cancelled: false }
  const fetchFn = async () => sseResponse(hangingStream([ev({ delta: 'one' }), ev({ delta: 'two' })], state))
  const seen = []
  const out = await streamAgentReply({
    fetchFn,
    signal: ac.signal,
    onDelta: (d) => {
      seen.push(d)
      ac.abort() // synchronous abort inside the first delta
    },
  })
  assert.deepEqual(seen, ['one'])
  assert.equal(out.aborted, true)
  assert.equal(out.reply, 'one')
})

test('abort before the request resolves returns aborted without throwing', async () => {
  const ac = new AbortController()
  const fetchFn = (path, init) =>
    new Promise((_, reject) => {
      init.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
    })
  const p = streamAgentReply({ fetchFn, signal: ac.signal })
  ac.abort()
  assert.deepEqual(await p, { reply: '', streamed: true, aborted: true })
})

test('an already-aborted signal never calls fetch', async () => {
  const ac = new AbortController()
  ac.abort()
  let called = false
  const out = await streamAgentReply({ fetchFn: async () => ((called = true), sseResponse(streamOf([]))), signal: ac.signal })
  assert.equal(called, false)
  assert.equal(out.aborted, true)
})

test('a non-event-stream response falls back to JSON { reply }', async () => {
  const fetchFn = async () =>
    new Response(JSON.stringify({ reply: 'whole answer' }), { status: 200, headers: { 'content-type': 'application/json' } })
  let deltas = 0
  const out = await streamAgentReply({ fetchFn, onDelta: () => deltas++ })
  assert.deepEqual(out, { reply: 'whole answer', streamed: false, aborted: false })
  assert.equal(deltas, 0)
})

test('fallback with a missing reply yields an empty string', async () => {
  const fetchFn = async () => new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } })
  assert.equal((await streamAgentReply({ fetchFn })).reply, '')
})

test('a non-2xx response rejects with the server message and status', async () => {
  const fetchFn = async () =>
    new Response(JSON.stringify({ error: 'Too many requests, try again later' }), {
      status: 429,
      headers: { 'content-type': 'application/json' },
    })
  await assert.rejects(streamAgentReply({ fetchFn }), (e) => e.status === 429 && /Too many requests/.test(e.message))
})

test('a non-2xx response without a JSON body rejects with a status message', async () => {
  const fetchFn = async () => new Response('<html>bad gateway</html>', { status: 502 })
  await assert.rejects(streamAgentReply({ fetchFn }), (e) => e.status === 502 && /502/.test(e.message))
})

test('an error event rejects after delivering earlier deltas', async () => {
  const fetchFn = async () => sseResponse(streamOf([ev({ delta: 'ok' }), ev({ error: 'Upstream failed' }), ev({ delta: 'never' })]))
  const seen = []
  await assert.rejects(streamAgentReply({ fetchFn, onDelta: (d) => seen.push(d) }), /Upstream failed/)
  assert.deepEqual(seen, ['ok'])
})

test('a network failure that is not an abort rejects', async () => {
  const fetchFn = async () => {
    throw new TypeError('network down')
  }
  await assert.rejects(streamAgentReply({ fetchFn }), /network down/)
})

test('a stream that errors mid-read rejects', async () => {
  const stream = new ReadableStream({
    start(c) {
      c.enqueue(enc.encode(ev({ delta: 'a' })))
      c.error(new Error('connection reset'))
    },
  })
  await assert.rejects(streamAgentReply({ fetchFn: async () => sseResponse(stream) }), /connection reset/)
})

test('data after [DONE] is ignored', async () => {
  const fetchFn = async () => sseResponse(streamOf([ev({ delta: 'a' }), 'data: [DONE]\n\n', ev({ delta: 'late' })]))
  assert.equal((await streamAgentReply({ fetchFn })).reply, 'a')
})

test('createEventReader handles CRLF and a CR split from its LF', () => {
  const r = createEventReader()
  assert.deepEqual(r.push('data: one\r'), [])
  assert.deepEqual(r.push('\n\r\ndata: two\r\n\r\n'), ['one', 'two'])
  assert.deepEqual(r.flush(), [])
})

test('createEventReader joins multi-line data', () => {
  const r = createEventReader()
  assert.deepEqual(r.push('data: a\ndata: b\n\n'), ['a\nb'])
})

test('interpretEvent classifies payloads', () => {
  assert.deepEqual(interpretEvent('[DONE]'), { done: true })
  assert.deepEqual(interpretEvent('{"delta":"x"}'), { delta: 'x' })
  assert.deepEqual(interpretEvent('{"text":"x"}'), { delta: 'x' })
  assert.deepEqual(interpretEvent('{"error":"bad"}'), { error: 'bad' })
  assert.deepEqual(interpretEvent('{"delta":""}'), {})
  assert.deepEqual(interpretEvent('nope'), {})
})
