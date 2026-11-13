// Pure event model shared by the server (normalize) and the browser (reduce).
// No DOM, no node: imports, so `node --test` can exercise it.

export const FAMILIES = {
  shell: 'Shell', file: 'Files', search: 'Search', agent: 'Subagent', skill: 'Skill',
  mcp: 'MCP', web: 'Web', artifact: 'Artifact', task: 'Tasks', other: 'Other', event: 'Event',
}

export function familyOf(tool) {
  if (!tool) return 'event'
  if (/^(Bash|BashOutput|KillShell|Monitor)$/.test(tool)) return 'shell'
  if (/^(Read|Write|Edit|MultiEdit|NotebookEdit)$/.test(tool)) return 'file'
  if (/^(Grep|Glob)$/.test(tool)) return 'search'
  if (tool === 'Agent' || tool === 'Task') return 'agent'
  if (tool === 'Skill') return 'skill'
  if (tool.startsWith('mcp__')) return 'mcp'
  if (/^Web/.test(tool)) return 'web'
  if (tool.startsWith('Artifact')) return 'artifact'
  if (/^Task[A-Z]/.test(tool) || tool === 'TodoWrite') return 'task'
  return 'other'
}

const clip = (s, n) => {
  s = String(s ?? '').replace(/\s+/g, ' ').trim()
  return s.length > n ? s.slice(0, n - 1) + '…' : s
}
const base = p => String(p || '').split('/').filter(Boolean).pop() || String(p || '')

export function labelOf(tool, input = {}) {
  const i = input && typeof input === 'object' ? input : {}
  switch (familyOf(tool)) {
    case 'shell': return clip(i.description || i.command || tool, 60)
    case 'file': return base(i.file_path || i.notebook_path || '') || tool
    case 'search': return clip(i.pattern || tool, 40)
    case 'agent': return clip(i.description || i.subagent_type || 'agent', 50)
    case 'skill': return clip(i.skill || 'skill', 40)
    case 'mcp': return clip(tool.replace(/^mcp__/, '').replace(/__/g, ' · '), 50)
    case 'web': return clip(i.url || i.query || tool, 50)
    case 'artifact': return clip(`${i.action || 'publish'} ${base(i.file_path || i.url || '')}`, 50)
    default: return clip(tool, 40)
  }
}

