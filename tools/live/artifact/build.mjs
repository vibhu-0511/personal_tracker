#!/usr/bin/env node
// Builds the standalone Artifact page (no server) from the same UI the live server serves.
//   node tools/live/artifact/build.mjs <out.html> [session_id] [branch]
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const live = path.resolve(here, '..')
const root = path.resolve(live, '..', '..')
const [out, session = 'session_01T1mhHa2P7qHUqNNWGzmkKo', branch = 'claude/dazzling-galileo-03l67t'] = process.argv.slice(2)
if (!out) { console.error('usage: build.mjs <out.html> [session_id] [branch]'); process.exit(2) }

const ui = fs.readFileSync(path.join(live, 'ui/index.html'), 'utf8')
const graph = fs.readFileSync(path.join(live, 'lib/graph.mjs'), 'utf8').replace(/^export /gm, '')
const adapter = fs.readFileSync(path.join(here, 'adapter.js'), 'utf8').replace('@@SESSION@@', session).replace('@@BRANCH@@', branch)
const planRaw = JSON.parse(fs.readFileSync(path.join(root, 'docs/plan/plan.json'), 'utf8'))
const plan = {
  phases: planRaw.phases.map(x => ({ id: x.id, name: x.name, goal: x.goal })),
  tasks: planRaw.tasks.map(t => ({ id: t.id, p: t.phase, w: t.wave, t: t.title, s: t.size, o: t.owner || '', u: t.urgent ? 1 : 0, d: t.deps || [], wr: t.writes || [], a: t.acceptance })),
}

let style = /<style>([\s\S]*?)<\/style>/.exec(ui)[1]
// light theme must also apply when the viewer picks it explicitly (data-theme="light")
const light = /@media \(prefers-color-scheme: light\)\{:root:not\(\[data-theme="dark"\]\)\{([\s\S]*?)\}\}/.exec(style)
if (light) style += `\n:root[data-theme="light"]{${light[1]};color-scheme:light}`
style = style.replace(/14px max\(14px/g, '16px max(16px').replace(/max\(14px,env/g, 'max(16px,env')
let body = /<body>([\s\S]*?)<script type="module">/.exec(ui)[1]
let js = /<script type="module">([\s\S]*?)<\/script>/.exec(ui)[1]

const swap = (marker, text) => {
  const re = new RegExp(`^.*// @@${marker}\\s*$`, 'm')
  if (!re.test(js)) throw new Error('marker missing: ' + marker)
  js = js.replace(re, () => text)
}
swap('IMPORT', graph)
swap('PLAN', `plan = JSON.parse(${JSON.stringify(JSON.stringify(plan)).replace(/</g, '\\u003c')}); dirtyBuild = true; schedule()`)
swap('DEMO', '')
swap('START', 'renderGraph(); renderTop();\n' + adapter + '\nstartCcr()')

const page = `<title>Forge Live</title>
<meta name="claude:viewport-fit-sides" content="cover">
<style>${style}</style>
${body}
<script type="module">${js}</script>
`
fs.writeFileSync(out, page)
try { new Function(js.replace(/^\s*import .*$/gm, '')); } catch (e) { console.error('script syntax error:', e.message); process.exit(1) }
console.log(`wrote ${out} (${(page.length / 1024).toFixed(0)} KB)`)
