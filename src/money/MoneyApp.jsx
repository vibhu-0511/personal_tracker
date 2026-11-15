import { useLayoutEffect, useState } from 'react'
import { MoneyProvider, useMoney } from './MoneyContext.jsx'
import AddTxnSheet from './AddTxnSheet.jsx'
import SubNav from '../ui/SubNav.jsx'
import { InspectorProvider, InspectorPane } from '../shell/Inspector.jsx'
import { useInspector } from '../shell/inspectorContext.js'
import { MONEY_SCREENS } from './index.js'
import './money.css'

// Drop-in replacement for the Expenses default export: same {syncTick} prop.
// Mounts the provider, a local sub-nav over MONEY_SCREENS, the shared edit
// sheet (add goes to the global plus). The shell can instead render MONEY_SCREENS itself.
//
// Detail views (a transaction, a goal, a loan person) open through useInspector().open(node):
// in the right-hand pane from 1024px of the `app` container, in the shell Sheet below that.
// The pane column lives here (money.css) because the shell mounts no inspector slot for Money
// yet; the provider sits inside MoneyProvider so the opened nodes can call useMoney().

// The global plus (shell Fab) owns adding. + Expense / + Income on Spend call openAdd(type);
// here that request is handed to the app's capture sheet through a cancelable window event
// ('forge:open-capture', detail { type: 'expense', txnType }). A listener claims it with
// preventDefault(); if nothing claims it the request stays and AddTxnSheet opens as before.
// Editing an existing transaction (mode 'edit') always uses AddTxnSheet.
export const OPEN_CAPTURE_EVENT = 'forge:open-capture'

function requestCapture(txnType) {
  try {
    const ev = new CustomEvent(OPEN_CAPTURE_EVENT, {
      cancelable: true,
      detail: { type: 'expense', txnType },
    })
    return window.dispatchEvent(ev) === false
  } catch {
    return false
  }
}

const NAV_ITEMS = MONEY_SCREENS.map(({ id, label, icon }) => ({ id, label, icon }))

function MoneyBody() {
  const { sheetRequest, closeSheet } = useMoney()
  const { node, close } = useInspector()
  const [view, setView] = useState(MONEY_SCREENS[0].id)
  const active = MONEY_SCREENS.find((s) => s.id === view) || MONEY_SCREENS[0]
  const Screen = active.Component

  // Hand add requests to global capture before the add sheet paints.
  useLayoutEffect(() => {
    if (sheetRequest?.mode !== 'add') return
    if (requestCapture(sheetRequest.type === 'income' ? 'income' : 'expense')) closeSheet()
  }, [sheetRequest, closeSheet])

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
