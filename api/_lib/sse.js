// Server-sent-events helpers for OpenAI-style chat-completions streaming (the
// format Groq uses). Pure: no I/O, no handler wiring.
//
// Incoming: createSseParser() turns arbitrary text chunks (which may split a
// line or an event anywhere) into a list of items:
//   { type: 'content', text }   a non-empty delta.content string
//   { type: 'done' }            the [DONE] sentinel; later input is ignored
//   { type: 'invalid', data }   an event whose data was not valid JSON
// delta.reasoning (and any other delta field) is deliberately dropped, as are
// role-only chunks, empty content, comment lines and unknown SSE fields.
//
// Outgoing: formatSseEvent / formatSseDone / SSE_DONE build 'data: ...\n\n'.

export const SSE_DONE = 'data: [DONE]\n\n'

// Serialises one outgoing event as a single SSE data frame.
export function formatSseEvent(payload) {
  return `data: ${JSON.stringify(payload)}\n\n`
}

export function formatSseDone() {
  return SSE_DONE
}

// Interprets one parsed chat-completions chunk; returns the content string to
// emit, or null when the chunk carries none.
function contentOf(chunk) {
  const text = chunk?.choices?.[0]?.delta?.content
  return typeof text === 'string' && text !== '' ? text : null
}

// Stateful parser. push(chunk) accepts a string and returns the items completed
// by it. flush() should be called when the stream ends: a final event that was
// not terminated by a blank line is dispatched rather than lost.
export function createSseParser() {
  let buffer = ''
  let dataLines = []
  let finished = false

  function dispatch(out) {
    if (dataLines.length === 0) return
    const data = dataLines.join('\n')
    dataLines = []
    if (data === '[DONE]') {
      finished = true
      out.push({ type: 'done' })
      return
    }
    let chunk
    try {
      chunk = JSON.parse(data)
    } catch {
      out.push({ type: 'invalid', data })
      return
    }
    const text = contentOf(chunk)
    if (text !== null) out.push({ type: 'content', text })
  }

  function handleLine(line, out) {
    if (line === '') return dispatch(out)
    if (line.startsWith(':')) return // comment / keep-alive
    const colon = line.indexOf(':')
    const field = colon === -1 ? line : line.slice(0, colon)
    if (field !== 'data') return // event / id / retry are unused here
    let value = colon === -1 ? '' : line.slice(colon + 1)
    if (value.startsWith(' ')) value = value.slice(1)
    dataLines.push(value)
  }

  // Splits complete lines off the buffer. A trailing '\r' is held back because
  // its '\n' may arrive in the next chunk.
  function drain(out, atEnd) {
    while (!finished) {
      const m = /\r\n|\n|\r/.exec(buffer)
      if (!m) break
      if (m[0] === '\r' && m.index === buffer.length - 1 && !atEnd) break
      const line = buffer.slice(0, m.index)
      buffer = buffer.slice(m.index + m[0].length)
      handleLine(line, out)
    }
  }

  return {
    push(chunk) {
      const out = []
      if (finished || typeof chunk !== 'string' || chunk === '') return out
      buffer += chunk
      drain(out, false)
      if (finished) buffer = ''
      return out
    },
    flush() {
      const out = []
      if (finished) return out
      drain(out, true)
      if (!finished && buffer !== '') {
        handleLine(buffer, out)
        buffer = ''
      }
      if (!finished) dispatch(out)
      return out
    },
  }
}

// Convenience for a complete body: parses everything and returns all items.
export function parseSseText(text) {
  const parser = createSseParser()
  return [...parser.push(text), ...parser.flush()]
}
