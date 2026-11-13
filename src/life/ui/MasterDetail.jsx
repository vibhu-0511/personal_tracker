// MasterDetail: list plus detail plus inspector panes for the Life screens.
//
//   <MasterDetail list detail inspector hasSelection onBack />
//
//   list          always rendered (the master pane)
//   detail        the selected item's body
//   inspector     focus pane that acts on the selection (stats, notes, actions)
//   hasSelection  true while an item is selected
//   onBack        called when the detail Sheet is dismissed (Escape, backdrop)
//
// Layout is chosen by `@container app` rules in life.css, never by device:
//   < 600px      list only; detail opens as a bottom Sheet
//   600-1023px   list only; detail opens as a side Sheet
//   1024-1279px  list + inspector; detail stays in the side Sheet
//   >= 1280px    list + detail + inspector, all inline
// The container name `app` is the `.app-root` container from the shell.
//
// Where the detail goes (inline pane or Sheet) cannot be decided by CSS alone,
// because a modal <dialog> must not be opened while the inline pane shows the
// same content. So the same 1280px threshold is measured against `.app-root`
// here, exactly as Inspector.jsx does for its own breakpoint. If you change
// 1280px in life.css, change DETAIL_INLINE_MIN to match.
import { useEffect, useState } from 'react'
import Sheet from '../../Sheet.jsx'

const DETAIL_INLINE_MIN = 1280

function useDetailInline() {
  const [inline, setInline] = useState(false)
  useEffect(() => {
    const el = typeof document === 'undefined' ? null : document.querySelector('.app-root')
    const measure = () => setInline((el ? el.clientWidth : window.innerWidth) >= DETAIL_INLINE_MIN)
    measure()
    if (el && typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(measure)
      ro.observe(el)
      return () => ro.disconnect()
    }
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [])
  return inline
}

export default function MasterDetail({ list, detail = null, inspector = null, hasSelection = false, onBack }) {
  const inline = useDetailInline()
  const showDetail = hasSelection && detail != null
  const hasInspector = inspector != null && inspector !== false

  return (
    <div className={`md-root${detail == null ? ' md-root--solo' : ''}`} data-selected={hasSelection ? 'true' : 'false'}>
      <section className="md-list" aria-label="List">{list}</section>
      {inline && detail != null && (
        <section className="md-detail" aria-label="Detail">
          {showDetail ? detail : null}
        </section>
      )}
      {hasInspector && (
        <aside className="md-inspector" aria-label="Inspector">{inspector}</aside>
      )}
      {!inline && (
        <Sheet
          open={showDetail}
          onClose={() => { if (hasSelection && onBack) onBack() }}
          variant="side"
          className="md-sheet"
        >
          {showDetail ? (
            <div className="md-sheet-body">
              {onBack && (
                <button type="button" className="md-back" onClick={onBack}>Back</button>
              )}
              {detail}
            </div>
          ) : null}
        </Sheet>
      )}
    </div>
  )
}
