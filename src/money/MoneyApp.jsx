import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { MoneyProvider, useMoney, useMoneyOptional } from './MoneyContext.jsx'
import AddTxnSheet from './AddTxnSheet.jsx'
import SubNav from '../ui/SubNav.jsx'
import { InspectorProvider, InspectorPane } from '../shell/Inspector.jsx'
import { useInspector } from '../shell/inspectorContext.js'
import { MONEY_SCREENS } from './index.js'
import CaptureSheet from '../capture/CaptureSheet.jsx'
import { submitDraft } from '../capture/submit.js'
import { initialCaptureState, openCapture } from '../capture/captureContext.js'
import { isPuzzleDone } from '../capture/panels/logic.js'
import { useLifeOptional } from '../life/LifeData.jsx'
import { dateKey } from '../life/logic.js'
import { solvedToday } from '../logic/stats.js'
import { getProgress, mutateNotes, mutateProgress } from '../store.js'
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
  // Reuse a provider already mounted above (the shell's); never run two copies of the state.
  const outer = useMoneyOptional()
  const body = (
    <InspectorProvider>
      <MoneyBody />
    </InspectorProvider>
  )
  if (outer) return body
  return <MoneyProvider syncTick={syncTick}>{body}</MoneyProvider>
}

// The app's capture host: builds the writers and panel data from the Life and Money
// providers mounted above it, then renders the sheet. It lives in this lazy chunk (not in
// CaptureSheet.jsx, which node tests bundle without the store) so none of it, nor MoneyContext,
// is in the entry chunk. Writers are `(updater) => Promise`, see submit.js.
export function CaptureHost({ open, onClose, type, route, txnType, returnFocusRef }) {
  const life = useLifeOptional()
  const money = useMoneyOptional()
  const [progress, setProgress] = useState({})
  const lifeRef = useRef(life)
  lifeRef.current = life
  const moneyRef = useRef(money)
  moneyRef.current = money

  useEffect(() => {
    if (!open) return undefined
    let cancelled = false
    getProgress().then((p) => { if (!cancelled) setProgress(p || {}) }).catch(() => {})
    return () => { cancelled = true }
  }, [open])

  const writers = useMemo(() => {
    const needLife = () => {
      if (!lifeRef.current) throw new Error('Still loading. Try again in a moment.')
      return lifeRef.current
    }
    const needMoney = () => {
      const m = moneyRef.current
      // Writing before the first load would replace stored data with an empty list.
      if (!m || !m.ready) throw new Error('Still loading. Try again in a moment.')
      return m
    }
    return {
      expenses: (upd) => { const m = needMoney(); return m.persistExpenses(upd(m.expensesRef.current)) },
      dailyLog: (upd) => needMoney().updateDailyLog(upd),
      notes: (upd) => mutateNotes(upd),
      tasks: (upd) => needLife().updateTasks(upd),
      reminders: (upd) => needLife().updateReminders(upd),
      habits: (upd) => needLife().updateHabits(upd),
      moodLog: (upd) => needLife().updateMoodLog(upd),
      progress: (upd) => mutateProgress(upd),
    }
  }, [])

  const now = life?.now ?? new Date()
  const data = useMemo(() => {
    const today = dateKey(now)
    const entry = (life?.moodLog || []).find((e) => e.date === today)
    const expenses = money?.expenses || []
    const recent = [...new Set([...expenses].sort((a, b) => b.date - a.date).map((e) => e.category).filter(Boolean))].slice(0, 6)
    const people = [...new Set(expenses.map((e) => e.person).filter(Boolean))]
    return {
      habits: life?.habits || [],
      solvedToday: solvedToday(progress, now.getTime()),
      puzzleDone: isPuzzleDone(money?.dailyLog, now.getTime()),
      mood: entry && entry.source === 'logged' ? entry.valence : null,
      recentCategories: recent,
      people,
      now: now.getTime(),
    }
  }, [life, money, progress, now])

  // The sheet opens on the asked type, else the screen's default (captureContext).
  const defaultType = useMemo(
    () => openCapture(initialCaptureState(), route, { type }).type,
    [route, type],
  )

  const onSubmit = useCallback((draft) => submitDraft(draft, writers, { now: new Date() }), [writers])

  return (
    <CaptureSheet
      open={open}
      onClose={onClose}
      defaultType={defaultType}
      txnType={txnType}
      onSubmit={onSubmit}
      data={data}
      returnFocusRef={returnFocusRef}
    />
  )
}
