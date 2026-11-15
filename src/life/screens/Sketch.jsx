// Sketch: a freehand canvas with Apple Pencil pressure, for the note inspector's Sketch slot (R2-19).
//
//   <Sketch onExport width height />
//
//   onExport  optional (blob: Blob) -> void; called with a PNG of the drawing when "Export PNG" is
//             pressed. The parent decides what to do with it; this component stores nothing.
//   width     logical canvas width in px (default 480); the canvas displays at 100% of its
//             container and scales, so a stroke lands where the pointer is at any display size
//   height    logical canvas height in px (default 320)
//
// Drawing lives in memory only: strokes are kept as point lists (see sketchLogic.js), so undo
// drops the last stroke. Persistence is a later decision (D17: a separate synced collection,
// never inside notes); nothing here touches the store or sync.
//
// Pointer Events on a native <canvas>: a pen's `pressure` drives the line width; a mouse or finger
// draws at a neutral width. `touch-action: none` is set on the canvas element only, so a swipe
// anywhere else on the page still scrolls and only a touch that starts on the canvas draws.
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  MAX_WIDTH,
  pointerPressure,
  startStroke,
  appendPoint,
  undoLastStroke,
  clearStrokes,
  strokeSegments,
  toCanvasPoint,
} from '../sketchLogic.js'

const PAPER = '#ffffff'
const PEN_COLORS = [
  { name: 'ink', value: '#1c1c1e' },
  { name: 'red', value: '#d93025' },
  { name: 'blue', value: '#1a56db' },
  { name: 'green', value: '#1e8e3e' },
]
const PEN_SIZES = [
  { name: 'fine', value: 4 },
  { name: 'medium', value: MAX_WIDTH },
  { name: 'broad', value: 14 },
]
const ERASER = 'eraser'

function paintSegments(ctx, stroke, color) {
  ctx.strokeStyle = color
  ctx.fillStyle = color
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  for (const { from, to, width } of strokeSegments(stroke)) {
    if (from === to) {
      ctx.beginPath()
      ctx.arc(from.x, from.y, width / 2, 0, Math.PI * 2)
      ctx.fill()
    } else {
      ctx.lineWidth = width
      ctx.beginPath()
      ctx.moveTo(from.x, from.y)
      ctx.lineTo(to.x, to.y)
      ctx.stroke()
    }
  }
}

