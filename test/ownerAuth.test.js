import test from 'node:test'
import assert from 'node:assert/strict'
import { isOwner, extractBearerToken } from '../api/_lib/auth.js'

const req = (authorization) => ({ headers: authorization === undefined ? {} : { authorization } })
const env = { OWNER_USER_ID: 'owner-1' }

test('extractBearerToken strips the scheme case-insensitively', () => {
  assert.equal(extractBearerToken(req('Bearer abc')), 'abc')
  assert.equal(extractBearerToken(req('bearer abc')), 'abc')
  assert.equal(extractBearerToken(req(undefined)), '')
  assert.equal(extractBearerToken({}), '')
})

test('accepts when the injected verifier returns the owner id', async () => {
  let seen
  const verifier = async (t) => { seen = t; return 'owner-1' }
  assert.equal(await isOwner(req('Bearer tok'), { env, verifier }), true)
  assert.equal(seen, 'tok')
})

test('accepts a verifier that returns { id }', async () => {
  assert.equal(await isOwner(req('Bearer t'), { env, verifier: async () => ({ id: 'owner-1' }) }), true)
})

test('rejects a different user', async () => {
  assert.equal(await isOwner(req('Bearer t'), { env, verifier: async () => 'someone-else' }), false)
})

test('fail-closed when OWNER_USER_ID is missing or empty, without calling the verifier', async () => {
  let called = false
  const verifier = async () => { called = true; return 'owner-1' }
  assert.equal(await isOwner(req('Bearer t'), { env: {}, verifier }), false)
  assert.equal(await isOwner(req('Bearer t'), { env: { OWNER_USER_ID: '' }, verifier }), false)
  assert.equal(called, false)
})

test('fail-closed when the token is missing, without calling the verifier', async () => {
  let called = false
  const verifier = async () => { called = true; return 'owner-1' }
  assert.equal(await isOwner(req(undefined), { env, verifier }), false)
  assert.equal(await isOwner(req('Bearer '), { env, verifier }), false)
  assert.equal(called, false)
})

test('fail-closed when the verifier throws or returns nothing', async () => {
  assert.equal(await isOwner(req('Bearer t'), { env, verifier: async () => { throw new Error('boom') } }), false)
  assert.equal(await isOwner(req('Bearer t'), { env, verifier: async () => null }), false)
  assert.equal(await isOwner(req('Bearer t'), { env, verifier: async () => undefined }), false)
})

test('default verifier is fail-closed without Supabase env (no network)', async () => {
  assert.equal(await isOwner(req('Bearer t'), { env }), false)
})
