// App frame. `.app-root` is the size container (`container: app / inline-size`)
// with a fixed 100dvh height; the only scroller is the inner `.page`, so
// nothing depends on position:fixed behaving viewport-relative inside a
// container (blueprint errata E-09). Layout switches with `@container app`
// rules in shell.css and nav.css, never by device or viewport width.
//
// Slots:
//   children   page content (scrolls inside `.page`)
//   inspector  right-hand pane, shown inline from 1024px container width;
//              below that the slot is hidden and R1-08's Sheet takes over
//   toasts     toast host element (rendered inside the shell so it inherits
//              the --tabbar-h override of the rail and sidebar layouts)
//   actions    top bar actions
//   title      top bar title; defaults to the active route label
//
// The plus button (Fab) lives here so every tab has exactly one. Props:
//   onCapture(route)  called with { tab, view } when the plus is tapped; the
//                     app opens the capture sheet (captureContext.openCapture)
//   captureOpen       accepted for callers; the plus stays mounted while a sheet is open
//                     (so focus can return to it) and shell.css hides it under an open dialog
import { useLayoutEffect, useRef } from 'react'
import { useRoute } from '../router.js'
import { ROUTES } from '../routes.js'
import Nav from './Nav.jsx'
import TopBar from './TopBar.jsx'
import Fab from '../ui/Fab.jsx'

export default function Shell({ children, inspector = null, toasts = null, actions = null, title, onCapture, captureOpen = false }) {
  const route = useRoute()
  const pageRef = useRef(null)

  // A new route starts at the top; the inner scroller has no native restoration.
  useLayoutEffect(() => {
    if (pageRef.current) pageRef.current.scrollTop = 0
  }, [route.path])

  const hasInspector = inspector != null && inspector !== false
  return (
    <div className="app-root">
      <div className={`app-shell${hasInspector ? ' has-inspector' : ''}`}>
        <Nav />
        <TopBar title={title ?? ROUTES[route.tab].label}>{actions}</TopBar>
        <main className="page" id="main" ref={pageRef}>{children}</main>
        {hasInspector && (
          <aside className="inspector-slot" aria-label="Inspector">{inspector}</aside>
        )}
        <Fab label="New entry" onClick={() => onCapture?.({ tab: route.tab, view: route.view })} />
        {toasts}
      </div>
    </div>
  )
}
