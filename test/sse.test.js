import test from 'node:test'
import assert from 'node:assert/strict'
import { createSseParser, parseSseText, formatSseEvent, formatSseDone, SSE_DONE } from '../api/_lib/sse.js'

// FIXTURES: hand-written in the documented SSE chat-completions chunk format
// (each event is 'data: <json>' followed by a blank line, ending with
// 'data: [DONE]'). They are NOT recorded from a live response; field values
// such as ids and model names are invented placeholders.
const chunk = (delta, extra = {}) =>
  `data: ${JSON.stringify({ id: 'fixture-1', object: 'chat.completion.chunk', model: 'fixture-model', choices: [{ index: 0, delta, finish_reason: null }], ...extra })}\n\n`

const STREAM =
  chunk({ role: 'assistant', content: '' }) +
  chunk({ content: 'Hel' }) +
  chunk({ content: 'lo' }) +
  chunk({ content: ', world' }) +
  `data: ${JSON.stringify({ id: 'fixture-1', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] })}\n\n` +
  'data: [DONE]\n\n'

const texts = (items) => items.filter((i) => i.type === 'content').map((i) => i.text)

test('parses a whole stream into content items then done', () => {
  const items = parseSseText(STREAM)
  assert.deepEqual(items, [
    { type: 'content', text: 'Hel' },
    { type: 'content', text: 'lo' },
    { type: 'content', text: ', world' },
    { type: 'done' },
  ])
})

test('handles multiple events in a single chunk', () => {
  const p = createSseParser()
  const items = p.push(chunk({ content: 'a' }) + chunk({ content: 'b' }) + chunk({ content: 'c' }))
  assert.deepEqual(texts(items), ['a', 'b', 'c'])
})

test('handles chunks split mid-line, at every possible byte boundary', () => {
  const expected = parseSseText(STREAM)
  for (let i = 1; i < STREAM.length; i++) {
    const p = createSseParser()
    const items = [...p.push(STREAM.slice(0, i)), ...p.push(STREAM.slice(i)), ...p.flush()]
    assert.deepEqual(items, expected, `split at ${i}`)
  }
})

test('handles one character per chunk', () => {
  const p = createSseParser()
  const items = []
  for (const ch of STREAM) items.push(...p.push(ch))
  items.push(...p.flush())
  assert.deepEqual(items, parseSseText(STREAM))
})

test('does not emit an event until its terminating blank line arrives', () => {
  const p = createSseParser()
  const whole = chunk({ content: 'x' })
  assert.deepEqual(p.push(whole.slice(0, -1)), [])
  assert.deepEqual(p.push('\n'), [{ type: 'content', text: 'x' }])
})

test('[DONE] yields a done item and later input is ignored', () => {
  const p = createSseParser()
  const items = p.push('data: [DONE]\n\n' + chunk({ content: 'late' }))
  assert.deepEqual(items, [{ type: 'done' }])
  assert.deepEqual(p.push(chunk({ content: 'later' })), [])
  assert.deepEqual(p.flush(), [])
})

test('ignores delta.reasoning and yields only delta.content', () => {
  const items = parseSseText(
    chunk({ reasoning: 'thinking about it' }) +
      chunk({ reasoning: 'more thinking', content: 'Answer' }) +
      chunk({ content: null, reasoning: 'still thinking' }) +
      chunk({ content: ' text' }) +
      'data: [DONE]\n\n',
  )
  assert.deepEqual(texts(items), ['Answer', ' text'])
  assert.equal(JSON.stringify(items).includes('thinking'), false)
})

test('role-only, empty-content and finish chunks yield nothing', () => {
  const items = parseSseText(chunk({ role: 'assistant', content: '' }) + chunk({}) + chunk({ content: 5 }))
  assert.deepEqual(items, [])
})

test('tolerates CRLF line endings, including a CR/LF pair split across chunks', () => {
  const body = STREAM.replace(/\n/g, '\r\n')
  assert.deepEqual(parseSseText(body), parseSseText(STREAM))
  const cut = body.indexOf('\r\n') + 1 // between \r and \n
  const p = createSseParser()
  const items = [...p.push(body.slice(0, cut)), ...p.push(body.slice(cut)), ...p.flush()]
  assert.deepEqual(items, parseSseText(STREAM))
})

test('accepts "data:" without a space, ignores comments and other fields', () => {
  const json = JSON.stringify({ choices: [{ delta: { content: 'ok' } }] })
  const items = parseSseText(`: keep-alive\n\nevent: message\nid: 7\ndata:${json}\n\n`)
  assert.deepEqual(items, [{ type: 'content', text: 'ok' }])
})

test('reports invalid JSON as an invalid item and keeps going', () => {
  const items = parseSseText('data: {not json\n\n' + chunk({ content: 'after' }))
  assert.deepEqual(items, [{ type: 'invalid', data: '{not json' }, { type: 'content', text: 'after' }])
})

test('flush dispatches a final event missing its blank line', () => {
  const p = createSseParser()
  const body = chunk({ content: 'tail' }).trimEnd()
  assert.deepEqual(p.push(body), [])
  assert.deepEqual(p.flush(), [{ type: 'content', text: 'tail' }])
})

test('non-string and empty input is ignored', () => {
  const p = createSseParser()
  assert.deepEqual(p.push(''), [])
  assert.deepEqual(p.push(undefined), [])
  assert.deepEqual(p.push(null), [])
  assert.deepEqual(p.flush(), [])
})

test('formats outgoing events as "data: {...}\\n\\n"', () => {
  assert.equal(formatSseEvent({ delta: 'hi' }), 'data: {"delta":"hi"}\n\n')
  assert.equal(formatSseEvent({ text: 'a\nb' }), 'data: {"text":"a\\nb"}\n\n')
  assert.equal(formatSseDone(), 'data: [DONE]\n\n')
  assert.equal(SSE_DONE, 'data: [DONE]\n\n')
})

test('formatted events round-trip through the parser', () => {
  const body = formatSseEvent({ choices: [{ delta: { content: 'round' } }] }) + formatSseDone()
  assert.deepEqual(parseSseText(body), [{ type: 'content', text: 'round' }, { type: 'done' }])
})
