import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { maskSecret, scanText, scanDir } from '../scripts/check-bundle-secrets.mjs'

const SCRIPT = fileURLToPath(new URL('../scripts/check-bundle-secrets.mjs', import.meta.url))

// Every secret below is synthetic and assembled here; nothing real is ever used.
const b64url = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
const fakeJwt = (role) => `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url({ iss: 'supabase', role })}.${'s'.repeat(24)}`
const fakeGroq = () => 'gsk_' + 'Ab1'.repeat(10)
const fakeOwnerId = () => ['00000000', '1111', '4222', '8333', '444444444444'].join('-')

function distWith(files) {
  const dir = mkdtempSync(join(tmpdir(), 'bundle-secrets-'))
  mkdirSync(join(dir, 'assets'))
  for (const [name, body] of Object.entries(files)) writeFileSync(join(dir, name), body)
  return dir
}
const cli = (dir, env = {}) =>
  spawnSync(process.execPath, [SCRIPT, dir], { encoding: 'utf8', env: { ...process.env, OWNER_USER_ID: '', ...env } })

test('flags a gsk_ Groq-style key', () => {
  const f = scanText(`const k="${fakeGroq()}";`)
  assert.deepEqual(f.map((x) => x.rule), ['groq-key'])
})

test('flags a service_role JWT but passes an anon-role JWT', () => {
  assert.deepEqual(scanText(`x="${fakeJwt('service_role')}"`).map((x) => x.rule), ['service-role-jwt'])
  assert.deepEqual(scanText(`x="${fakeJwt('anon')}"`), [])
})

test('ignores a JWT-shaped string that does not decode', () => {
  assert.deepEqual(scanText('eyJhbGciOi.eyJ!!!notjson.abcdefghij'), [])
})

test('flags the OWNER_USER_ID name and its value', () => {
  assert.deepEqual(scanText('process.env.OWNER_USER_ID').map((x) => x.rule), ['owner-user-id-name'])
  const id = fakeOwnerId()
  assert.deepEqual(scanText(`u="${id}"`, { ownerUserId: id }).map((x) => x.rule), ['owner-user-id-value'])
  assert.deepEqual(scanText(`u="${id}"`), [])
  assert.deepEqual(scanText('abc', { ownerUserId: 'abc' }), [])
})

test('maskSecret never returns the full value', () => {
  for (const s of [fakeGroq(), fakeJwt('service_role'), fakeOwnerId(), 'short']) {
    const m = maskSecret(s)
    assert.ok(!m.includes(s))
    assert.ok(m.includes(`${s.length} chars`))
  }
  assert.ok(maskSecret(fakeGroq()).length < 30)
})

test('scanDir walks nested files and skips binaries', () => {
  const dir = distWith({ 'index.html': '<html></html>', 'assets/app.js': `k="${fakeGroq()}"`, 'assets/logo.png': fakeGroq() })
  try {
    const r = scanDir(dir)
    assert.equal(r.scanned, 2)
    assert.deepEqual(r.findings.map((x) => [x.file, x.rule]), [[join('assets', 'app.js'), 'groq-key']])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('CLI exits 0 on a clean dist with an anon JWT', () => {
  const dir = distWith({ 'index.html': '<html></html>', 'assets/app.js': `a="${fakeJwt('anon')}"` })
  try {
    const r = cli(dir)
    assert.equal(r.status, 0, r.stderr)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('CLI exits 1 and prints only a masked value for each secret kind', () => {
  const id = fakeOwnerId()
  const cases = [
    [fakeGroq(), {}],
    [fakeJwt('service_role'), {}],
    [id, { OWNER_USER_ID: id }],
    ['OWNER_USER_ID', {}],
  ]
  for (const [secret, env] of cases) {
    const dir = distWith({ 'assets/app.js': `var s="${secret}";` })
    try {
      const r = cli(dir, env)
      assert.equal(r.status, 1, `expected failure for ${secret.slice(0, 6)}`)
      assert.ok(r.stderr.includes('app.js'))
      if (secret !== 'OWNER_USER_ID') assert.ok(!(r.stdout + r.stderr).includes(secret), 'secret leaked in output')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }
})

test('CLI exits 2 when the directory is missing', () => {
  assert.equal(cli(join(tmpdir(), 'bundle-secrets-does-not-exist')).status, 2)
})
