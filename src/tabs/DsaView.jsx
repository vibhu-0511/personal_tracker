import { useEffect, useState } from 'react'
import '../logic/dsa.css'

// DSA mastery map, embedded as a same-origin iframe (R3-03).
// No postMessage: summary data flows through localStorage (R3-04).
// A skeleton shows until the frame's onLoad; if it has not loaded after
// LOAD_TIMEOUT_MS (or the frame reports an error) a prominent "Open in new tab"
// fallback appears. A small link to the same page is always shown.

export const DSA_SRC = '/dsa/mastery-map.html?embed=1'
export const DSA_HREF = '/dsa/mastery-map.html'
export const LOAD_TIMEOUT_MS = 8000

export default function DsaView() {
  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (loaded) return undefined
    const t = setTimeout(() => setFailed(true), LOAD_TIMEOUT_MS)
    return () => clearTimeout(t)
  }, [loaded])

  const onLoad = () => {
    setLoaded(true)
    setFailed(false)
  }

  return (
    <section className="dsa-view" aria-label="DSA mastery map">
      <div className="dsa-bar">
        <a
          className="dsa-open dsa-open-small"
          href={DSA_HREF}
          target="_blank"
          rel="noopener"
        >
          Open in new tab ↗
        </a>
      </div>

      <div className="dsa-stage">
        <iframe
          className={`dsa-frame${loaded ? ' is-loaded' : ''}`}
          src={DSA_SRC}
          title="DSA mastery map"
          onLoad={onLoad}
          onError={() => setFailed(true)}
        />

        {!loaded && !failed && (
          <div className="dsa-skeleton" role="status" aria-live="polite">
            <span className="dsa-sr">Loading DSA mastery map</span>
            <div className="dsa-skel-bar" />
            <div className="dsa-skel-block" />
            <div className="dsa-skel-block" />
            <div className="dsa-skel-block dsa-skel-short" />
          </div>
        )}

        {!loaded && failed && (
          <div className="dsa-fallback" role="alert">
            <p className="dsa-fallback-text">
              The mastery map is taking too long to load.
            </p>
            <a
              className="btn btn-sm dsa-open dsa-open-primary"
              href={DSA_HREF}
              target="_blank"
              rel="noopener"
            >
              Open in new tab
            </a>
          </div>
        )}
      </div>
    </section>
  )
}
