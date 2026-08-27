import { useEffect, useState } from 'react'

export default function App() {
  const [health, setHealth] = useState('checking...')
  useEffect(() => {
    fetch('/api/health')
      .then((r) => r.json())
      .then((j) => setHealth(JSON.stringify(j)))
      .catch((e) => setHealth('ERROR: ' + e.message))
  }, [])
  return (
    <div className="wrap">
      <h1>Forge</h1>
      <div className="card">api/health: {health}</div>
    </div>
  )
}
