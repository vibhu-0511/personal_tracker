import { pathToFileURL } from 'node:url'
import path from 'node:path'

export const MAX_BODY_BYTES = 1024 * 1024 // 1 MB

class HttpError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

// vite preview's server has no ssrLoadModule (that's dev-only); fall back to a
// plain dynamic import so /api/* also works under `vite preview`.
async function loadApiModule(server, name) {
  if (typeof server.ssrLoadModule === 'function') {
    return server.ssrLoadModule(`/api/${name}.js`)
  }
  return import(pathToFileURL(path.join(process.cwd(), 'api', `${name}.js`)).href)
}

// Reads the request body, enforcing a byte cap. Oversized bodies are drained
// (not buffered) so the client can still receive the 413 response.
async function readJsonBody(req, maxBytes) {
  const declared = Number(req.headers?.['content-length'])
  let tooBig = Number.isFinite(declared) && declared > maxBytes
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    if (tooBig) continue
    size += chunk.length
    if (size > maxBytes) {
      tooBig = true
      chunks.length = 0
      continue
    }
    chunks.push(chunk)
  }
  if (tooBig) throw new HttpError(413, 'Payload too large')
  if (!chunks.length) return {}
  try {
    return JSON.parse(Buffer.concat(chunks).toString())
  } catch {
    throw new HttpError(400, 'Invalid JSON body')
  }
}

// Connect-style middleware that emulates Vercel's Node (req, res) handler
// contract for /api/*. `getModule(name)` resolves the handler module.
export function createApiMiddleware({ getModule, maxBodyBytes = MAX_BODY_BYTES }) {
  return async (req, res, next) => {
    if (!req.url.startsWith('/api/')) return next()

    const url = new URL(req.url, 'http://localhost')
    const name = url.pathname.slice('/api/'.length)
    if (name.includes('..')) return res.writeHead(400).end()

    req.query = Object.fromEntries(url.searchParams)
    res.status = (code) => {
      res.statusCode = code
      return res
    }
    res.json = (obj) => {
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify(obj))
    }

    try {
      if (req.method === 'POST') {
        req.body = await readJsonBody(req, maxBodyBytes)
      }
      const mod = await getModule(name)
      // All methods (including OPTIONS preflight) reach the handler.
      await mod.default(req, res)
    } catch (err) {
      if (err instanceof HttpError) {
        return res.status(err.status).json({ error: err.message })
      }
      console.error(`api/${name} dev handler error`, err)
      res.status(500).json({ error: 'Internal error' })
    }
  }
}

export function apiDevPlugin() {
  const mw = (server) => {
    server.middlewares.use(
      createApiMiddleware({ getModule: (name) => loadApiModule(server, name) }),
    )
  }
  return {
    name: 'forge-api-dev',
    configureServer: mw,
    configurePreviewServer: mw,
  }
}

export default apiDevPlugin
