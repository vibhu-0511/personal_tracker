import { test } from 'node:test'
import assert from 'node:assert/strict'
import { apiUrl, createApiFetch } from '../src/api/base.js'

test('apiUrl returns the path unchanged when base is empty', () => {
  assert.equal(apiUrl('/api/x', ''), '/api/x')
  assert.equal(apiUrl('/api/x'), '/api/x')
  assert.equal(apiUrl('/api/x', undefined), '/api/x')
})

test('apiUrl joins base and path without a double slash', () => {
  assert.equal(apiUrl('/api/x', 'https://h/'), 'https://h/api/x')
  assert.equal(apiUrl('/api/x', 'https://h'), 'https://h/api/x')
  assert.equal(apiUrl('/api/x', 'https://h//'), 'https://h/api/x')
  assert.equal(apiUrl('api/x', 'https://h/'), 'https://h/api/x')
})

function spy() {
  const calls = []
  const fetchImpl = async (url, init) => { calls.push({ url, init }); return { ok: true } }
  return { calls, fetchImpl }
}

test('apiFetch attaches Authorization when a token exists', async () => {
  const { calls, fetchImpl } = spy()
  const apiFetch = createApiFetch({ base: 'https://h/', getToken: async () => 'tok', fetchImpl })
  await apiFetch('/api/agent', { method: 'POST', headers: { 'Content-Type': 'application/json' } })
  assert.equal(calls[0].url, 'https://h/api/agent')
  assert.equal(calls[0].init.method, 'POST')
  assert.equal(calls[0].init.headers.get('Authorization'), 'Bearer tok')
  assert.equal(calls[0].init.headers.get('Content-Type'), 'application/json')
})

test('apiFetch omits Authorization when there is no token', async () => {
  for (const getToken of [async () => null, async () => undefined, async () => '', undefined]) {
    const { calls, fetchImpl } = spy()
    const apiFetch = createApiFetch({ base: '', getToken, fetchImpl })
    await apiFetch('/api/x')
    assert.equal(calls[0].url, '/api/x')
    assert.equal(calls[0].init.headers.has('Authorization'), false)
  }
})

test('apiFetch keeps a caller-supplied Authorization header', async () => {
  const { calls, fetchImpl } = spy()
  const apiFetch = createApiFetch({ getToken: async () => 'tok', fetchImpl })
  await apiFetch('/api/x', { headers: { Authorization: 'Bearer own' } })
  assert.equal(calls[0].init.headers.get('Authorization'), 'Bearer own')
})
