import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

// Builds into a temp dir and checks the entry chunk stays free of modules that load lazily.
const root = fileURLToPath(new URL('..', import.meta.url))
const out = mkdtempSync(join(tmpdir(), 'entry-chunk-'))
const build = spawnSync(
  process.execPath,
  [join(root, 'node_modules/vite/bin/vite.js'), 'build', '--outDir', out, '--emptyOutDir', '--logLevel', 'error'],
  { cwd: root, encoding: 'utf8' },
)
const assets = join(out, 'assets')
const read = (re) => {
  const f = readdirSync(assets).find((n) => re.test(n))
  assert.ok(f, `no chunk matching ${re}`)
  return readFileSync(join(assets, f), 'utf8')
}

test('build succeeds', () => {
  assert.equal(build.status, 0, build.stderr)
})

test('entry chunk has neither the reminder-action nor the capture-parser module', () => {
  const entry = read(/^index-[\w-]{8}\.js$/)
  assert.ok(!entry.includes('Unknown reminder action'), 'reminder actions (LifeData) leaked into the entry chunk')
  assert.ok(!entry.includes('Reminder snoozed'), 'reminder action labels leaked into the entry chunk')
  assert.ok(!entry.includes('netflix'), 'capture parser leaked into the entry chunk')
})

test('reminder actions live in a lazy chunk', () => {
  assert.ok(read(/^LifeData-[\w-]{8}\.js$/).includes('Unknown reminder action'))
})

test('cleanup', () => rmSync(out, { recursive: true, force: true }))
