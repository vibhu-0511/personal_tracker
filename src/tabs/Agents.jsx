import { useState, useRef, useEffect } from 'react'
import agents from '../agents.json'
import { apiFetch } from '../api/client.js'
import { streamAgentReply } from '../agents/stream.js'
import SubNav from '../ui/SubNav.jsx'

const AGENT_ICONS = {
  explain: '💡',
  debug: '🐛',
  quiz: '🎯',
  mathematics: '🔢',
  philosophy: '🧠',
  strategy: '♟️',
  'history-of-ideas': '📜',
  'pattern-recognition': '🔍',
}

const topicAgents = agents.filter((a) => a.kind === 'topic')
const toolAgents = agents.filter((a) => a.kind !== 'topic')
const agentById = (id) => agents.find((a) => a.id === id)

// Module-scope, not component state, so the conversation survives a tab
// switch (Agents unmounts on every tab change) without needing full
// cross-session persistence — lost only on a page reload.
let savedAgentId = (topicAgents[0] || agents[0]).id
let savedMessages = []

// `?q=` prefill (the Today tutor tile links to /agents?q=...). The hash router
// keeps the query after the hash path ('#/agents?q=hello'); a plain
// location.search is honoured too. Prefill only: it is never auto-sent.
function readPrefill() {
  const w = globalThis.window
  if (!w) return ''
  try {
    const hash = w.location.hash || ''
    const i = hash.indexOf('?')
    const fromHash = i >= 0 ? new URLSearchParams(hash.slice(i + 1)).get('q') : null
    return fromHash ?? new URLSearchParams(w.location.search || '').get('q') ?? ''
  } catch {
    return ''
  }
}

// Streaming is opt-in: the client sends `stream: true` only when the build sets
// VITE_AGENT_STREAM=1. Off (the default) keeps the whole-response JSON path.
const streamEnabled = () => {
  try {
    return import.meta.env?.VITE_AGENT_STREAM === '1'
  } catch {
    return false
  }
}

const GENERIC_ERROR = "Couldn't reach the agent. Check your connection and try again."

// Server-supplied messages (HTTP status errors) are shown; anything else
// (network failure, parse error, runtime text) gets a fixed friendly line
// rather than a raw e.message.
const errorText = (e) => (e && e.status && typeof e.message === 'string' && e.message ? e.message : GENERIC_ERROR)

// Statuses where the non-streaming path would fail the same way, so a fallback
// would only double the request.
const NO_FALLBACK_STATUS = new Set([401, 403, 429])

// The wide layout (chat + agent list pane) is chosen by the container's own
// width, so it holds in tab, rail and sidebar shell modes alike.
const CSS = `
.agents-screen { container-type: inline-size; container-name: agents; }
.agents-layout { display: block; }
.agents-list { display: none; }
.agents-narrow-nav { display: flex; gap: 6px; align-items: flex-start; }
.agents-narrow-nav .ui-subnav { flex: 1; min-width: 0; }
.agents-chat { min-width: 0; }
.agents-chat .chat-bubble { max-width: min(85%, 72ch); }
@container agents (min-width: 720px) {
  .agents-layout { display: grid; grid-template-columns: minmax(0, 1fr) 260px; gap: 16px; align-items: start; }
  .agents-narrow-nav { display: none; }
  .agents-list { display: block; position: sticky; top: 0; order: 2; }
  .agents-chat { order: 1; }
  .agents-chat .chat-messages { overflow-y: auto; max-height: calc(100dvh - 240px); min-height: 240px; }
}
.agents-stop-btn { height: 42px; min-width: 44px; padding: 0 14px; border-radius: 21px; border: 1px solid var(--border-light, var(--border)); background: var(--surface); color: var(--text-primary, inherit); font: inherit; font-size: 13px; font-weight: 700; cursor: pointer; flex-shrink: 0; }
.agents-stop-btn:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.agents-list-heading { font-size: 11px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: var(--text-secondary); margin: 0 0 6px 4px; }
.agents-list-group { margin: 0 0 12px; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 4px; }
.agents-list-item { display: flex; align-items: center; gap: 10px; width: 100%; min-height: 44px; padding: 8px 12px; border-radius: 12px; cursor: pointer; font: inherit; font-size: 13px; font-weight: 600; text-align: left; border: 1px solid var(--border); background: var(--surface); color: var(--text-secondary); }
@media (hover: hover) and (pointer: fine) { .agents-list-item:hover { border-color: var(--border-light); } }
.agents-list-item[aria-current] { background: var(--accent-dim); border-color: var(--accent); color: var(--accent); }
.agents-list-item:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
`

