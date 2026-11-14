// Bundle-size budget check. Gzips every JS/CSS file in dist/assets with node:zlib
// (default level, which matches Vite's reported gzip sizes) and fails when a budget
// from budgets.json is exceeded.
//
// Usage: node scripts/ci/bundle-budget.mjs [distAssetsDir] [budgetsFile]
import { readdirSync, readFileSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const KB = 1000
const HERE = dirname(fileURLToPath(import.meta.url))

// 'Life-DMXFa43x.js' -> { prefix: 'Life', type: 'js' }; null for other files.
export function parseChunk(file) {
  const m = /^(.+)-[A-Za-z0-9_-]{8}\.(js|css)$/.exec(basename(file))
  return m ? { prefix: m[1], type: m[2] } : null
}

// Pure. files: [{ name, gzip }] (gzip in bytes); budgets: rule list from budgets.json.
// Returns { ok, results: [{ name, actual, limit, ok, note? }] } with sizes in bytes.
export function evaluate(files, budgets) {
  const parsed = files
    .map((f) => ({ ...f, chunk: parseChunk(f.name) }))
    .filter((f) => f.chunk)
  const results = budgets.map((b) => {
    const limit = Math.round(b.maxKb * KB)
    const ofType = parsed.filter((f) => f.chunk.type === b.type)
    const hits = b.total ? ofType : ofType.filter((f) => f.chunk.prefix === b.match)
    if (hits.length === 0) {
      return { name: b.name, actual: 0, limit, ok: false, note: 'no matching files' }
    }
    const actual = hits.reduce((sum, f) => sum + f.gzip, 0)
    return { name: b.name, actual, limit, ok: actual <= limit }
  })
  return { ok: results.every((r) => r.ok), results }
}

export function measure(dir) {
  return readdirSync(dir)
    .filter((n) => parseChunk(n))
    .sort()
    .map((name) => ({ name, gzip: gzipSync(readFileSync(join(dir, name))).length }))
}

const fmt = (n) => `${n.toLocaleString('en-US')} B (${(n / KB).toFixed(2)} kB)`

function main() {
  const dir = resolve(process.argv[2] ?? join(HERE, '../../dist/assets'))
  const budgetsFile = resolve(process.argv[3] ?? join(HERE, 'budgets.json'))
  let files
  try {
    files = measure(dir)
  } catch (e) {
    console.error(`bundle-budget: cannot read ${dir} (${e.code ?? e.message}). Run \`npm run build\` first.`)
    process.exit(2)
  }
  const { budgets } = JSON.parse(readFileSync(budgetsFile, 'utf8'))

  console.log('Per-chunk gzip size:')
  for (const f of files) console.log(`  ${f.name.padEnd(42)} ${fmt(f.gzip)}`)
  for (const type of ['js', 'css']) {
    const total = files.filter((f) => parseChunk(f.name).type === type).reduce((s, f) => s + f.gzip, 0)
    console.log(`Total ${type.toUpperCase()} gzip: ${fmt(total)}`)
  }

  const { ok, results } = evaluate(files, budgets)
  console.log('\nBudgets:')
  for (const r of results) {
    const status = r.ok ? 'ok  ' : 'FAIL'
    const note = r.note ? ` [${r.note}]` : ''
    console.log(`  ${status} ${r.name.padEnd(12)} ${fmt(r.actual)} / limit ${fmt(r.limit)}${note}`)
  }
  if (!ok) {
    console.error('\nbundle-budget: over budget')
    process.exit(1)
  }
  console.log('\nbundle-budget: within budget')
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
