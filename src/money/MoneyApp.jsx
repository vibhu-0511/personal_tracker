import { useState } from 'react'
import { MoneyProvider, useMoney } from './MoneyContext.jsx'
import AddTxnSheet from './AddTxnSheet.jsx'
import SubNav from '../ui/SubNav.jsx'
import { MONEY_SCREENS } from './index.js'
import './money.css'

// Drop-in replacement for the Expenses default export: same {syncTick} prop.
// Mounts the provider, a local sub-nav over MONEY_SCREENS, the shared add/edit
// sheet and the FAB. The shell can instead render MONEY_SCREENS itself.

const NAV_ITEMS = MONEY_SCREENS.map(({ id, label, icon }) => ({ id, label, icon }))

function MoneyBody() {
  const { openAdd } = useMoney()
  const [view, setView] = useState(MONEY_SCREENS[0].id)
  const active = MONEY_SCREENS.find((s) => s.id === view) || MONEY_SCREENS[0]
  const Screen = active.Component

  return (
    <div className="money-app fade-in">
      <SubNav items={NAV_ITEMS} value={active.id} onChange={setView} label="Money sections" />
      <Screen />
      <AddTxnSheet />
      <button type="button" className="money-fab" aria-label="Add transaction" onClick={() => openAdd()}>
        +
      </button>
    </div>
  )
}

export default function MoneyApp({ syncTick = 0 }) {
  return (
    <MoneyProvider syncTick={syncTick}>
      <MoneyBody />
    </MoneyProvider>
  )
}
