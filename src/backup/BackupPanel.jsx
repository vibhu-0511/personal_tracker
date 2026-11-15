import { useRef, useState } from 'react'
import { exportBackupJson, importBackup, BackupError } from './backup.js'
import { emitStoreKey } from '../storeEvents.js'
import { showToast } from '../toast.js'

// Export/Import buttons for the Settings sheet. Import never overwrites
// existing local data unless the user explicitly confirms it.
export default function BackupPanel() {
  const fileRef = useRef(null)
  const [busy, setBusy] = useState(false)

  async function onExport() {
    setBusy(true)
    try {
      const json = await exportBackupJson()
      const blob = new Blob([json], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `forge-backup-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(url)
      showToast('Backup exported')
    } catch {
      showToast('Could not export backup')
    } finally {
      setBusy(false)
    }
  }

  async function onFile(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setBusy(true)
    try {
      const text = await file.text()
      let keys
      try {
        keys = await importBackup(text)
      } catch (err) {
        if (err instanceof BackupError && err.code === 'exists') {
          if (!window.confirm(`${err.message}\n\nReplace existing data with this backup?`)) return
          keys = await importBackup(text, { overwrite: true })
        } else {
          throw err
        }
      }
      keys.forEach(emitStoreKey)
      showToast(`Imported ${keys.length} items from backup`)
    } catch (err) {
      showToast(err instanceof BackupError ? err.message : 'Could not import backup')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="backup-panel">
      <button type="button" className="btn btn-sm" onClick={onExport} disabled={busy}>
        Export backup
      </button>
      <button type="button" className="btn btn-sm" onClick={() => fileRef.current?.click()} disabled={busy}>
        Import backup
      </button>
      <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={onFile} />
    </div>
  )
}