// `cd some/dir && ...` -> "some/dir"
export function cdOf(command) {
  const m = /(?:^|&&|;|\|\|)\s*cd\s+("[^"]+"|'[^']+'|[^\s;&|]+)/.exec(String(command || ''))
  return m ? m[1].replace(/^["']|["']$/g, '') : null
}

function truncDeep(v, n = 2000, depth = 0) {
  if (typeof v === 'string') return v.length > n ? v.slice(0, n) + `… [+${v.length - n} chars]` : v
  if (depth > 4 || v == null || typeof v !== 'object') return v
  if (Array.isArray(v)) return v.slice(0, 30).map(x => truncDeep(x, n, depth + 1))
  const o = {}
  for (const k of Object.keys(v).slice(0, 40)) o[k] = truncDeep(v[k], n, depth + 1)
  return o
}

function outText(r) {
  if (r == null) return ''
  if (typeof r === 'string') return r
  if (Array.isArray(r)) return r.map(outText).join('\n')
  if (typeof r === 'object') {
    if (typeof r.stdout === 'string' || typeof r.stderr === 'string') return [r.stdout, r.stderr].filter(Boolean).join('\n')
    if (Array.isArray(r.content)) return outText(r.content)
    if (typeof r.text === 'string') return r.text
    if (typeof r.output === 'string') return r.output
    try { return JSON.stringify(r) } catch { return '' }
  }
  return String(r)
}

// Raw hook payload (what Claude Code pipes to a hook's stdin) -> compact event.
export function normalize(p, ts = Date.now()) {
  p = p && typeof p === 'object' ? p : {}
  const resp = p.tool_response
  const out = outText(resp)
  const error = p.hook_event_name === 'PostToolUseFailure' || !!(resp && typeof resp === 'object' && (resp.is_error === true || (typeof resp.error === 'string' && resp.error)))
  return {
    ts,
    kind: p.kind || 'hook',
    event: p.hook_event_name || p.event || 'Unknown',
    session: p.session_id || 'unknown',
    agent: p.agent_id || null,
    agentType: p.agent_type || null,
    agentLabel: p.agent_label || null,
    parentUse: p.parent_tool_use_id || null,
    cwd: p.cwd || null,
    transcript: p.transcript_path || null,
    tool: p.tool_name || null,
    toolUseId: p.tool_use_id || null,
    input: p.tool_input !== undefined ? truncDeep(p.tool_input) : undefined,
    output: out ? (out.length > 4000 ? out.slice(0, 4000) + `… [+${out.length - 4000} chars]` : out) : '',
    error,
    prompt: typeof p.prompt === 'string' ? clip(p.prompt, 4000) : undefined,
    message: p.message,
    source: p.source,
    trigger: p.trigger,
    text: typeof p.text === 'string' ? p.text : undefined,
  }
}

export function newModel() {
  return { seq: 0, nodes: [], byUse: {}, lanes: ['main'], laneInfo: { main: { label: 'main session' } },
    stage: 'idle', cwd: null, cwdChanges: 0, counts: { total: 0, running: 0, error: 0, agents: 0 },
    checks: {}, say: [], lastEvent: null }
}

function laneOf(m, ev) {
  const key = ev.agent || 'main'
  if (!m.laneInfo[key]) { m.lanes.push(key); m.laneInfo[key] = { label: ev.agentLabel || ev.agentType || `agent ${String(key).slice(-6)}` } }
  return key
}

function addNode(m, ev, n) {
  const lane = laneOf(m, ev)
  const node = { id: 'n' + (++m.seq), seq: m.seq, lane, t0: ev.ts, t1: null, cwd: ev.cwd, ...n }
  if (lane !== 'main' && !m.nodes.some(x => x.lane === lane)) {
    const exact = ev.parentUse && m.byUse[ev.parentUse]
    const parent = exact ? m.nodes.find(x => x.id === exact) : [...m.nodes].reverse().find(x => x.lane === 'main' && x.family === 'agent' && x.state === 'running')
    if (parent) node.parent = parent.id
  }
  m.nodes.push(node)
  return node
}

const mark = (m, ev, label, family = 'event', state = 'ok') =>
  addNode(m, ev, { type: 'mark', family, tool: ev.event, label: clip(label, 60), state, t1: ev.ts, input: undefined, output: label })

function harvestChecks(m, node) {
  const out = node.output || ''
  const t = /# pass (\d+)[\s\S]*?# fail (\d+)/.exec(out)
  if (t) m.checks.tests = { pass: +t[1], fail: +t[2], ts: node.t1 }
  if (/✓ built in|built in [\d.]+m?s/.test(out)) m.checks.build = { ok: true, ts: node.t1 }
  else if (/npm run build/.test(JSON.stringify(node.input || '')) && node.state === 'fail') m.checks.build = { ok: false, ts: node.t1 }
  const l = /(\d+) errors?, (\d+) warnings?/.exec(out)
  if (l && /plan-lint/.test(JSON.stringify(node.input || ''))) m.checks.lint = { errors: +l[1], ts: node.t1 }
}

export function reduce(m, ev) {
  m.lastEvent = ev.ts
  if (ev.cwd && m.cwd && ev.cwd !== m.cwd) m.cwdChanges++
  if (ev.cwd) m.cwd = ev.cwd
  switch (ev.event) {
    case 'SessionStart': mark(m, ev, `session start${ev.source ? ' · ' + ev.source : ''}`, 'event'); m.stage = 'idle'; break
    case 'UserPromptSubmit': { const n = mark(m, ev, ev.prompt || 'prompt', 'event'); n.output = ev.prompt || ''; m.stage = 'prompt'; break }
    case 'PreToolUse': {
      const input = ev.input && typeof ev.input === 'object' ? ev.input : {}
      const node = addNode(m, ev, { type: 'tool', tool: ev.tool, family: familyOf(ev.tool), label: labelOf(ev.tool, input), state: 'running', input: ev.input, output: '', toolUseId: ev.toolUseId, cd: ev.tool === 'Bash' ? cdOf(input.command) : null })
      if (ev.toolUseId) m.byUse[ev.toolUseId] = node.id
      m.counts.total++; m.counts.running++
      if (node.family === 'agent') m.counts.agents++
      m.stage = 'tool'
      break
    }
    case 'PostToolUse': case 'PostToolUseFailure': {
      let node = ev.toolUseId && m.nodes.find(x => x.id === m.byUse[ev.toolUseId])
      if (!node) node = [...m.nodes].reverse().find(x => x.type === 'tool' && x.state === 'running' && x.tool === ev.tool)
      if (!node) node = addNode(m, ev, { type: 'tool', tool: ev.tool, family: familyOf(ev.tool), label: labelOf(ev.tool, ev.input), state: 'running', input: ev.input, output: '' })
      else m.counts.running = Math.max(0, m.counts.running - 1)
      node.state = ev.error ? 'fail' : 'ok'; node.t1 = ev.ts; node.output = ev.output || ''
      if (ev.error) m.counts.error++
      if (node.tool === 'Bash') harvestChecks(m, node)
      m.stage = 'result'
      break
    }
    case 'SubagentStop': mark(m, ev, `subagent finished${ev.agentType ? ' · ' + ev.agentType : ''}`, 'agent'); break
    case 'Stop': mark(m, ev, 'turn complete', 'event'); m.stage = 'final'; break
    case 'Notification': mark(m, ev, ev.message || 'notification', 'event'); break
    case 'PreCompact': mark(m, ev, `compaction${ev.trigger ? ' · ' + ev.trigger : ''}`, 'event'); break
    case 'SessionEnd': mark(m, ev, 'session end', 'event'); m.stage = 'idle'; break
    case 'AssistantText': m.say.push({ ts: ev.ts, text: ev.text || '' }); if (m.say.length > 50) m.say.shift(); m.stage = 'model'; break
    default: mark(m, ev, ev.event, 'event')
  }
  return m
}
