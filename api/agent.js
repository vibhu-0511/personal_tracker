const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'
const DEFAULT_MODEL = 'openai/gpt-oss-120b'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })
  const key = process.env.GROQ_API_KEY
  if (!key) {
    return res.status(500).json({ error: 'agent not configured: GROQ_API_KEY is missing' })
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
    if (!r.ok) throw new Error(j?.error?.message || `Groq responded ${r.status}`)
    res.status(200).json({ reply: j.choices[0].message.content })
  } catch (e) {
    res.status(502).json({ error: String((e && e.message) || e) })
  }
}
