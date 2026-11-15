// Client stream reader for /api/agent: POSTs with fetch and reads the response
// body incrementally. EventSource cannot be used because it cannot POST or send
// an Authorization header.
//
// Pure: no supabase or env import. The caller passes the fetch function (in the
// app, apiFetch from ../api/client.js, which attaches the Bearer token), so tests
// run with fakes and no network.
//
// Wire format accepted (SSE, `data:` lines; event/id/retry/comments are ignored):
//   data: {"delta":"text"}            a reply fragment ("text" and the OpenAI
//                                     choices[0].delta.content shape also work)
//   data: {"error":"message"}         a server-side failure, rejects the call
//   data: [DONE]                      end of reply
// If the response is not text/event-stream (the server's non-stream mode, or a
// platform that buffers), the body is read as JSON { reply } instead.

// Incremental SSE parser. push(text) returns the data payload strings completed
// by it; flush() dispatches a final unterminated event.
export function createEventReader() {
  let buffer = ''
  let dataLines = []

  function dispatch(out) {
    if (dataLines.length === 0) return
    out.push(dataLines.join('\n'))
    dataLines = []
  }

  function handleLine(line, out) {
    if (line === '') return dispatch(out)
    if (line.startsWith(':')) return
    const colon = line.indexOf(':')
    const field = colon === -1 ? line : line.slice(0, colon)
    if (field !== 'data') return
    let value = colon === -1 ? '' : line.slice(colon + 1)
    if (value.startsWith(' ')) value = value.slice(1)
    dataLines.push(value)
  }

  function drain(out, atEnd) {
    for (;;) {
      const m = /\r\n|\n|\r/.exec(buffer)
      if (!m) break
      // A trailing '\r' may be the first half of '\r\n' split across chunks.
      if (m[0] === '\r' && m.index === buffer.length - 1 && !atEnd) break
      const line = buffer.slice(0, m.index)
      buffer = buffer.slice(m.index + m[0].length)
      handleLine(line, out)
    }
  }

  return {
    push(text) {
      const out = []
      if (typeof text !== 'string' || text === '') return out
      buffer += text
      drain(out, false)
      return out
    },
    flush() {
      const out = []
      drain(out, true)
      if (buffer !== '') {
        handleLine(buffer, out)
        buffer = ''
      }
      dispatch(out)
      return out
    },
  }
}

// Interprets one event payload: { done }, { error }, { delta } or {} to skip.
export function interpretEvent(data) {
  if (data === '[DONE]') return { done: true }
  let j
  try {
    j = JSON.parse(data)
  } catch {
    return {}
  }
  if (j && typeof j === 'object') {
    if (typeof j.error === 'string' && j.error) return { error: j.error }
    const d = j.delta ?? j.text ?? j.choices?.[0]?.delta?.content
    if (typeof d === 'string' && d !== '') return { delta: d }
  }
  return {}
}

function isAbortError(err) {
  return err?.name === 'AbortError'
}

async function errorFromResponse(res) {
  let message = `Request failed (${res.status})`
  try {
    const j = await res.json()
    if (typeof j?.error === 'string' && j.error) message = j.error
  } catch {
    /* body was not JSON; keep the status message */
  }
  const err = new Error(message)
  err.status = res.status
  return err
}

// Streams one agent reply.
//   fetchFn   (path, init) => Promise<Response>   default: globalThis.fetch
//   path      default '/api/agent'
//   body      JSON-serialisable request; `stream: true` is added
//   signal    optional AbortSignal; abort cancels the request and the reader
//   onDelta   (text, fullReplySoFar) called once per delta event, in order
// Resolves { reply, streamed, aborted }:
//   streamed  false when the JSON fallback was used (onDelta is NOT called then;
//             use `reply`)
//   aborted   true when stopped via signal; `reply` holds the text received so
//             far and the promise does not reject
// Rejects on a non-2xx response (Error with .status and the server's message),
// on a stream `error` event, and on network failures other than abort.
export async function streamAgentReply({
  fetchFn,
  path = '/api/agent',
  body,
  signal,
  onDelta,
} = {}) {
  const doFetch = fetchFn ?? globalThis.fetch
  let reply = ''
  if (signal?.aborted) return { reply, streamed: true, aborted: true }

  let res
  try {
    res = await doFetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
      body: JSON.stringify({ ...body, stream: true }),
      signal,
    })
  } catch (err) {
    if (isAbortError(err) || signal?.aborted) return { reply, streamed: true, aborted: true }
    throw err
  }

  if (!res.ok) throw await errorFromResponse(res)

  const type = String(res.headers?.get?.('content-type') ?? '').toLowerCase()
  if (!type.includes('text/event-stream')) {
    let j
    try {
      j = await res.json()
    } catch (err) {
      if (isAbortError(err) || signal?.aborted) return { reply, streamed: false, aborted: true }
      throw err
    }
    return { reply: typeof j?.reply === 'string' ? j.reply : '', streamed: false, aborted: false }
  }

  const events = createEventReader()
  const decoder = new TextDecoder()
  let finished = false
  let failure = null

  function handle(datas) {
    for (const data of datas) {
      if (finished) return
      const ev = interpretEvent(data)
      if (ev.done) finished = true
      else if (ev.error) {
        failure = new Error(ev.error)
        finished = true
      } else if (ev.delta !== undefined) {
        reply += ev.delta
        onDelta?.(ev.delta, reply)
      }
    }
  }

  // No readable body (very old runtimes): read it whole and parse the same way.
  if (!res.body?.getReader) {
    handle([...events.push(await res.text()), ...events.flush()])
    if (failure) throw failure
    return { reply, streamed: true, aborted: false }
  }

  const reader = res.body.getReader()
  let aborted = false
  const onAbort = () => {
    aborted = true
    // Resolves any pending read() and releases the underlying source.
    reader.cancel().catch(() => {})
  }
  signal?.addEventListener('abort', onAbort, { once: true })
  if (signal?.aborted) onAbort()

  try {
    while (!finished && !aborted) {
      const { done, value } = await reader.read()
      if (aborted) break
      if (done) {
        handle([...events.push(decoder.decode()), ...events.flush()])
        break
      }
      handle(events.push(decoder.decode(value, { stream: true })))
    }
  } catch (err) {
    if (!(isAbortError(err) || aborted)) throw err
    aborted = true
  } finally {
    signal?.removeEventListener('abort', onAbort)
    if (!aborted) reader.cancel().catch(() => {}) // [DONE]/error seen before EOF
  }

  if (failure && !aborted) throw failure
  return { reply, streamed: true, aborted }
}
