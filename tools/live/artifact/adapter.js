// Data source for the standalone Artifact build of Forge Live (iPad / any browser, no local server).
// Two sources, same event pipeline as the live server:
//   1. db doc live/feed  - recent events + task status, written from the session's transcript files
//      and git by tools/live/feed.mjs (works everywhere the artifact opens).
//   2. connector "Claude Code Remote" list_events - true live polling, used only if the page declares
//      the connector and the viewer's app can load it.
// Inlined into the page by build.mjs, so it shares scope with the UI (ingest, applyBuild, normalize ...).
const CCR = { server: 'Claude Code Remote', session: '@@SESSION@@', branch: '@@BRANCH@@' }
const POLL_MS = 5000
const seenRec = new Set(), seenFeed = new Set(), useName = new Map(), agentTask = new Map()
let baseTasks = {}, overlay = {}, repoHead = { branch: CCR.branch, sha: 'remote', subject: '' }, mcpOk = false
const planIds = new Set(plan.tasks.map(t => t.id))
const RANK = { queued: 0, yours: 0, running: 1, committed: 2, failed: 2, merged: 3 }
const hhmm = t => new Date(t).toTimeString().slice(0, 8)

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
    const b = baseTasks[t.id] || {}, o = overlay[t.id]
    const s = b.s === 'merged' ? 'merged' : (o || b.s || (t.o === 'user' ? 'yours' : 'queued'))
    tasks[t.id] = { s, branch: b.branch || '', sha: b.sha || '', note: b.note || '' }
  }
  applyBuild({ tasks, repo: { head: repoHead, dirty: 0 } })
}

/* ---- source 1: db snapshot feed ---- */
function onFeed(d) {
  if (!d) return
  if (d.tasks) baseTasks = d.tasks
  if (d.repo && d.repo.head) repoHead = d.repo.head
  if (mcpOk) { pushBuild(); return }
  for (const ev of d.events || []) {
    const k = ev.ts + '|' + ev.event + '|' + (ev.toolUseId || ev.tool || '') + '|' + (ev.agent || '')
    if (seenFeed.has(k)) continue
    seenFeed.add(k)
    overlayFrom(ev); ingest(ev)
  }
  pushBuild()
  setConn('on', 'snapshot · ' + hhmm(Date.parse(d.updated) || Date.now()))
}

/* ---- source 2: connector polling ---- */
function eventsFromRec(rec) {
  const body = rec.assistant || rec.user
  if (!body) return []
  const cc = body.internal_anthropic_catchall || {}
  const msg = cc.message || {}
  const ts = Date.parse(cc.timestamp || rec.created_at) || Date.now()
  return messageEvents(rec.assistant ? 'assistant' : 'user', msg.content, ts,
    { agentId: cc.agent_id, agentLabel: cc.task_description || cc.subagent_type, parentUse: cc.parent_tool_use_id, useName })
}
const ERR = {
  not_in_manifest: 'Allow the Claude Code Remote connector for this page to see live events.',
  approval_required: 'Allow the Claude Code Remote connector for this page to see live events.',
  server_not_connected: 'Claude Code Remote connector is not connected in this app.',
  needs_reauth: 'Reconnect Claude Code Remote in Settings, Connectors.',
  blocked_by_policy: 'Your organization blocks the session-events tool.',
}
async function poll(mcp, first) {
  const call = input => mcp.callTool(CCR.server, 'list_events', { session_id: CCR.session, kinds: ['assistant', 'user'], limit: 100, ...input }, { cache: false })
  const bodyOf = r => { const p = (r && r.payload) || {}; return p.ccr || p }
  let res = await call({}), body = bodyOf(res), pages = [body.data || []]
  if (first) for (let i = 0; i < 3 && body.has_more && body.first_id; i++) { res = await call({ before_id: body.first_id }); body = bodyOf(res); pages.unshift(body.data || []) }
  for (const rec of pages.flat()) {
    const id = (rec.assistant || rec.user || {}).uuid
    if (!id || seenRec.has(id)) continue
    seenRec.add(id)
    for (const ev of eventsFromRec(rec)) { overlayFrom(ev); ingest(ev) }
  }
  mcpOk = true
  pushBuild()
  setConn('on', 'live · synced ' + hhmm(Date.now()))
}
async function startMcp(mcp) {
  let first = true
  const loop = async () => {
    if (document.hidden) { setTimeout(loop, 1500); return }
    try { await poll(mcp, first); first = false }
    catch (e) {
      const code = (e && e.code) || 'upstream_error'
      if (!mcpOk) { setConn('wait', (ERR[code] || `connector error (${code})`) + ' Using synced snapshots.'); return }   // never worked: stop, rely on snapshots
      setTimeout(loop, Math.max(POLL_MS, (e && e.retryAfterMs) || 8000)); return
    }
    setTimeout(loop, POLL_MS)
  }
  loop()
}

async function startCcr() {
  setConn('wait', 'connecting…')
  const hide = $('demo'); if (hide) hide.hidden = true
  let db = null, mcp = null
  try { db = window.claude && await window.claude.use('db') } catch (e) {}
  try { mcp = window.claude && await window.claude.use('mcp') } catch (e) {}
  if (db) {
    db.doc('live/feed').onSnapshot(s => { if (s.exists) onFeed(s.data()); else setConn('wait', 'waiting for the first sync') }, () => setConn('wait', 'snapshot feed unavailable'))
  } else if (!mcp) {
    setConn('wait', 'open this page in the Claude app to see live events')
  }
  pushBuild()
  if (mcp) startMcp(mcp)
}