export default function Sketch({ onExport, width = 480, height = 320 }) {
  const canvasRef = useRef(null)
  const strokesRef = useRef([])
  const activeRef = useRef(null) // the pointerId currently drawing, or null
  const [count, setCount] = useState(0)
  const [color, setColor] = useState(PEN_COLORS[0].value)
  const [size, setSize] = useState(PEN_SIZES[1].value)
  const [erasing, setErasing] = useState(false)

  const redraw = useCallback(() => {
    const canvas = canvasRef.current
    const ctx = canvas && canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.fillStyle = PAPER
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    const dpr = canvas.width / width
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    for (const stroke of strokesRef.current) paintSegments(ctx, stroke, stroke.color)
  }, [width])

  // Size the backing store for the screen's pixel density so lines stay crisp on a retina iPad.
  useEffect(() => {
    const canvas = canvasRef.current
    const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1))
    canvas.width = Math.round(width * dpr)
    canvas.height = Math.round(height * dpr)
    redraw()
  }, [width, height, redraw])

  function point(e) {
    const canvas = canvasRef.current
    const { x, y } = toCanvasPoint(e.clientX, e.clientY, canvas.getBoundingClientRect(), width, height)
    return { x, y, p: pointerPressure(e.pointerType, e.pressure) }
  }

  function paintLatest() {
    const ctx = canvasRef.current.getContext('2d')
    const strokes = strokesRef.current
    const last = strokes[strokes.length - 1]
    const pts = last.points
    // Only the newest segment is painted; redraw() replays everything for undo / clear.
    const tail = { ...last, points: pts.length > 1 ? pts.slice(-2) : pts }
    paintSegments(ctx, tail, last.color)
  }

  function onPointerDown(e) {
    if (activeRef.current !== null) return
    if (e.pointerType === 'mouse' && e.button !== 0) return
    activeRef.current = e.pointerId
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      // Capture is only a nicety (keeps a stroke going if the pen leaves the canvas); it throws for
      // a pointer the browser does not know, e.g. a synthetic event. Drawing carries on without it.
    }
    const brush = { color: erasing ? PAPER : color, size: erasing ? Math.max(size, 14) : size }
    strokesRef.current = startStroke(strokesRef.current, brush, point(e))
    setCount(strokesRef.current.length)
    paintLatest()
  }

  function onPointerMove(e) {
    if (activeRef.current !== e.pointerId) return
    // A pen can report faster than frames paint; the coalesced events are the in-between samples.
    const events = e.nativeEvent.getCoalescedEvents?.() ?? []
    for (const ev of events.length ? events : [e.nativeEvent]) {
      const canvas = canvasRef.current
      const { x, y } = toCanvasPoint(ev.clientX, ev.clientY, canvas.getBoundingClientRect(), width, height)
      strokesRef.current = appendPoint(strokesRef.current, {
        x,
        y,
        p: pointerPressure(e.pointerType, ev.pressure),
      })
      paintLatest()
    }
  }

  function endStroke(e) {
    if (activeRef.current !== e.pointerId) return
    activeRef.current = null
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      // Already released (pointercancel) or never captured.
    }
  }

  function undo() {
    strokesRef.current = undoLastStroke(strokesRef.current)
    setCount(strokesRef.current.length)
    redraw()
  }

  function clear() {
    strokesRef.current = clearStrokes()
    setCount(0)
    redraw()
  }

  function exportPng() {
    canvasRef.current.toBlob((blob) => {
      if (blob && onExport) onExport(blob)
    }, 'image/png')
  }

  return (
    <div className="sketch" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <canvas
        ref={canvasRef}
        aria-label="Sketch canvas"
        data-strokes={count}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endStroke}
        onPointerCancel={endStroke}
        onContextMenu={(e) => e.preventDefault()}
        style={{
          width: '100%',
          aspectRatio: `${width} / ${height}`,
          background: PAPER,
          border: '1px solid var(--border, #ccc)',
          borderRadius: 8,
          // The only element that opts out of browser panning: a touch that starts on the canvas
          // draws, a touch anywhere else on the page scrolls as normal.
          touchAction: 'none',
          userSelect: 'none',
          WebkitUserSelect: 'none',
          WebkitTouchCallout: 'none',
        }}
      />
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <div role="group" aria-label="Pen colour" style={{ display: 'flex', gap: 6 }}>
          {PEN_COLORS.map((c) => (
            <button
              key={c.name}
              type="button"
              aria-label={c.name}
              aria-pressed={!erasing && color === c.value}
              onClick={() => {
                setColor(c.value)
                setErasing(false)
              }}
              style={{
                width: 24,
                height: 24,
                borderRadius: '50%',
                background: c.value,
                border: !erasing && color === c.value ? '2px solid var(--text-primary, #000)' : '2px solid transparent',
                cursor: 'pointer',
                padding: 0,
              }}
            />
          ))}
        </div>
        <div role="group" aria-label="Pen size" style={{ display: 'flex', gap: 4 }}>
          {PEN_SIZES.map((s) => (
            <button
              key={s.name}
              type="button"
              className={`chip${size === s.value ? '' : ' chip-muted'}`}
              style={{ cursor: 'pointer', border: 'none' }}
              aria-pressed={size === s.value}
              onClick={() => setSize(s.value)}
            >
              {s.name}
            </button>
          ))}
        </div>
        <button
          type="button"
          className={`chip${erasing ? '' : ' chip-muted'}`}
          style={{ cursor: 'pointer', border: 'none' }}
          aria-pressed={erasing}
          onClick={() => setErasing((v) => !v)}
        >
          {ERASER}
        </button>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" className="btn btn-ghost btn-sm" onClick={undo} disabled={count === 0}>
          Undo
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={clear} disabled={count === 0}>
          Clear
        </button>
        {onExport && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={exportPng} disabled={count === 0}>
            Export PNG
          </button>
        )}
      </div>
    </div>
  )
}
