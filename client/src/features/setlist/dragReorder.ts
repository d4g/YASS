/**
 * Dragging a setlist row to a new place: the geometry, and the hook that runs it.
 *
 * Pointer events rather than HTML drag and drop, because the one place this has
 * to work is a phone, and native drag and drop there is either absent or a
 * long-press that the browser also wants for its own menu. Pointer events are
 * one code path for a mouse, a pen and a finger.
 *
 * A drag starts only from the row's grip, and the grip alone opts out of
 * scrolling (`touch-action: none`). Everywhere else on the row a finger still
 * scrolls the list, which was the reason the view first shipped with buttons
 * only — see `SetlistView`. The buttons stay, too: they are the keyboard's and
 * the screen reader's way to do the same thing.
 *
 * Nothing here edits the list. The drop reports `from` and `to`, the view sends
 * one move with the version it was made against, and the real order comes back
 * from YARG like every other change.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { CSSProperties, PointerEvent as ReactPointerEvent, RefObject } from 'react'

/** A row's place in the list's scrolled content, measured once when a drag starts. */
export interface RowBox {
  top: number
  height: number
}

/**
 * Where the dragged row would land, given where its top is now.
 *
 * It passes a neighbour once its leading edge — the bottom going down, the top
 * going up — crosses that neighbour's middle, so half a row of travel is enough
 * to swap, and a row never jumps before it looks as if it should. `min` and
 * `max` bound the rows it may land among: during a show, the songs already
 * played and the one playing are not places to drop.
 */
export function dropIndex(
  rows: readonly RowBox[],
  from: number,
  top: number,
  min: number,
  max: number,
): number {
  const height = rows[from]?.height ?? 0

  const middle = (i: number) => {
    const row = rows[i]
    return row === undefined ? Number.NaN : row.top + row.height / 2
  }

  let to = from

  for (let i = from + 1; i <= max; i++) {
    if (top + height > middle(i)) to = i
    else break
  }

  if (to === from) {
    for (let i = from - 1; i >= min; i--) {
      if (top < middle(i)) to = i
      else break
    }
  }

  return to
}

/** `items` with the one at `from` moved to `to`, as the setlist will be after the move. */
export function reorder<T>(items: readonly T[], from: number, to: number): T[] {
  const next = items.slice()
  const moved = next.splice(from, 1)
  next.splice(to, 0, ...moved)
  return next
}

export interface Drag {
  from: number
  to: number
  /** How far the dragged row has travelled, in pixels, scrolling included. */
  offset: number
}

/** How close to the list's edge, in pixels, the pointer has to be to scroll it. */
const EDGE = 56
/** Scroll speed at the very edge, in pixels per frame. */
const MAX_SCROLL = 14

