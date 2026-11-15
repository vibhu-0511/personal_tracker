import { applyCors, handlePreflight, readJsonBody, HttpError } from './_lib/http.js'
import { isOwner } from './_lib/auth.js'
import { validateAgentInput } from './_lib/agentInput.js'
import { checkRateLimit, supabaseUsageStorage } from './_lib/rateLimit.js'
import { createSseParser, formatSseEvent } from './_lib/sse.js'

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'
const DEFAULT_MODEL = 'openai/gpt-oss-120b'

// Cap on the completion so a runaway prompt cannot drain the Groq quota, and a
// hard deadline on the upstream call so a hung connection cannot hold the function.
export const MAX_TOKENS = 1024
export const UPSTREAM_TIMEOUT_MS = 20_000
// Room for the largest body agentInput accepts (40 x 8000 chars + prompt, multibyte).
export const BODY_LIMIT_BYTES = 512 * 1024

// Per-user limits, overridable with AGENT_RATE_PER_MIN / AGENT_RATE_PER_DAY
// (positive integers; anything else falls back to these defaults).
export const DEFAULT_RATE_PER_MIN = 20
export const DEFAULT_RATE_PER_DAY = 300

function send(res, status, payload) {
  return res.status(status).json(payload)
}

const STREAM_ERROR_MESSAGE = 'Could not reach the agent service'

// Streaming mode (opt-in per request with `stream: true` in the JSON body; any
// other value, or no field, keeps the whole-response JSON behaviour). Only called
// after the upstream answered 2xx, so every failure before the first byte still
// goes through the normal 502 JSON path in the handler.
//
// Wire format, one SSE data frame each (api/_lib/sse.js formatSseEvent):
//   { type: 'delta', text }   an incremental piece of the reply
//   { type: 'done', reply }   final event, carries the full reply text
//   { type: 'error', error }  the stream failed after it had started
// Aborts the upstream request (via `controller`) when the client disconnects or the
// upstream goes idle for UPSTREAM_TIMEOUT_MS.
async function streamReply(r, res, controller, clientGone) {
  if (!r.body) throw new Error('Groq returned no stream body')
  res.statusCode = 200
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  if (typeof res.flushHeaders === 'function') res.flushHeaders()

  const parser = createSseParser()
  const decoder = new TextDecoder()
  let reply = ''
  let finished = false
  let idle = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS)

  const handle = (items) => {
    for (const item of items) {
      if (item.type === 'content') {
        reply += item.text
        res.write(formatSseEvent({ type: 'delta', text: item.text }))
      } else if (item.type === 'done') {
        finished = true
      }
    }
  }

  try {
    for await (const chunk of r.body) {
      if (clientGone()) return
      clearTimeout(idle)
      idle = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS)
      handle(parser.push(typeof chunk === 'string' ? chunk : decoder.decode(chunk, { stream: true })))
      if (finished) break
    }
    if (clientGone()) return
    if (!finished) handle(parser.flush())
    // Same guard as the JSON path: never finish with an empty reply.
    if (reply.trim() === '') throw new Error('Groq returned no reply content')
    res.write(formatSseEvent({ type: 'done', reply }))
  } catch (err) {
    if (clientGone()) return
    console.error('agent stream error', err)
    res.write(formatSseEvent({ type: 'error', error: STREAM_ERROR_MESSAGE }))
  } finally {
    clearTimeout(idle)
    if (!clientGone()) res.end()
  }
}

export function parseLimit(raw, fallback) {
  const s = String(raw ?? '').trim()
  if (!/^\d+$/.test(s)) return fallback
  const n = Number(s)
  return Number.isSafeInteger(n) && n >= 1 ? n : fallback
}

