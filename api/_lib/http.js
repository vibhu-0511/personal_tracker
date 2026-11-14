// Shared HTTP helpers for api/* handlers: CORS allow-list, preflight, capped
// JSON body reader and cache-header helper. The underscore prefix keeps this
// folder from being deployed as functions.

export const DEFAULT_ALLOWED_ORIGINS = [
  'capacitor://localhost',
  'https://localhost',
  'http://localhost:5173',
]

export const DEFAULT_BODY_LIMIT = 64 * 1024

const ALLOW_METHODS = 'GET, POST, OPTIONS'
const ALLOW_HEADERS = 'Authorization, Content-Type'
const PREFLIGHT_MAX_AGE = '600'

// An error that carries the HTTP status a handler should answer with.
export class HttpError extends Error {
  constructor(status, message) {
    super(message)
    this.name = 'HttpError'
    this.status = status
  }
}

export function parseAllowedOrigins(raw) {
  return String(raw || '')
    .split(',')
    .map((s) => s.trim().replace(/\/+$/, ''))
    .filter(Boolean)
}

export function allowedOrigins(env = process.env) {
  return [...DEFAULT_ALLOWED_ORIGINS, ...parseAllowedOrigins(env && env.ALLOWED_ORIGINS)]
}

export function isOriginAllowed(origin, env = process.env) {
  if (typeof origin !== 'string' || !origin) return false
  return allowedOrigins(env).includes(origin)
}

function getHeader(req, name) {
  const v = req.headers && req.headers[name]
  return Array.isArray(v) ? v[0] : v
}

// Echoes the request Origin only when it is on the allow-list. Vary: Origin is
// always set so caches never serve one origin's response to another.
// Returns true when the origin was allowed.
export function applyCors(req, res, env = process.env) {
  res.setHeader('Vary', 'Origin')
  const origin = getHeader(req, 'origin')
  if (!isOriginAllowed(origin, env)) return false
  res.setHeader('Access-Control-Allow-Origin', origin)
  return true
}

// Answers OPTIONS with 204 (CORS headers only for allowed origins). Returns
// true when the request was a preflight and has been fully handled.
export function handlePreflight(req, res, env = process.env) {
  if (req.method !== 'OPTIONS') return false
  if (applyCors(req, res, env)) {
    res.setHeader('Access-Control-Allow-Methods', ALLOW_METHODS)
    res.setHeader('Access-Control-Allow-Headers', ALLOW_HEADERS)
    res.setHeader('Access-Control-Max-Age', PREFLIGHT_MAX_AGE)
  }
  res.statusCode = 204
  res.end()
  return true
}

// Reads and parses a JSON body, rejecting anything over `limit` bytes with an
// HttpError(413). Also accepts a body the platform has already parsed.
// Bad JSON is an HttpError(400); an empty body yields {}.
export async function readJsonBody(req, { limit = DEFAULT_BODY_LIMIT } = {}) {
  const declared = Number(getHeader(req, 'content-length'))
  if (Number.isFinite(declared) && declared > limit) {
    throw new HttpError(413, 'Request body too large')
  }

  if (req.body !== undefined && req.body !== null) {
    const b = req.body
    if (typeof b === 'string' || Buffer.isBuffer(b)) return parseJson(b, limit)
    if (typeof b === 'object') {
      if (Buffer.byteLength(JSON.stringify(b)) > limit) {
        throw new HttpError(413, 'Request body too large')
      }
      return b
    }
  }

  const chunks = []
  let size = 0
  for await (const chunk of req) {
    const buf = typeof chunk === 'string' ? Buffer.from(chunk) : chunk
    size += buf.length
    if (size > limit) throw new HttpError(413, 'Request body too large')
    chunks.push(buf)
  }
  return parseJson(Buffer.concat(chunks), limit)
}

function parseJson(raw, limit) {
  const text = Buffer.isBuffer(raw) ? raw.toString('utf8') : raw
  if (Buffer.byteLength(text) > limit) throw new HttpError(413, 'Request body too large')
  if (!text.trim()) return {}
  try {
    return JSON.parse(text)
  } catch {
    throw new HttpError(400, 'Invalid JSON')
  }
}

// Sets a shared-cache Cache-Control header (CDN `s-maxage`) with optional
// stale-while-revalidate. Seconds; negative or non-integer values are clamped.
export function setCache(res, { sMaxAge = 0, staleWhileRevalidate = 0 } = {}) {
  const s = Math.max(0, Math.floor(Number(sMaxAge)) || 0)
  const swr = Math.max(0, Math.floor(Number(staleWhileRevalidate)) || 0)
  if (s === 0) {
    res.setHeader('Cache-Control', 'no-store')
    return
  }
  let v = `public, max-age=0, s-maxage=${s}`
  if (swr > 0) v += `, stale-while-revalidate=${swr}`
  res.setHeader('Cache-Control', v)
}
