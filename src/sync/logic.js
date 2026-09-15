// Pure decision logic for local<->cloud reconciliation. No I/O here — see
// store.js for the side-effecting glue. Kept separate so the data-loss-
// critical branching can be unit tested without a network or localforage.

export function readLocalShape(raw) {
  if (raw == null) return null
  if (raw && typeof raw === 'object' && 'updatedAt' in raw && 'data' in raw) return raw
  return { data: raw, updatedAt: 0 } // legacy value written before sync existed
}

export function wrapForSave(data) {
  return { data, updatedAt: Date.now() }
}

// local: { data, updatedAt } | null — already passed through readLocalShape
// cloudRow: { value, updated_at: <ISO string> } | null
export function decideSync(local, cloudRow) {
  if (!cloudRow) {
    return local ? { action: 'push', value: local } : { action: 'noop' }
  }
  const cloudUpdatedAt = new Date(cloudRow.updated_at).getTime()
  if (!Number.isFinite(cloudUpdatedAt)) {
    return local ? { action: 'push', value: local } : { action: 'noop' }
  }
  if (!local || cloudUpdatedAt > local.updatedAt) {
    return { action: 'pull', value: { data: cloudRow.value, updatedAt: cloudUpdatedAt } }
  }
  if (local.updatedAt > cloudUpdatedAt) {
    return { action: 'push', value: local }
  }
  return { action: 'noop' }
}
