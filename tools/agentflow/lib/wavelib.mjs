// Pure helpers for the wave runner: glob matching, overlap tests and batch selection.
// No fs, no git, so `node --test` can exercise them.

export const MAX_BATCH = 6

export function globToRegExp(glob) {
  const g = String(glob).replace(/^\.\//, '')
  let re = ''
  for (let i = 0; i < g.length; i++) {
    const c = g[i]
    if (c === '*') {
      if (g[i + 1] === '*') {
        i++
        if (g[i + 1] === '/') { i++; re += '(?:.*/)?' } else re += '.*'   // "**/" also matches zero directories
      } else re += '[^/]*'
    } else if (c === '?') re += '[^/]'
    else re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&')
  }
  return new RegExp('^' + re + '$')
}

export function matchesGlob(glob, file) {
  const g = String(glob).replace(/^\.\//, '')
  if (g.endsWith('/')) return String(file).startsWith(g)   // "dir/" means everything under it
  return globToRegExp(g).test(String(file).replace(/^\.\//, ''))
}
export const allowedBy = (writes, file) => (writes || []).some(w => matchesGlob(w, file))

// Literal directory prefix of a pattern ("e2e/matrix/**" -> "e2e/matrix", "src/a.js" -> exact)
function scope(p) {
  const s = String(p).replace(/^\.\//, '')
  const wild = s.search(/[*?]/)
  if (wild === -1) return s.endsWith('/') ? { dir: s.replace(/\/+$/, ''), exact: false } : { dir: s, exact: true }
  const slash = s.lastIndexOf('/', wild)
  return { dir: slash < 0 ? '' : s.slice(0, slash), exact: false }
}
const inside = (x, d) => d === '' || x === d || x.startsWith(d + '/')
// Conservative: two patterns overlap if one's literal directory contains the other's (or they are the same file).
export function patternsOverlap(a, b) {
  const A = scope(a), B = scope(b)
  if (A.exact && B.exact) return A.dir === B.dir
  if (A.exact) return matchesGlob(b, a)
  if (B.exact) return matchesGlob(a, b)
  return inside(A.dir, B.dir) || inside(B.dir, A.dir)
}
export const anyOverlap = (xs, ys) => (xs || []).some(x => (ys || []).some(y => patternsOverlap(x, y)))

const phaseNo = id => +String(id).replace(/\D/g, '') || 0
export const waveKey = t => `${t.phase}-W${t.wave}`
export const taskOrder = (a, b) => phaseNo(a.phase) - phaseNo(b.phase) || a.wave - b.wave || (b.urgent ? 1 : 0) - (a.urgent ? 1 : 0)
export const branchOf = t => `wave/${t.phase}-W${t.wave}/${t.id}`

// statuses: {id: {s}}. Returns the next batch (earliest wave with runnable work, then pulled-forward tasks).
export function selectBatch(tasks, statuses, max = MAX_BATCH) {
  const s = id => (statuses[id] ? statuses[id].s : 'queued')
  const pending = tasks.filter(t => s(t.id) === 'queued').sort(taskOrder)
  const blockedBy = t => (t.deps || []).filter(d => s(d) !== 'merged')
  const runnable = pending.filter(t => !blockedBy(t).length)
  if (!runnable.length) {
    return { done: !pending.length, blocked: pending.map(t => ({ id: t.id, wave: waveKey(t), waiting: blockedBy(t).map(d => `${d}:${s(d)}`) })) }
  }
  const first = runnable[0]
  const picked = [], pw = [], pr = []
  const conflicts = t => anyOverlap(t.writes, pw) || anyOverlap(t.writes, pr) || anyOverlap(t.reads, pw)
  const take = t => { picked.push(t); pw.push(...(t.writes || [])); pr.push(...(t.reads || [])) }
  const wavePool = runnable.filter(t => waveKey(t) === waveKey(first))
  for (const t of wavePool) { if (picked.length >= max) break; if (!conflicts(t)) take(t) }
  // pull forward: later runnable tasks that touch nothing already picked
  const pulled = []
  for (const t of runnable) {
    if (picked.length >= max) break
    if (picked.includes(t) || waveKey(t) === waveKey(first)) continue
    if (conflicts(t)) continue
    take(t); pulled.push(t.id)
  }
  const sameWave = pending.filter(t => waveKey(t) === waveKey(first))
  return {
    wave: waveKey(first),
    run: picked.map(t => ({ id: t.id, title: t.title, size: t.size, writes: (t.writes || []).length })),
    pulledForward: pulled,
    deferredInWave: wavePool.filter(t => !picked.includes(t)).map(t => t.id),
    blockedInWave: sameWave.filter(t => blockedBy(t).length).map(t => ({ id: t.id, waiting: blockedBy(t).map(d => `${d}:${s(d)}`) })),
    userInWave: tasks.filter(t => waveKey(t) === waveKey(first) && t.owner === 'user').map(t => t.id),
  }
}

export function trailers(env = process.env) {
  const t = (env.AGENTFLOW_TRAILERS || '').replace(/\\n/g, '\n').trim()
  return t || 'Co-Authored-By: Claude <noreply@anthropic.com>'
}
