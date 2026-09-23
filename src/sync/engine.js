// Side-effecting sync glue, extracted out of store.js so it can be unit
// tested with fake db/cloud instead of real localforage + supabase.
// See sync/logic.js for the pure decision rules this drives.
import { readLocalShape, wrapForSave, decideSync } from './logic.js'

export function createSyncEngine({ db, cloud, now = Date.now, onLocalWriteError }) {
  const pushTimers = {}
  // key -> last wrapped value not yet confirmed pushed. Read by reconcileKey
  // so an incoming pull can't clobber an edit that's still in flight.
  const pending = new Map()
  const failed = new Set()
  const statusListeners = new Set()
  const mutateQueues = new Map()

  function emitStatus() {
    const isFailed = failed.size > 0
    statusListeners.forEach((fn) => fn(isFailed))
  }

  function setKeyFailed(key, isFailed) {
    const had = failed.has(key)
    if (isFailed) failed.add(key)
    else failed.delete(key)
    if (had !== failed.has(key)) emitStatus()
  }

  function onStatusChange(fn) {
    statusListeners.add(fn)
    fn(failed.size > 0)
    return () => statusListeners.delete(fn)
  }

  async function readLocal(key) {
    return readLocalShape(await db.getItem(key))
  }

  async function pushToCloud(key, wrapped) {
    const { data } = await cloud.getSession()
    const userId = data.session?.user?.id
    if (!userId) throw new Error('no session')
    await cloud.write(key, userId, wrapped)
  }

  async function pushPendingIfAny(key) {
    const wrapped = pending.get(key)
    if (!wrapped) return false
    await pushToCloud(key, wrapped)
    if (pending.get(key) === wrapped) pending.delete(key)
    return true
  }

  async function doPush(key) {
    try {
      const pushed = await pushPendingIfAny(key)
      if (pushed) setKeyFailed(key, false)
    } catch {
      setKeyFailed(key, true)
    }
  }

  function schedulePush(key, delay = 700) {
    clearTimeout(pushTimers[key])
    pushTimers[key] = setTimeout(() => doPush(key), delay)
  }

  async function get(key, fallback) {
    const local = await readLocal(key)
    return local ? local.data : fallback
  }

  async function save(key, data) {
    const wrapped = wrapForSave(data, now)
    pending.set(key, wrapped)
    try {
      await db.setItem(key, wrapped)
    } catch (err) {
      setKeyFailed(key, true)
      onLocalWriteError?.(key, err)
    }
    schedulePush(key)
  }

  // Serialized read-modify-write per key, so two rapid mutations on the same
  // key can't interleave and drop one (e.g. markProblem, reminder toggles).
  function mutate(key, fn, fallback) {
    const prev = mutateQueues.get(key) || Promise.resolve()
    const next = prev
      .then(() => get(key, fallback))
      .then((current) => fn(current))
      .then(async (updated) => {
        await save(key, updated)
        return updated
      })
    mutateQueues.set(key, next.then(() => undefined, () => undefined))
    return next
  }

  async function reconcileKey(key) {
    const local = await readLocal(key)
    try {
      const { data: sessionData } = await cloud.getSession()
      const userId = sessionData.session?.user?.id
      if (!userId) return 'noop'
      const row = await cloud.read(key, userId)
      const decision = decideSync(local, row)
      if (decision.action === 'pull') {
        if (pending.has(key)) {
          // an edit is still in flight — don't let the pull erase it, push instead
          await pushPendingIfAny(key)
          setKeyFailed(key, false)
          return 'push'
        }
        if (local && local.updatedAt === 0) {
          await db.setItem(`${key}__pre_sync_backup`, local)
        }
        await db.setItem(key, decision.value)
      } else if (decision.action === 'push') {
        await pushToCloud(key, decision.value)
      }
      setKeyFailed(key, false)
      return decision.action
    } catch {
      setKeyFailed(key, true)
      return 'noop'
    }
  }

  async function reconcileAll(keys) {
    await Promise.all(keys.map(reconcileKey))
  }

  async function flush() {
    const keys = Object.keys(pushTimers)
    keys.forEach((k) => clearTimeout(pushTimers[k]))
    await Promise.all([...pending.keys()].map(doPush))
  }

  async function claimOwner(userId) {
    if (!userId) return
    const prevOwner = await db.getItem('__owner')
    if (prevOwner != null && prevOwner !== userId) {
      await db.clear()
    }
    await db.setItem('__owner', userId)
  }

  return { get, save, mutate, reconcileKey, reconcileAll, flush, onStatusChange, claimOwner }
}
