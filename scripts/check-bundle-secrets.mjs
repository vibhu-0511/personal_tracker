// Post-build secret scanner. Reads ONLY built output (default: dist) and fails when it finds
// a server-side secret that must never ship to the browser:
//   - a Groq-style API key (gsk_...)
//   - a Supabase JWT whose payload role is service_role (anon-role JWTs are public by design)
//   - the OWNER_USER_ID variable name, or its value when it is set in the environment
// A matched value is never printed in full; only a masked preview is shown.
// Usage: node scripts/check-bundle-secrets.mjs [dist]    (exit 0 clean, 1 found, 2 unreadable)
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve, extname } from 'node:path'
import { fileURLToPath } from 'node:url'

const GROQ_KEY = /\bgsk_[A-Za-z0-9]{20,}/g
const JWT = /\beyJ[A-Za-z0-9_-]{5,}\.eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}/g
const OWNER_NAME = /OWNER_USER_ID/g
const MIN_OWNER_VALUE_LEN = 8 // shorter values would match unrelated text

const BINARY_EXT = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.ico', '.icns', '.woff', '.woff2', '.ttf',
  '.otf', '.eot', '.mp3', '.mp4', '.webm', '.wasm', '.pdf', '.zip', '.gz', '.br',
])

// Keep a short prefix and the length so a finding is traceable without leaking the secret.
export function maskSecret(value) {
  const s = String(value)
  if (s.length <= 12) return `*** (${s.length} chars)`
  return `${s.slice(0, 4)}*** (${s.length} chars)`
}

function jwtRole(token) {
  try {
    const payload = token.split('.')[1]
    const json = Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')
    return JSON.parse(json)?.role
  } catch {
    return undefined
  }
}

// Returns [{ rule, masked }] for one text blob. `ownerUserId` is the live OWNER_USER_ID value, if any.
export function scanText(text, { ownerUserId } = {}) {
  const findings = []
  for (const m of text.matchAll(GROQ_KEY)) {
    findings.push({ rule: 'groq-key', masked: maskSecret(m[0]) })
  }
  for (const m of text.matchAll(JWT)) {
    if (jwtRole(m[0]) === 'service_role') findings.push({ rule: 'service-role-jwt', masked: maskSecret(m[0]) })
  }
  if (text.includes('OWNER_USER_ID')) {
    for (const m of text.matchAll(OWNER_NAME)) findings.push({ rule: 'owner-user-id-name', masked: m[0] })
  }
  const owner = (ownerUserId ?? '').trim()
  if (owner.length >= MIN_OWNER_VALUE_LEN && text.includes(owner)) {
    findings.push({ rule: 'owner-user-id-value', masked: maskSecret(owner) })
  }
  return findings
}

function* walk(dir) {
  for (const name of readdirSync(dir).sort()) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) yield* walk(p)
    else yield p
  }
}

// Returns { scanned, findings: [{ file, rule, masked }] } for every non-binary file under dir.
export function scanDir(dir, opts = {}) {
  const root = resolve(dir)
  const findings = []
  let scanned = 0
  for (const file of walk(root)) {
    if (BINARY_EXT.has(extname(file).toLowerCase())) continue
    scanned += 1
    const rel = relative(root, file)
    for (const f of scanText(readFileSync(file, 'utf8'), opts)) findings.push({ file: rel, ...f })
  }
  return { scanned, findings }
}

function main() {
  const dir = resolve(process.argv[2] ?? 'dist')
  let result
  try {
    result = scanDir(dir, { ownerUserId: process.env.OWNER_USER_ID })
  } catch (e) {
    console.error(`check-bundle-secrets: cannot read ${dir} (${e.code ?? e.message}). Run \`npm run build\` first.`)
    process.exit(2)
  }
  if (result.findings.length) {
    for (const f of result.findings) console.error(`  FOUND ${f.rule} in ${f.file}: ${f.masked}`)
    console.error(`check-bundle-secrets: ${result.findings.length} secret(s) in ${dir}`)
    process.exit(1)
  }
  console.log(`check-bundle-secrets: clean (${result.scanned} files scanned in ${dir})`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
