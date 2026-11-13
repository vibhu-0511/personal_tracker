// Derives per-task build status from git. Pure (deriveStatuses) + a git reader (readRepo).
import { execFile } from 'node:child_process'

const BRANCH_RE = /^wave\/(P\d+)-W(\d+)\/([A-Za-z0-9-]+)$/
const MERGE_RE = /wave\/(P\d+)-W(\d+)\/([A-Za-z0-9-]+)/g

// plan: [{id, o?}]  repo: {branches:[{name,sha,own,inHead,worktree}], mergeSubjects:[str]}
// own = commits on the branch that are not on the base branch; inHead = tip reachable from HEAD.
export function deriveStatuses(plan, repo, overrides = {}) {
  const byId = {}
  for (const b of repo.branches || []) { const m = BRANCH_RE.exec(b.name); if (m) byId[m[3]] = b }
  const merged = new Set()
  for (const s of repo.mergeSubjects || []) for (const m of s.matchAll(MERGE_RE)) merged.add(m[3])
  const out = {}
  for (const t of plan) {
    const b = byId[t.id]
    let s = 'queued', note = ''
    if (t.o === 'user') s = 'yours'
    else if (merged.has(t.id) || (b && b.own > 0 && b.inHead)) s = 'merged'
    else if (b && b.own > 0) s = 'committed'
    else if (b) s = 'running'
    const o = overrides[t.id]
    if (o && o.s) { s = o.s; note = o.note || '' }
    out[t.id] = { s, branch: b ? b.name : '', sha: b ? b.sha : '', note }
  }
  return out
}

const git = (args, cwd) => new Promise(res => {
  execFile('git', args, { cwd, timeout: 4000, maxBuffer: 4e6 }, (err, stdout) => res({ ok: !err, out: String(stdout || '').trim(), code: err && err.code }))
})

export async function readRepo(cwd, baseRefs = ['origin/master', 'master', 'origin/main', 'main']) {
  let baseRef = null
  for (const r of baseRefs) if ((await git(['rev-parse', '--verify', '-q', r], cwd)).ok) { baseRef = r; break }
  const refs = await git(['for-each-ref', '--format=%(refname:short)|%(objectname:short)', 'refs/heads/wave/'], cwd)
  const wt = await git(['worktree', 'list', '--porcelain'], cwd)
  const wtBranches = new Set([...wt.out.matchAll(/^branch refs\/heads\/(.+)$/gm)].map(m => m[1]))
  const branches = await Promise.all(refs.out.split('\n').filter(Boolean).map(async line => {
    const [name, sha] = line.split('|')
    const own = baseRef ? +((await git(['rev-list', '--count', `${baseRef}..${name}`], cwd)).out || 0) : 0
    const inHead = (await git(['merge-base', '--is-ancestor', name, 'HEAD'], cwd)).ok
    return { name, sha, own, inHead, worktree: wtBranches.has(name) }
  }))
  const merges = await git(['log', '--merges', '--format=%s', '-n', '500'], cwd)
  const head = await git(['log', '-1', '--format=%h|%s'], cwd)
  const branch = await git(['rev-parse', '--abbrev-ref', 'HEAD'], cwd)
  const dirty = await git(['status', '--porcelain'], cwd)
  const [hsha, ...hs] = head.out.split('|')
  return {
    branches, mergeSubjects: merges.out.split('\n').filter(Boolean), baseRef,
    head: { branch: branch.out, sha: hsha, subject: hs.join('|') },
    dirty: dirty.out ? dirty.out.split('\n').length : 0,
    worktrees: wtBranches.size,
  }
}