export function useDragReorder({
  listRef,
  min,
  max,
  onDrop,
}: {
  listRef: RefObject<HTMLElement | null>
  /** The first and last index a row may be dropped at. */
  min: number
  max: number
  onDrop: (from: number, to: number) => void
}) {
  const [drag, setDrag] = useState<Drag | null>(null)

  // Everything the listeners read lives in a ref, so they are attached once
  // per drag and never see a stale render.
  const live = useRef<{
    pointerId: number
    from: number
    rows: RowBox[]
    startY: number
    startScroll: number
    lastY: number
    frame: number | null
    to: number
    offset: number
  } | null>(null)
  const detach = useRef<(() => void) | null>(null)

  const bounds = useRef({ min, max, onDrop })
  bounds.current = { min, max, onDrop }

  const update = useCallback(() => {
    const state = live.current
    const list = listRef.current
    if (!state || !list) return

    const { rows, from } = state
    const { min: lo, max: hi } = bounds.current
    const raw = state.lastY - state.startY + (list.scrollTop - state.startScroll)

    const self = rows[from]
    const first = rows[lo]
    const last = rows[hi]
    // The list changed under the drag; the drop will be refused anyway.
    if (!self || !first || !last) return

    // The row stays within the stretch it may land in, rather than being
    // dragged over history it can never join.
    const highest = first.top - self.top
    const lowest = last.top + last.height - self.height - self.top
    const offset = Math.min(lowest, Math.max(highest, raw))

    const to = dropIndex(rows, from, self.top + offset, lo, hi)

    state.offset = offset
    state.to = to
    setDrag({ from, to, offset })
  }, [listRef])

  const end = useCallback((commit: boolean) => {
    const state = live.current
    if (!state) return

    if (state.frame !== null) cancelAnimationFrame(state.frame)
    detach.current?.()
    detach.current = null
    live.current = null
    setDrag(null)

    if (commit && state.to !== state.from) bounds.current.onDrop(state.from, state.to)
  }, [])

  // A view that goes away mid-drag takes its listeners with it.
  useEffect(() => () => end(false), [end])

  /** Props for the grip of the row at `index`. */
  const gripProps = (index: number) => ({
    onPointerDown: (event: ReactPointerEvent<HTMLElement>) => {
      const list = listRef.current
      if (!list || live.current || event.button !== 0) return
      // No text selection, no native drag of the icon, no synthetic click.
      event.preventDefault()

      const rows = Array.from(list.children, (child) => {
        const row = child as HTMLElement
        return { top: row.offsetTop, height: row.offsetHeight }
      })
      if (rows.length <= index) return

      live.current = {
        pointerId: event.pointerId,
        from: index,
        rows,
        startY: event.clientY,
        startScroll: list.scrollTop,
        lastY: event.clientY,
        frame: null,
        to: index,
        offset: 0,
      }

      const onMove = (move: PointerEvent) => {
        if (move.pointerId !== live.current?.pointerId) return
        live.current.lastY = move.clientY
        update()
      }
      const onUp = (up: PointerEvent) => {
        if (up.pointerId === live.current?.pointerId) end(true)
      }
      const onCancel = (cancel: PointerEvent) => {
        if (cancel.pointerId === live.current?.pointerId) end(false)
      }
      const onKey = (key: KeyboardEvent) => {
        if (key.key === 'Escape') end(false)
      }

      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
      window.addEventListener('pointercancel', onCancel)
      window.addEventListener('keydown', onKey)
      detach.current = () => {
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        window.removeEventListener('pointercancel', onCancel)
        window.removeEventListener('keydown', onKey)
      }

      /*
       * Scrolling while held near an edge. A setlist can be longer than a
       * phone's screen, and the finger doing the dragging cannot also scroll.
       * Faster the closer it gets, so a nudge creeps and a shove travels.
       */
      const tick = () => {
        const state = live.current
        const scroller = listRef.current
        if (!state || !scroller) return

        const box = scroller.getBoundingClientRect()
        const intoTop = box.top + EDGE - state.lastY
        const intoBottom = state.lastY - (box.bottom - EDGE)
        const step =
          intoTop > 0
            ? -Math.ceil((Math.min(intoTop, EDGE) / EDGE) * MAX_SCROLL)
            : intoBottom > 0
              ? Math.ceil((Math.min(intoBottom, EDGE) / EDGE) * MAX_SCROLL)
              : 0

        if (step !== 0) {
          const before = scroller.scrollTop
          scroller.scrollTop += step
          if (scroller.scrollTop !== before) update()
        }

        state.frame = requestAnimationFrame(tick)
      }
      live.current.frame = requestAnimationFrame(tick)

      setDrag({ from: index, to: index, offset: 0 })
    },
  })

  /**
   * Where the row at `index` is drawn while a drag is on.
   *
   * The dragged row follows the pointer. The rows between where it was and
   * where it would land step aside by its height, which is what shows the gap
   * it will drop into. Transitions only while dragging: on the drop the list
   * re-renders in its new order, and an animated transform then would slide
   * each row away from the place it has just been drawn in.
   */
  const rowStyle = (index: number): CSSProperties | undefined => {
    if (!drag || !live.current) return undefined

    const height = live.current.rows[drag.from]?.height ?? 0

    if (index === drag.from) {
      return {
        transform: `translateY(${drag.offset}px)`,
        position: 'relative',
        zIndex: 10,
        boxShadow: 'var(--shadow-bar)',
      }
    }

    let shift = 0
    if (drag.from < drag.to && index > drag.from && index <= drag.to) shift = -height
    if (drag.to < drag.from && index >= drag.to && index < drag.from) shift = height

    return {
      transform: shift === 0 ? undefined : `translateY(${shift}px)`,
      transition: 'transform 160ms ease',
    }
  }

  return { drag, gripProps, rowStyle }
}
