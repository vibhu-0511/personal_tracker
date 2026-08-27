import { useState } from 'react'
import agents from '../agents.json'

export default function Agents() {
  const [agent, setAgent] = useState(agents[0])
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  function switchAgent(id) {
    setAgent(agents.find((a) => a.id === id))
    setMessages([])
    setError('')
  }

  async function send() {
    const text = input.trim()
    if (!text || busy) return
    const next = [...messages, { role: 'user', content: text }]
    setMessages(next)
    setInput('')
    setBusy(true)
    setError('')
    try {
      const r = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ systemPrompt: agent.systemPrompt, messages: next }),
      })
      const j = await r.json()
      if (j.error) setError(j.error)
      else setMessages([...next, { role: 'assistant', content: j.reply }])
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <div className="card">
        <select value={agent.id} onChange={(e) => switchAgent(e.target.value)}>
          {agents.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
      </div>

      {messages.map((m, i) => (
        <div className="card" key={i}>
          <div className="muted">{m.role === 'user' ? 'You' : agent.name}</div>
          <div style={{ whiteSpace: 'pre-wrap' }}>{m.content}</div>
        </div>
      ))}

      {busy && <div className="card muted">Thinking…</div>}
      {error && <div className="card err">{error}</div>}

      <div className="card">
        <textarea
          rows={3}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={`Ask ${agent.name}…`}
        />
        <button className="act" style={{ marginTop: 8 }} onClick={send} disabled={busy}>
          Send
        </button>
      </div>
    </div>
  )
}
