// Reads a Claude Code session transcript (main + subagent files) into normalized events.
import fs from 'node:fs'
import path from 'node:path'
import { messageEvents } from './graph.mjs'

const readLines = f => fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map(l => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean)

// dir = ~/.claude/projects/<project>, session = <uuid>
export function readSessionEvents(dir, session) {
  const events = []
  const add = (file, ctxBase) => {
    const useName = new Map()
    for (const o of readLines(file)) {
      if (o.type !== 'assistant' && o.type !== 'user') continue
      const m = o.message; if (!m) continue
      const ts = Date.parse(o.timestamp)
      if (!ts) continue
      events.push(...messageEvents(m.role || o.type, m.content, ts, { ...ctxBase, session, useName }))
    }
  }
  const main = path.join(dir, `${session}.jsonl`)
  if (fs.existsSync(main)) add(main, {})
  const subDir = path.join(dir, session, 'subagents')
  if (fs.existsSync(subDir)) {
    for (const f of fs.readdirSync(subDir).filter(x => /^agent-.*\.jsonl$/.test(x))) {
      const id = f.replace(/^agent-|\.jsonl$/g, '')
      let meta = {}
      try { meta = JSON.parse(fs.readFileSync(path.join(subDir, f.replace(/\.jsonl$/, '.meta.json')), 'utf8')) } catch {}
      add(path.join(subDir, f), { agentId: id, agentLabel: meta.description || meta.agentType || null, parentUse: meta.toolUseId || null })
    }
  }
  events.sort((a, b) => a.ts - b.ts)
  return events
}
