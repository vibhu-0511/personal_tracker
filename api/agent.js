import { applyCors, handlePreflight, readJsonBody, HttpError } from './_lib/http.js'
import { isOwner } from './_lib/auth.js'
import { validateAgentInput } from './_lib/agentInput.js'

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'
const DEFAULT_MODEL = 'openai/gpt-oss-120b'

// Cap on the completion so a runaway prompt cannot drain the Groq quota, and a
// hard deadline on the upstream call so a hung connection cannot hold the function.
export const MAX_TOKENS = 1024
export const UPSTREAM_TIMEOUT_MS = 20_000
// Room for the largest body agentInput accepts (40 x 8000 chars + prompt, multibyte).
export const BODY_LIMIT_BYTES = 512 * 1024

function send(res, status, payload) {
  return res.status(status).json(payload)
}

// Factory so tests can inject the verifier, fetch and env; the default export wires
// the real ones. This proxy spends the owner's Groq quota, so it is gated to the
// owner's Supabase account (see _lib/auth.js, fail-closed).
export function createAgentHandler({ fetchImpl, verifier, env } = {}) {
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

    try {
      const r = await doFetch(GROQ_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model: e.GROQ_MODEL || DEFAULT_MODEL,
          max_tokens: MAX_TOKENS,
          messages: [{ role: 'system', content: systemPrompt }, ...messages],
        }),
        signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      })
      if (!r.ok) throw new Error(`Groq responded ${r.status}`)
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
