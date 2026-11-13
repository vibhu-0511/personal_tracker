// Data source for the standalone Artifact build of Forge Live (iPad / any browser, no local server).
// Reads this session's transcript through the "Claude Code Remote" connector (list_events) and
// turns it into the same events the hook engine produces. Inlined into the page by build.mjs,
// so it shares scope with the UI (ingest, applyBuild, normalize, plan, setConn ...).
const CCR = { server: 'Claude Code Remote', session: '@@SESSION@@', branch: '@@BRANCH@@' }
const POLL_MS = 5000
const seenRec = new Set(), useName = new Map(), agentTask = new Map()
let baseTasks = {}, overlay = {}
const planIds = new Set(plan.tasks.map(t => t.id))
const RANK = { queued: 0, yours: 0, running: 1, committed: 2, failed: 2, merged: 3 }

function textOf(c) {
  if (typeof c === 'string') return c
  if (Array.isArray(c)) return c.map(b => (b && (b.text || (typeof b.content === 'string' ? b.content : ''))) || '').join('\n')
  return ''
}

// one list_events record -> normalized events
function eventsFrom(rec) {
  const body = rec.assistant || rec.user
  if (!body) return []
  const cc = body.internal_anthropic_catchall || {}
  const msg = cc.message || {}
  const ts = Date.parse(cc.timestamp || rec.created_at) || Date.now()
  const common = { session_id: 'ccr', agent_id: cc.agent_id || null, agent_label: cc.task_description || cc.subagent_type || null, parent_tool_use_id: cc.parent_tool_use_id || null }
  const out = [], content = msg.content
  if (rec.assistant && Array.isArray(content)) {
    for (const b of content) {
      if (b.type === 'tool_use') {
        useName.set(b.id, b.name)
        out.push(normalize({ ...common, hook_event_name: 'PreToolUse', tool_name: b.name, tool_input: b.input, tool_use_id: b.id }, ts))
      } else if (b.type === 'text' && b.text && b.text.trim()) {
        out.push(normalize({ ...common, kind: 'transcript', hook_event_name: 'AssistantText', text: b.text.slice(0, 1500) }, ts))
      }
    }
  }
  if (rec.user) {
    if (typeof content === 'string') {
      if (!/^\s*<(task-notification|system-reminder)/.test(content)) out.push(normalize({ ...common, hook_event_name: 'UserPromptSubmit', prompt: content }, ts))
    } else if (Array.isArray(content)) {
      for (const b of content) {
        if (b.type !== 'tool_result') continue
        const t = textOf(b.content)
        out.push(normalize({ ...common, hook_event_name: b.is_error ? 'PostToolUseFailure' : 'PostToolUse', tool_name: useName.get(b.tool_use_id) || 'tool', tool_use_id: b.tool_use_id,
          tool_response: b.is_error ? { error: t || 'error' } : { stdout: t } }, ts))
      }
    }
  }
  return out
}

// plan task status from what the orchestrator does: Agent calls named after a task, and the merge gate's output
function overlayFrom(ev) {
  const bump = (id, s) => { if (planIds.has(id) && (RANK[s] ?? 0) >= (RANK[overlay[id]] ?? 0)) overlay[id] = s }
  if (ev.event === 'PreToolUse' && ev.tool === 'Agent') {
    const id = String((ev.input && ev.input.description) || '').split(/\s+/)[0]
    if (planIds.has(id)) { agentTask.set(ev.toolUseId, id); bump(id, 'running') }
  } else if (ev.event === 'PostToolUse' && agentTask.has(ev.toolUseId)) {
    bump(agentTask.get(ev.toolUseId), 'committed')
  } else if (ev.event === 'PostToolUse' && ev.tool === 'Bash') {
    for (const m of (ev.output || '').matchAll(/^MERGED (\S+?):/gm)) bump(m[1], 'merged')
    for (const m of (ev.output || '').matchAll(/^FAIL (\S+?):/gm)) overlay[m[1]] = 'failed'
  }
}
function pushBuild() {
  const tasks = {}
  for (const t of plan.tasks) {
    const base = baseTasks[t.id] && baseTasks[t.id].s, o = overlay[t.id]
    const s = base === 'merged' ? 'merged' : (o || base || (t.o === 'user' ? 'yours' : 'queued'))
    tasks[t.id] = { s, branch: (baseTasks[t.id] && baseTasks[t.id].branch) || '', sha: (baseTasks[t.id] && baseTasks[t.id].sha) || '', note: (baseTasks[t.id] && baseTasks[t.id].note) || '' }
  }
  applyBuild({ tasks, repo: { head: { branch: CCR.branch, sha: 'remote', subject: '' }, dirty: 0 } })
}

const ERR = {
  not_in_manifest: 'Allow the Claude Code Remote connector for this page to see live events.',
  approval_required: 'Allow the Claude Code Remote connector for this page to see live events.',
  server_not_connected: 'Claude Code Remote connector is not connected in this app.',
  needs_reauth: 'Reconnect Claude Code Remote in Settings, Connectors.',
  blocked_by_policy: 'Your organization blocks the session-events tool.',
  selection_required: 'Choose a Claude Code Remote connector when asked.',
}
let stopped = false
async function poll(mcp, first) {
  const call = input => mcp.callTool(CCR.server, 'list_events', { session_id: CCR.session, kinds: ['assistant', 'user'], limit: 100, ...input }, { cache: false })
  const bodyOf = r => { const p = (r && r.payload) || {}; return p.ccr || p }
  let res = await call({}), body = bodyOf(res), pages = [body.data || []]
  if (first) {
    for (let i = 0; i < 3 && body.has_more && body.first_id; i++) {
      res = await call({ before_id: body.first_id }); body = bodyOf(res); pages.unshift(body.data || [])
    }
  }
  let n = 0
  for (const rec of pages.flat()) {
    const id = (rec.assistant || rec.user || {}).uuid
    if (!id || seenRec.has(id)) continue
    seenRec.add(id)
    for (const ev of eventsFrom(rec)) { overlayFrom(ev); ingest(ev); n++ }
  }
  pushBuild()
  setConn('on', 'live · synced ' + new Date().toTimeString().slice(0, 8))
  return n
}

async function startCcr() {
  setConn('wait', 'connecting…')
  const hide = $('demo'); if (hide) hide.hidden = true
  let mcp = null
  try { mcp = window.claude && await window.claude.use('mcp') } catch (e) {}
  // optional base statuses written by the orchestrator between waves
  try {
    const db = window.claude && await window.claude.use('db')
    if (db) db.doc('state/progress').onSnapshot(s => { if (s.exists) { baseTasks = (s.data() || {}).tasks || {}; pushBuild() } }, () => {})
  } catch (e) {}
  if (!mcp) { setConn('wait', 'open this page in the Claude app to see live events'); pushBuild(); return }
  let first = true
  const loop = async () => {
    if (stopped) return
    if (document.hidden) { setTimeout(loop, 1500); return }
    let delay = POLL_MS
    try { await poll(mcp, first); first = false }
    catch (e) {
      const code = (e && e.code) || 'upstream_error'
      setConn('wait', ERR[code] || `connector error (${code})`)
      if (['not_in_manifest', 'approval_required', 'server_not_connected', 'needs_reauth', 'blocked_by_policy', 'not_granted', 'capability_disabled'].includes(code)) delay = 20000
      else delay = Math.max(delay, (e && e.retryAfterMs) || 8000)
    }
    setTimeout(loop, delay)
  }
  loop()
}