// Default usage storage: Supabase client built with the caller's own JWT so RLS on
// public.agent_usage applies (docs/sql/agent_usage.sql). Returns null when the
// project is not configured, which makes the limiter fail open.
async function defaultUsageStorage(req, e) {
  const url = e.VITE_SUPABASE_URL
  const anonKey = e.VITE_SUPABASE_ANON_KEY
  const authorization = req?.headers?.authorization
  if (!url || !anonKey || typeof authorization !== 'string') return null
  const { createClient } = await import('@supabase/supabase-js')
  const supabase = createClient(url, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return supabaseUsageStorage(supabase)
}

// Factory so tests can inject the verifier, fetch and env; the default export wires
// the real ones. This proxy spends the owner's Groq quota, so it is gated to the
// owner's Supabase account (see _lib/auth.js, fail-closed).
// `usageStorage` (optional) is a rate-limit storage adapter, or a function
// (req, env) => adapter, so tests never touch Supabase.
export function createAgentHandler({ fetchImpl, verifier, env, usageStorage } = {}) {
  return async function handler(req, res) {
    const e = env || process.env
    const doFetch = fetchImpl || globalThis.fetch

    if (handlePreflight(req, res, e)) return
    applyCors(req, res, e)

    if (req.method !== 'POST') return send(res, 405, { error: 'POST only' })

    if (!(await isOwner(req, { env: e, verifier }))) {
      return send(res, 403, { error: 'Not authorized' })
    }

    const key = e.GROQ_API_KEY
    if (!key) return send(res, 500, { error: 'Agent is not configured' })

    // The owner gate above has already matched the caller to OWNER_USER_ID, so that
    // id is the rate-limit subject. FAIL OPEN: if the usage table is unreachable or
    // misconfigured, log and let the call through so the owner is never locked out.
    try {
      const storage =
        typeof usageStorage === 'function' ? await usageStorage(req, e) : usageStorage || (await defaultUsageStorage(req, e))
      if (!storage) {
        console.error('agent rate limit skipped: usage storage is not configured')
      } else {
        const limit = await checkRateLimit({
          storage,
          userId: e.OWNER_USER_ID,
          perMinute: parseLimit(e.AGENT_RATE_PER_MIN, DEFAULT_RATE_PER_MIN),
          perDay: parseLimit(e.AGENT_RATE_PER_DAY, DEFAULT_RATE_PER_DAY),
        })
        if (!limit.allowed) {
          res.setHeader('Retry-After', String(limit.retryAfterSec))
          return send(res, 429, { error: 'Too many requests, try again later' })
        }
      }
    } catch (err) {
      console.error('agent rate limit check failed, allowing the call', err)
    }

    let body
    try {
      body = await readJsonBody(req, { limit: BODY_LIMIT_BYTES })
    } catch (err) {
      if (err instanceof HttpError) return send(res, err.status, { error: err.message })
      throw err
    }

    const parsed = validateAgentInput(body)
    if (!parsed.ok) return send(res, 400, { error: parsed.error })
    const { systemPrompt, messages } = parsed.value

    const wantStream = body.stream === true
    // Streaming only: abort the upstream request if the client goes away.
    const controller = wantStream ? new AbortController() : null
    let gone = false
    if (wantStream && typeof res.on === 'function') {
      res.on('close', () => {
        if (res.writableEnded) return
        gone = true
        controller.abort()
      })
    }

    try {
      const r = await doFetch(GROQ_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model: e.GROQ_MODEL || DEFAULT_MODEL,
          max_tokens: MAX_TOKENS,
          messages: [{ role: 'system', content: systemPrompt }, ...messages],
          ...(wantStream ? { stream: true } : {}),
        }),
        signal: wantStream
          ? AbortSignal.any([controller.signal, AbortSignal.timeout(UPSTREAM_TIMEOUT_MS)])
          : AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      })
      if (!r.ok) throw new Error(`Groq responded ${r.status}`)
      if (wantStream) return await streamReply(r, res, controller, () => gone)
      const j = await r.json()
      // Reasoning models can return content: null when truncated; never pass that on
      // (the client would store it in history and every later turn would fail).
      const reply = j?.choices?.[0]?.message?.content
      if (typeof reply !== 'string' || reply.trim() === '') {
        throw new Error('Groq returned no reply content')
      }
      return send(res, 200, { reply })
    } catch (err) {
      console.error('agent handler error', err)
      return send(res, 502, { error: 'Could not reach the agent service' })
    }
  }
}

export default createAgentHandler()
