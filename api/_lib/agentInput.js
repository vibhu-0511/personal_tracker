// Validation and limits for the /api/agent request body. Pure: no I/O.

export const MAX_MESSAGES = 40
export const MAX_MESSAGE_CHARS = 8000
export const MAX_SYSTEM_PROMPT_CHARS = 4000
export const ALLOWED_ROLES = ['user', 'assistant']

// Returns { ok: true, value: { systemPrompt, messages } } with only the known
// fields copied (extra keys on messages are dropped), or { ok: false, error }.
export function validateAgentInput(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, error: 'Request body must be a JSON object' }
  }
  const { systemPrompt, messages } = body
  if (typeof systemPrompt !== 'string') {
    return { ok: false, error: 'systemPrompt (string) is required' }
  }
  if (systemPrompt.length > MAX_SYSTEM_PROMPT_CHARS) {
    return { ok: false, error: `systemPrompt must be at most ${MAX_SYSTEM_PROMPT_CHARS} characters` }
  }
  if (!Array.isArray(messages)) {
    return { ok: false, error: 'messages (array) is required' }
  }
  if (messages.length > MAX_MESSAGES) {
    return { ok: false, error: `messages must have at most ${MAX_MESSAGES} entries` }
  }
  const clean = []
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i]
    if (!m || typeof m !== 'object' || Array.isArray(m)) {
      return { ok: false, error: `messages[${i}] must be an object` }
    }
    if (!ALLOWED_ROLES.includes(m.role)) {
      return { ok: false, error: `messages[${i}].role must be "user" or "assistant"` }
    }
    if (typeof m.content !== 'string' || m.content.trim() === '') {
      return { ok: false, error: `messages[${i}].content must be a non-empty string` }
    }
    if (m.content.length > MAX_MESSAGE_CHARS) {
      return { ok: false, error: `messages[${i}].content must be at most ${MAX_MESSAGE_CHARS} characters` }
    }
    clean.push({ role: m.role, content: m.content })
  }
  return { ok: true, value: { systemPrompt, messages: clean } }
}
