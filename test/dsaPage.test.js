// Static guard for the vendored DSA mastery-map page (R3-04). Reads the HTML
// as text: pins the localStorage key contract the cloud sync and the Forge
// shell depend on, and checks the embed / owner-guard / backup / summary hooks.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const HTML = readFileSync(
  fileURLToPath(new URL('../public/dsa/mastery-map.html', import.meta.url)),
  'utf8',
)

const scripts = [...HTML.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map((m) => m[1])
const SYNC = scripts.find((s) => s.includes('Mastery Map cloud sync'))
const style = HTML.match(/<style>([\s\S]*?)<\/style>/)[1]

test('sync script and style block are found', () => {
  assert.ok(SYNC, 'cloud sync script present')
  assert.ok(style.length > 1000)
})

test('storage keys are pinned', () => {
  for (const key of ['mastery_map_v2', 'mastery_map_problems', 'mastery_tab', 'roadmap_phase', 'roadmap_rating']) {
    assert.ok(HTML.includes(`'${key}'`), `${key} still used`)
  }
  assert.match(HTML, /const STORAGE_KEY = 'mastery_map_v2'/)
  assert.match(HTML, /const PROBLEM_LOG_KEY = 'mastery_map_problems'/)
  assert.match(SYNC, /var DATA_KEY = 'dsa_mastery_v1'/)
})

test('ours() regex is pinned and matches only synced keys', () => {
  const m = SYNC.match(/function ours\(k\) \{ return (\/[^;]+\/)\.test\(k\); \}/)
  assert.ok(m, 'ours() found')
  assert.equal(m[1], '/^(mastery_|roadmap_)/')
  const ours = (k) => new RegExp(m[1].slice(1, -1)).test(k)
  for (const k of ['mastery_map_v2', 'mastery_map_problems', 'mastery_tab', 'roadmap_phase', 'roadmap_rating']) {
    assert.ok(ours(k), `${k} is pushed`)
  }
  for (const k of ['dsa_summary', 'dsa_owner', 'dsa_pre_pull_backup', 'dsa_mastery_v1']) {
    assert.ok(!ours(k), `${k} must not be pushed`)
  }
})

test('embed hooks exist', () => {
  assert.match(HTML, /get\('embed'\) === '1'/)
  assert.match(HTML, /classList\.add\('embed'\)/)
  assert.match(HTML, /class="forge-link"/)
  assert.match(style, /html\.embed \.forge-link\s*\{\s*display:\s*none/)
  assert.match(SYNC, /classList\.contains\('embed'\)/)
})

test('layout fixes: no fixed minmax overflow, dvh with fallback', () => {
  assert.doesNotMatch(style, /minmax\(\s*3[26]0px\s*,\s*1fr\s*\)/)
  assert.match(style, /minmax\(min\(360px, 100%\), 1fr\)/)
  assert.match(style, /minmax\(min\(320px, 100%\), 1fr\)/)
  assert.ok(!/height:\s*100vh;(?!\s*height:\s*100dvh)(?!\s*min-height:\s*100dvh)/.test(style), 'every 100vh is followed by a 100dvh')
  assert.match(style, /100dvh/)
})

test('dsa_summary is written outside the patched setItem', () => {
  assert.match(HTML, /function writeSummary\(\)/)
  assert.match(HTML, /Storage\.prototype\.setItem\.call\(localStorage, 'dsa_summary', JSON\.stringify\(\{ done, total, tabs, at: Date\.now\(\) \}\)\)/)
  assert.match(HTML, /function save\(\) \{[^}]*writeSummary\(\)/)
})

test('owner guard clears mastery_/roadmap_ before pulling', () => {
  assert.match(SYNC, /OWNER_KEY = 'dsa_owner'/)
  const guard = SYNC.indexOf('prevOwner !== uid')
  const pull = SYNC.indexOf("sb.from('kv_store').select('value')")
  assert.ok(guard > 0 && pull > guard, 'guard runs before the pull')
  assert.match(SYNC, /ours\(localStorage\.key\(i\)\)[\s\S]*nativeRemove\(k\)/)
})

test('a pull that changes local data saves dsa_pre_pull_backup first', () => {
  assert.match(SYNC, /BACKUP_KEY = 'dsa_pre_pull_backup'/)
  const backup = SYNC.indexOf('rawSet(BACKUP_KEY')
  const overwrite = SYNC.indexOf('nativeSet(k, cloud[k])')
  assert.ok(backup > 0 && overwrite > backup, 'backup precedes the overwrite')
})

test('?tab deep link is validated against TABS', () => {
  assert.match(HTML, /get\('tab'\)/)
  assert.match(HTML, /TABS\.some\(t => t\.id === wantedTab\)/)
})
