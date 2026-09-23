import { createContext, useContext, useState } from 'react'
import {
  DndContext, PointerSensor, KeyboardSensor, useSensor, useSensors, useDroppable, closestCorners, pointerWithin,
} from '@dnd-kit/core'
import {
  SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

const DragCtx = createContext(null)
export const useDragging = () => useContext(DragCtx)

// Only items/containers of the dragged item's `type` are valid targets. Under the pointer the
// smallest target wins (a nest strip beats the row containing it); otherwise nearest corners.
function sameType(args) {
  const a = {
    ...args,
    droppableContainers: args.droppableContainers.filter(
      (c) => c.data.current?.type === args.active.data.current?.type
    ),
  }
  const hits = pointerWithin(a)
  if (!hits.length) return closestCorners(a)
  const area = (h) => {
    const r = args.droppableRects.get(h.id)
    return r.width * r.height
  }
  return [hits.reduce((m, h) => (area(h) < area(m) ? h : m))]
}

// Calls onMove({ type, id, from, to, overId, after }) after a drop. `overId` is null when
// dropped on an (empty) container itself; `after` says which side of overId to insert on.
export function DndArea({ onMove, children }) {
  const [dragging, setDragging] = useState(null)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  function end({ active, over }) {
    setDragging(null)
    if (!over || active.id === over.id) return
    const a = active.data.current
    const o = over.data.current
    const from = a.sortable.containerId
    const isContainer = !!o?.container
    const to = isContainer ? over.id : o.sortable.containerId
    const overId = isContainer ? null : over.id
    let after = false
    if (overId != null) {
      const at = active.rect.current.translated
      after = from === to
        ? a.sortable.index < o.sortable.index
        : !!at && at.top + at.height / 2 > over.rect.top + over.rect.height / 2
    }
    onMove({ type: a.type, id: active.id, from, to, overId, after })
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={sameType}
      onDragStart={({ active }) => setDragging({ id: active.id, type: active.data.current?.type })}
      onDragEnd={end}
      onDragCancel={() => setDragging(null)}
    >
      <DragCtx.Provider value={dragging}>{children}</DragCtx.Provider>
    </DndContext>
  )
}

export function DropList({ id, type, items, dropDisabled, style, children }) {
  const dragging = useDragging()
  const { setNodeRef, isOver } = useDroppable({ id, disabled: dropDisabled, data: { type, container: true } })
  const active = dragging?.type === type
  return (
    <div
      ref={setNodeRef}
      className={active && isOver && !dropDisabled ? 'drop-over' : undefined}
      style={{ ...(active && !dropDisabled ? { minHeight: 28 } : null), ...style }}
    >
      <SortableContext id={id} items={items} strategy={verticalListSortingStrategy}>
        {children}
      </SortableContext>
    </div>
  )
}

export function DropZone({ id, type, label }) {
  const { setNodeRef, isOver } = useDroppable({ id, data: { type, container: true } })
  return (
    <div ref={setNodeRef} className={`drop-strip${isOver ? ' drop-over' : ''}`}>
      {label}
    </div>
  )
}

// children: node, or (handle) => node when the row wants to place the handle itself.
export function SortableRow({ id, type, disabled, children }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id, disabled, data: { type },
  })
  const handle = disabled ? null : (
    <button type="button" className="drag-handle" aria-label="Drag to reorder" {...attributes} {...listeners}>
      ⠿
    </button>
  )
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Translate.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
        position: 'relative',
        zIndex: isDragging ? 5 : undefined,
      }}
    >
      {typeof children === 'function' ? children(handle) : children}
    </div>
  )
}
