import { useState } from 'react'
import { InvestProvider, useInvest } from './InvestContext.jsx'
import { INVEST_SCREENS, INVEST_DISCLAIMER, DEFAULT_INVEST_SCREEN } from './index.js'
import './invest.css'

// Drop-in replacement for the Invest default export (tabs/Invest.jsx).
// The shell router may drive navigation: pass `view` + `onViewChange` to control it,
// or `initialView` for the uncontrolled default. `initialWatchType` ("stock" | "mf" | "ipo")
// opens the Watch add form on first mount (Research -> Watch intent).
function InvestShell({ view: viewProp, onViewChange, initialView, initialWatchType = null }) {
  const { ready, error } = useInvest()
  const [localView, setLocalView] = useState(initialView || DEFAULT_INVEST_SCREEN)
  const [watchIntent, setWatchIntent] = useState(initialWatchType)

  const view = viewProp ?? localView
  const go = (id) => {
    if (onViewChange) onViewChange(id)
    if (viewProp === undefined) setLocalView(id)
  }

  if (error) {
    return (
      <div className="empty-state">
        <div className="empty-icon">⚠️</div>
        <div className="empty-text">Couldn't load Invest: {error}</div>
      </div>
    )
  }
  if (!ready) {
    return <div className="empty-state"><div className="empty-text">Loading…</div></div>
  }

  const screen = INVEST_SCREENS.find((s) => s.id === view) || INVEST_SCREENS[0]
  const Screen = screen.Component
  const screenProps =
    screen.id === 'research'
      ? { onTrack: (type) => { setWatchIntent(type); go('watch') } }
      : screen.id === 'watch'
        ? { initialType: watchIntent, onConsumeInitialType: () => setWatchIntent(null) }
        : {}

  return (
    <div className="fade-in invest-shell">
      <div className="invest-disclaimer">{INVEST_DISCLAIMER}</div>

      <div className="agent-bar">
        {INVEST_SCREENS.map((s) => (
          <button key={s.id} className={`agent-pill${screen.id === s.id ? ' active' : ''}`} onClick={() => go(s.id)}>
            <span className="agent-pill-icon">{s.icon}</span>
            {s.label}
          </button>
        ))}
      </div>

      <Screen key={screen.id} {...screenProps} />
    </div>
  )
}

export default function InvestApp({ syncTick = 0, ...shellProps }) {
  return (
    <InvestProvider syncTick={syncTick}>
      <InvestShell {...shellProps} />
    </InvestProvider>
  )
}
