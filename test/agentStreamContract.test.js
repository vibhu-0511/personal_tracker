// Contract between the server half (api/agent.js stream frames, built with api/_lib/sse.js)
// and the client reader (src/agents/stream.js). Both were written separately; this keeps them in step.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formatSseEvent } from '../api/_lib/sse.js'
import { streamAgentReply } from '../src/agents/stream.js'

const enc = new TextEncoder()
const sseResponse = (frames) =>
  new Response(new ReadableStream({ start(c) { for (const f of frames) c.enqueue(enc.encode(f)); c.close() } }), {
    status: 200,
    headers: { 'content-type': 'text/event-stream; charset=utf-8' },
  })

test("server delta and done frames rebuild the full reply on the client", async () => {
  const frames = [
    formatSseEvent({ type: 'delta', text: 'Hel' }),
    formatSseEvent({ type: 'delta', text: 'lo, wor' }),
    formatSseEvent({ type: 'delta', text: 'ld' }),
    formatSseEvent({ type: 'done', reply: 'Hello, world' }),
  ]
  const seen = []
  const out = await streamAgentReply({ fetchFn: async () => sseResponse(frames), body: { messages: [] }, onDelta: (d) => seen.push(d) })
  assert.deepEqual(seen, ['Hel', 'lo, wor', 'ld'])
  assert.equal(out.reply, 'Hello, world')
  assert.equal(out.streamed, true)
})

test("a server error frame surfaces as a client error and keeps no partial success", async () => {
  const frames = [
    formatSseEvent({ type: 'delta', text: 'partial' }),
    formatSseEvent({ type: 'error', error: 'Could not reach the agent service' }),
  ]
  await assert.rejects(
    streamAgentReply({ fetchFn: async () => sseResponse(frames), body: { messages: [] } }),
    /Could not reach the agent service/,
  )
})