export default function Agents() {
  const [agent, setAgent] = useState(() => agentById(savedAgentId) || topicAgents[0] || agents[0])
  const [messages, setMessages] = useState(() => savedMessages)
  const [input, setInput] = useState(readPrefill)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [streamText, setStreamText] = useState('')
  const [streaming, setStreaming] = useState(false) // a streamed request is in flight
  const abortRef = useRef(null)
  const runRef = useRef(0)
  const bottomRef = useRef(null)
  const inputRef = useRef(null)

  // Re-apply the prefill if the hash changes while the screen is open.
  useEffect(() => {
    const w = globalThis.window
    if (!w) return undefined
    const onHash = () => {
      const q = readPrefill()
      if (q) setInput(q)
    }
    w.addEventListener('hashchange', onHash)
    return () => w.removeEventListener('hashchange', onHash)
  }, [])

  // A prefilled composer gets focus (caret at the end) but is never submitted.
  useEffect(() => {
    const el = inputRef.current
    if (el && el.value) {
      el.focus()
      el.setSelectionRange(el.value.length, el.value.length)
    }
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [messages, busy, streamText])

  useEffect(() => {
    savedAgentId = agent.id
    savedMessages = messages
  }, [agent, messages])

  // Leaving the screen stops an in-flight stream; the partial reply is kept in
  // the module-scope conversation.
  useEffect(() => () => abortRef.current?.abort(), [])

  function switchAgent(id) {
    const next = agentById(id)
    if (!next) return
    runRef.current += 1 // discard any in-flight reply for the old agent
    abortRef.current?.abort()
    setBusy(false)
    setStreaming(false)
    setStreamText('')
    setAgent(next)
    setMessages([])
    setError('')
  }

  async function sendPlain(next) {
    const r = await apiFetch('/api/agent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ systemPrompt: agent.systemPrompt, messages: next }),
    })
    return r.json()
  }

  async function sendMessages(next) {
    const run = ++runRef.current
    const live = () => runRef.current === run
    setBusy(true)
    setError('')
    setStreamText('')
    try {
      if (!streamEnabled()) {
        const j = await sendPlain(next)
        if (!live()) return
        if (j.error) setError(j.error)
        else setMessages([...next, { role: 'assistant', content: j.reply }])
        return
      }

      const ctrl = new AbortController()
      abortRef.current = ctrl
      setStreaming(true)
      let result
      let failure = null
      let partial = ''
      try {
        result = await streamAgentReply({
          fetchFn: apiFetch,
          body: { systemPrompt: agent.systemPrompt, messages: next },
          signal: ctrl.signal,
          onDelta: (_d, full) => {
            partial = full
            if (live()) setStreamText(full)
          },
        })
      } catch (e) {
        failure = e
      }

      if (failure) {
        if (partial) {
          // Failed mid-reply: keep what arrived, surface the error.
          if (live()) {
            commit([...next, { role: 'assistant', content: partial }])
            setError(errorText(failure))
          }
          return
        }
        if (ctrl.signal.aborted || NO_FALLBACK_STATUS.has(failure.status)) {
          if (live()) setError(errorText(failure))
          return
        }
        // Failed before any text: retry once on the non-streaming path.
        setStreaming(false)
        const j = await sendPlain(next)
        if (!live()) return
        if (j.error) setError(j.error)
        else setMessages([...next, { role: 'assistant', content: j.reply }])
        return
      }

      // Plain JSON served for a stream request, or a finished/stopped stream.
      const text = result.reply
      if (text) commit([...next, { role: 'assistant', content: text }])
      else if (!result.aborted && live()) setError(GENERIC_ERROR)
    } catch (e) {
      if (live()) setError(errorText(e))
    } finally {
      if (live()) {
        setBusy(false)
        setStreaming(false)
        setStreamText('')
        abortRef.current = null
      }
    }
  }

  // Writes the finished conversation. After unmount (tab switch mid-stream) the
  // component state is gone, so the module-scope copy is updated directly.
  function commit(nextMessages) {
    savedMessages = nextMessages
    setMessages(nextMessages)
  }

  function stop() {
    abortRef.current?.abort()
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
    // A reply cut short by an error stays visible; resend from the last user turn.
    let end = messages.length
    while (end > 0 && messages[end - 1].role !== 'user') end -= 1
    const base = messages.slice(0, end)
    if (base.length !== messages.length) setMessages(base)
    sendMessages(base)
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  const isToolActive = toolAgents.some((a) => a.id === agent.id)

  return (
    <div className="fade-in agents-screen">
      <style>{CSS}</style>
      <div className="agents-layout">
        {/* Narrow: topic pills plus a tools select */}
        <div className="agents-narrow-nav">
          <SubNav
            label="Agents"
            items={topicAgents.map((a) => ({ id: a.id, label: a.name, icon: AGENT_ICONS[a.id] || '💡' }))}
            value={isToolActive ? '' : agent.id}
            onChange={switchAgent}
          />
          <select
            className={`agent-more-select${isToolActive ? ' active' : ''}`}
            aria-label="More tools"
            value={isToolActive ? agent.id : ''}
            onChange={(e) => e.target.value && switchAgent(e.target.value)}
          >
            <option value="" disabled>More tools ▾</option>
            {toolAgents.map((a) => (
              <option key={a.id} value={a.id}>
                {AGENT_ICONS[a.id] || '💡'} {a.name}
              </option>
            ))}
          </select>
        </div>

        {/* Wide: agent list pane beside the chat */}
        <aside className="agents-list" aria-label="Agent list">
          {[['Topics', topicAgents], ['Tools', toolAgents]].map(([title, list]) => (
            <section key={title}>
              <h2 className="agents-list-heading">{title}</h2>
              <ul className="agents-list-group">
                {list.map((a) => (
                  <li key={a.id}>
                    <button
                      type="button"
                      className="agents-list-item"
                      aria-current={a.id === agent.id ? 'true' : undefined}
                      onClick={() => switchAgent(a.id)}
                    >
                      <span aria-hidden="true">{AGENT_ICONS[a.id] || '💡'}</span>
                      <span>{a.name}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </aside>

        <div className="agents-chat">
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
            {streaming && streamText && (
              <div className="chat-bubble assistant" aria-live="polite">
                {streamText}
              </div>
            )}
            {busy && !streamText && (
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
              ref={inputRef}
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={`Ask ${agent.name}...`}
            />
            {streaming ? (
              <button type="button" className="agents-stop-btn" onClick={stop} aria-label="Stop generating">
                Stop
              </button>
            ) : (
              <button className="send-btn" onClick={send} disabled={busy || !input.trim()} aria-label="Send">
                ↑
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
