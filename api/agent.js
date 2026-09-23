import { createClient } from '@supabase/supabase-js'

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'
const DEFAULT_MODEL = 'openai/gpt-oss-120b'

// This proxy spends the owner's Groq quota, so it's gated to the owner's own
// Supabase account rather than left open to anyone who finds the deploy URL.
async function authorize(req) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY
  const ownerUserId = process.env.OWNER_USER_ID
  if (!token || !supabaseUrl || !supabaseAnonKey || !ownerUserId) return false
  const supabase = createClient(supabaseUrl, supabaseAnonKey)
  const { data, error } = await supabase.auth.getUser(token)
  return !error && data.user?.id === ownerUserId
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })

  if (!(await authorize(req))) {
    return res.status(403).json({ error: 'Not authorized' })
  }

  const key = process.env.GROQ_API_KEY
  if (!key) {
    return res.status(500).json({ error: 'Agent is not configured' })
  }

  const { systemPrompt, messages } = req.body || {}
  if (typeof systemPrompt !== 'string' || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'systemPrompt (string) and messages (array) are required' })
  }

  try {
    const r = await fetch(GROQ_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: process.env.GROQ_MODEL || DEFAULT_MODEL,
        messages: [{ role: 'system', content: systemPrompt }, ...messages],
      }),
    })
    const j = await r.json()
    if (!r.ok) throw new Error(`Groq responded ${r.status}`)
    res.status(200).json({ reply: j.choices[0].message.content })
  } catch (e) {
    console.error('agent handler error', e)
    res.status(502).json({ error: 'Could not reach the agent service' })
  }
}
