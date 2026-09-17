import { useState, useRef, useEffect } from 'react'
import agents from '../agents.json'
import { supabase } from '../supabaseClient.js'

const AGENT_ICONS = { explain: '💡', debug: '🐛', quiz: '🎯' }

// Module-scope, not component state, so the conversation survives a tab
// switch (Agents unmounts on every tab change) without needing full
// cross-session persistence — lost only on a page reload.
let savedAgentId = agents[0].id
let savedMessages = []

export default function Agents() {
  const [agent, setAgent] = useState(agents.find((a) => a.id === savedAgentId) || agents[0])
  const [messages, setMessages] = useState(savedMessages)
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const bottomRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, busy])

  useEffect(() => {
    savedAgentId = agent.id
    savedMessages = messages
  }, [agent, messages])

  function switchAgent(id) {
    setAgent(agents.find((a) => a.id === id))
    setMessages([])
    setError('')
  }

  async function sendMessages(next) {
    setBusy(true)
    setError('')
    try {
      const { data } = await supabase.auth.getSession()
      const token = data.session?.access_token
      const r = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
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

  async function send() {
    const text = input.trim()
    if (!text || busy) return
    const next = [...messages, { role: 'user', content: text }]
    setMessages(next)
    setInput('')
    await sendMessages(next)
  }

  function retry() {
    if (busy) return
    sendMessages(messages)
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  return (
    <div className="fade-in">
      {/* Agent selector pills */}
      <div className="agent-bar">
        {agents.map((a) => (
          <button
            key={a.id}
            className={`agent-pill${a.id === agent.id ? ' active' : ''}`}
            onClick={() => switchAgent(a.id)}
          >
            <span className="agent-pill-icon">{AGENT_ICONS[a.id] || '💡'}</span>
            {a.name}
          </button>
        ))}
      </div>

      {/* Chat messages */}
      {messages.length === 0 && !busy && (
        <div className="empty-state" style={{ padding: '48px 16px' }}>
          <div className="empty-icon">{AGENT_ICONS[agent.id] || '💡'}</div>
          <div className="empty-text">
            Ask {agent.name} anything.<br />
            <span className="meta">Powered by Groq LLM</span>
          </div>
        </div>
      )}

      <div className="chat-messages">
        {messages.map((m, i) => (
          <div className={`chat-bubble ${m.role}`} key={i}>
            {m.content}
          </div>
        ))}
        {busy && (
          <div className="chat-bubble assistant">
            <div className="loading" style={{ padding: 0 }}>
              <span className="loading-dot" /><span className="loading-dot" /><span className="loading-dot" />
            </div>
          </div>
        )}
        {error && (
          <div className="banner-warn" style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ flex: 1 }}>{error}</span>
            <button className="btn btn-ghost btn-sm" onClick={retry} disabled={busy}>Retry</button>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="chat-input-row">
        <textarea
          rows={1}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={`Ask ${agent.name}...`}
        />
        <button className="send-btn" onClick={send} disabled={busy || !input.trim()}>
          ↑
        </button>
      </div>
    </div>
  )
}
