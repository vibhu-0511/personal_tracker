import test from 'node:test'
import assert from 'node:assert/strict'
import {
  requestPersistence,
  getStorageEstimate,
  initStoragePersistence,
} from '../src/platform/persist.js'

const supported = ({ persisted = false, grant = true, usage = 25, quota = 100 } = {}) => ({
  storage: {
    persisted: async () => persisted,
    persist: async () => grant,
    estimate: async () => ({ usage, quota }),
  },
})

const rejecting = () => ({
  storage: {
    persisted: async () => { throw new Error('persisted boom') },
    persist: async () => { throw new Error('persist boom') },
    estimate: async () => { throw new Error('estimate boom') },
  },
})

const throwingSync = () => ({
  storage: {
    persist() { throw new Error('sync boom') },
    estimate() { throw new Error('sync boom') },
  },
})

test('requestPersistence resolves true when the browser grants it', async () => {
  assert.equal(await requestPersistence(supported({ grant: true })), true)
})

test('requestPersistence resolves false when the browser denies it', async () => {
  assert.equal(await requestPersistence(supported({ grant: false })), false)
})

test('requestPersistence skips persist() when already persisted', async () => {
  let asked = false
  const nav = supported({ persisted: true })
  nav.storage.persist = async () => { asked = true; return true }
  assert.equal(await requestPersistence(nav), true)
  assert.equal(asked, false)
})

test('requestPersistence works without storage.persisted()', async () => {
  const nav = { storage: { persist: async () => true } }
  assert.equal(await requestPersistence(nav), true)
})

test('unsupported environments never throw and report nothing', async () => {
  for (const nav of [null, {}, { storage: null }, { storage: {} }]) {
    assert.equal(await requestPersistence(nav), false)
    assert.deepEqual(await getStorageEstimate(nav), {
      supported: false, usage: null, quota: null, percent: null,
    })
    assert.deepEqual(await initStoragePersistence(nav), {
      persisted: false, supported: false, usage: null, quota: null, percent: null,
    })
  }
})

test('rejecting and throwing storage APIs never throw', async () => {
  for (const nav of [rejecting(), throwingSync()]) {
    assert.equal(await requestPersistence(nav), false)
    assert.equal((await getStorageEstimate(nav)).supported, false)
    const all = await initStoragePersistence(nav)
    assert.equal(all.persisted, false)
    assert.equal(all.supported, false)
  }
})

test('a throwing navigator.storage getter never throws', async () => {
  const nav = { get storage() { throw new Error('getter boom') } }
  assert.equal(await requestPersistence(nav), false)
  assert.equal((await getStorageEstimate(nav)).supported, false)
})

test('getStorageEstimate reports usage, quota and percent', async () => {
  assert.deepEqual(await getStorageEstimate(supported({ usage: 25, quota: 100 })), {
    supported: true, usage: 25, quota: 100, percent: 25,
  })
})

test('getStorageEstimate tolerates missing or bad fields', async () => {
  const nav = { storage: { estimate: async () => ({ usage: 10 }) } }
  assert.deepEqual(await getStorageEstimate(nav), {
    supported: true, usage: 10, quota: null, percent: null,
  })
  const zero = { storage: { estimate: async () => ({ usage: 0, quota: 0 }) } }
  assert.deepEqual(await getStorageEstimate(zero), {
    supported: true, usage: 0, quota: null, percent: null,
  })
  const empty = { storage: { estimate: async () => undefined } }
  assert.deepEqual(await getStorageEstimate(empty), {
    supported: true, usage: null, quota: null, percent: null,
  })
})

test('initStoragePersistence combines persistence and estimate', async () => {
  assert.deepEqual(await initStoragePersistence(supported({ grant: true, usage: 1, quota: 4 })), {
    persisted: true, supported: true, usage: 1, quota: 4, percent: 25,
  })
})

test('defaults to the global navigator.storage when no argument is given', async () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
  try {
    Object.defineProperty(globalThis, 'navigator', {
      value: supported({ grant: true, usage: 5, quota: 10 }),
      configurable: true,
      writable: true,
    })
    assert.equal(await requestPersistence(), true)
    assert.equal((await getStorageEstimate()).percent, 50)
    Object.defineProperty(globalThis, 'navigator', { value: undefined, configurable: true, writable: true })
    assert.equal(await requestPersistence(), false)
    assert.equal((await getStorageEstimate()).supported, false)
  } finally {
    if (original) Object.defineProperty(globalThis, 'navigator', original)
    else delete globalThis.navigator
  }
})
