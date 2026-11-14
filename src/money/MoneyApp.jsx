import { useState } from 'react'
import { MoneyProvider, useMoney } from './MoneyContext.jsx'
import AddTxnSheet from './AddTxnSheet.jsx'
import SubNav from '../ui/SubNav.jsx'
import { InspectorProvider, InspectorPane } from '../shell/Inspector.jsx'
import { useInspector } from '../shell/inspectorContext.js'
import { MONEY_SCREENS } from './index.js'
import './money.css'

// Drop-in replacement for the Expenses default export: same {syncTick} prop.
// Mounts the provider, a local sub-nav over MONEY_SCREENS, the shared add/edit
// sheet and the FAB. The shell can instead render MONEY_SCREENS itself.
//
// Detail views (a transaction, a goal, a loan person) open through useInspector().open(node):
// in the right-hand pane from 1024px of the `app` container, in the shell Sheet below that.
// The pane column lives here (money.css) because the shell mounts no inspector slot for Money
// yet; the provider sits inside MoneyProvider so the opened nodes can call useMoney().

const NAV_ITEMS = MONEY_SCREENS.map(({ id, label, icon }) => ({ id, label, icon }))

function MoneyBody() {
  const { openAdd } = useMoney()
  const { node, close } = useInspector()
  const [view, setView] = useState(MONEY_SCREENS[0].id)
  const active = MONEY_SCREENS.find((s) => s.id === view) || MONEY_SCREENS[0]
  const Screen = active.Component

  // A detail belongs to the screen that opened it.
  function changeView(id) {
    close()
    setView(id)
  }

  return (
    <div className="money-app fade-in">
      <div className="money-main">
        <SubNav items={NAV_ITEMS} value={active.id} onChange={changeView} label="Money sections" />
        <Screen />
      </div>
      <aside className="money-inspector" aria-label="Details">
        {node == null
          ? <p className="money-inspector-hint">Select a transaction, goal or person to see its details here.</p>
          : <InspectorPane label="Details" />}
      </aside>
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
      <InspectorProvider>
        <MoneyBody />
      </InspectorProvider>
    </MoneyProvider>
  )
}
