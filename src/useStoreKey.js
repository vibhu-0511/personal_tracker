import { useEffect, useState } from 'react'
import { subscribeStoreKey } from './storeEvents.js'

// Returns a version number that bumps every time `key` is saved locally.
// Use it as an effect dep (or alongside useHydrate deps) to re-read the key
// after a local write without remounting, e.g. useStoreKey('habits').
export function useStoreKey(key) {
  const [version, setVersion] = useState(0)
  useEffect(() => subscribeStoreKey(key, () => setVersion((v) => v + 1)), [key])
  return version
}
