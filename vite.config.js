import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { pathToFileURL } from 'node:url'
import path from 'node:path'

// vite preview's server has no ssrLoadModule (that's dev-only); fall back to a
// plain dynamic import so /api/* also works under `vite preview`.
async function loadApiModule(server, name) {
  if (typeof server.ssrLoadModule === 'function') {
    return server.ssrLoadModule(`/api/${name}.js`)
  }
  return import(pathToFileURL(path.join(process.cwd(), 'api', `${name}.js`)).href)
}

function apiDevPlugin() {
  const mw = (server) => {
    server.middlewares.use(async (req, res, next) => {
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
            const chunks = []
            for await (const chunk of req) chunks.push(chunk)
            req.body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {}
          }
          const mod = await loadApiModule(server, name)
          await mod.default(req, res)
        } catch (err) {
          res.status(500).json({ error: String((err && err.message) || err) })
        }
      })
  }
  return {
    name: 'forge-api-dev',
    configureServer: mw,
    configurePreviewServer: mw,
  }
}

export default defineConfig(({ mode }) => {
  Object.assign(process.env, loadEnv(mode, process.cwd(), ''))
  return { plugins: [react(), apiDevPlugin()] }
})
