/**
 * YARG's setlist, editable: the list column's other view.
 *
 * Opened from the toolbar's `setlist` button, which only exists while the host
 * runs the YARG Setlist Bridge plugin and the setlist has songs in it. It takes
 * the list column's place rather than opening over it, because it *is* a list of
 * songs and wants the same things the library does: the rows, the detail pane
 * beside it, the sheet on a phone.
 *
 * **The rows are the library's rows, restated.** Same card surface, same
 * hairlines, same cover-then-title-over-artist, the same playing treatment. The
 * library's own row lives inside a virtualised table built for four thousand
 * songs, and a setlist is at most two hundred; borrowing the look rather than
 * the component keeps each one simple. If the library row changes, this one
 * should follow it.
 *
 * **Editing follows YARG's rules, not this view's.** During a show the songs
 * already played and the one playing are history: they are drawn, dimmed or
 * washed, with no controls. Everything is decided by the plugin, and every
 * change arrives back over the event stream — this component never edits its
 * own copy of the list, so what a guest sees is always what YARG has.
 *
 * **Reordering is a drag, with buttons behind it.** A drag on a phone fights
 * the scroll it lives in, so it starts only from a grip at the row's end, and
 * the rest of the row still scrolls — see `dragReorder.ts`. Up and down stay
 * as buttons, because they are the keyboard's and the screen reader's way to
 * do the same thing; on a touch screen they step out of sight, where the grip
 * does their job and the title needs the room, and stay in the reading order.
 * Each move carries the setlist version it was made against, so two guests
 * reordering at once get a "the setlist just changed" instead of a song
 * landing somewhere nobody meant.
 *
 * **A drop shows its result straight away.** The list is YARG's, and the new
 * order only exists once YARG says so — over the tunnel that is a poll, up to
 * two seconds later. Snapping the row back to where it came from in the
 * meantime reads as the drop having failed. So the dropped order is drawn until
 * the setlist moves on from the version it was made against, or the edit is
 * refused.
 */

import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'

import type { Setlist, SetlistEditError, SetlistEntry, Song } from '@shared/types'
import { Button, cx, EmptyState } from '../../ui'
import { AlbumThumb, ArtistName, SongTitle } from '../../ui/library'
import {
  clearSetlist,
  moveInSetlist,
  removeFromSetlist,
  type SetlistEditOutcome,
} from '../../lib/api'
import { formatDuration, formatTitleCredit } from '../../lib/format'
import { reorder, useDragReorder } from './dragReorder'
import { describeSetlistError } from './messages'

/** How long the armed `clear` waits for its second press before disarming. */
const CLEAR_CONFIRM_MS = 4000

export function SetlistView({
  setlist,
  songsById,
  playingId,
  selectedId,
  onSelect,
  onClose,
}: {
  setlist: Setlist
  songsById: ReadonlyMap<string, Song>
  playingId: string | null
  selectedId: string | null
  onSelect: (song: Song) => void
  onClose: () => void
}) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<SetlistEditError | null>(null)
  const [clearArmed, setClearArmed] = useState(false)
  const disarm = useRef<number | null>(null)
  const listRef = useRef<HTMLOListElement>(null)
  /** A drop YARG has not answered yet, drawn as if it had. */
  const [dropped, setDropped] = useState<{ from: number; to: number; version: number } | null>(
    null,
  )

  useEffect(
    () => () => {
      if (disarm.current !== null) window.clearTimeout(disarm.current)
    },
    [],
  )

  const total = setlist.songs.length
  const current = setlist.mode === 'playing' ? setlist.index : null
  // YARG's own rule, restated so no control is offered that YARG will refuse.
  const firstEditable = current === null ? 0 : current + 1
  const editable = setlist.editable
  const version = setlist.version ?? undefined

  // Only while the setlist is still the one the drop was made against; any
  // newer version is YARG's answer, and it wins.
  const preview = dropped !== null && dropped.version === setlist.version ? dropped : null
  const songs = preview ? reorder(setlist.songs, preview.from, preview.to) : setlist.songs

  const run = async (edit: () => Promise<SetlistEditOutcome>) => {
    setPending(true)
    setError(null)
    const outcome = await edit()
    setPending(false)
    if (!outcome.ok) {
      setError(outcome.error)
      setDropped(null)
    }
  }

  const { drag, gripProps, rowStyle } = useDragReorder({
    listRef,
    min: firstEditable,
    max: total - 1,
    onDrop: (from, to) => {
      const entry = setlist.songs[from]
      if (entry === undefined || setlist.version === null) return
      setDropped({ from, to, version: setlist.version })
      void run(() => moveInSetlist(entry.hash, to, version))
    },
  })

  // A grip only where there is somewhere to drag to.
  const canDrag = editable && !pending && preview === null && total - firstEditable > 1

  /*
   * Two presses, because one wipes the evening's queue for everyone in the
   * room. The first arms it and says so; the second, within four seconds, is
   * the one that clears. Nothing modal: a dialog over a party app is one more
   * thing to dismiss on somebody else's phone.
   */
  const onClear = () => {
    if (!clearArmed) {
      setClearArmed(true)
      disarm.current = window.setTimeout(() => setClearArmed(false), CLEAR_CONFIRM_MS)
      return
    }
    if (disarm.current !== null) window.clearTimeout(disarm.current)
    setClearArmed(false)
    void run(() => clearSetlist(version))
  }

  const canClear = editable && firstEditable < total

  return (
    <>
      {/*
       * The view's own bar, placed where the library's toolbar is placed —
       * under the list on a phone held upright, where a thumb reaches it, and
       * above it everywhere else. Same surface, padding and shadow, so switching
       * views changes what the bar holds and nothing about where it is.
       */}
      <div
        className={cx(
          'flex shrink-0 flex-wrap items-center gap-[10px]',
          'bg-surface-app px-[25px] py-[15px]',
          'bar-stack:order-last bar-stack:px-[15px] bar-stack:shadow-[var(--shadow-bar)]',
          'bar-stack:pb-[max(15px,env(safe-area-inset-bottom))]',
          'short:px-[15px] short:py-[10px] short:shadow-[var(--shadow-bar)]',
        )}
      >
        <Button className="shrink-0 bar-stack:px-[14px]" onClick={onClose} icon={<BackIcon />}>
          library
        </Button>

        <div className="flex min-w-0 flex-1 items-baseline gap-[10px]">
          <h2 className="yarg-label shrink-0 text-[15px] text-white">Setlist</h2>
          <p className="min-w-0 truncate text-[14px] text-content-muted">{summary(setlist)}</p>
        </div>

        {canClear ? (
          <Button
            className="shrink-0 bar-stack:px-[14px]"
            tone={clearArmed ? 'danger' : 'neutral'}
            disabled={pending}
            onClick={onClear}
            aria-label={
              clearArmed
                ? 'Press again to clear the setlist'
                : current === null
                  ? 'Clear the setlist'
                  : 'Clear the songs not played yet'
            }
          >
            {clearArmed ? 'confirm clear' : 'clear'}
          </Button>
        ) : null}

        <p
          className="basis-full text-[13px] leading-tight text-content-muted empty:hidden"
          aria-live="polite"
        >
          {error ? describeSetlistError(error) : null}
        </p>
      </div>

      {total === 0 ? (
        <EmptyState title="The setlist is empty">
          Open any song and choose Add to setlist.
        </EmptyState>
      ) : (
        <ol
          ref={listRef}
          aria-label="Setlist"
          className={cx(
            // `relative` so each row's `offsetTop` is measured from the list.
            'scrollbar-slim relative min-h-0 flex-1 overflow-y-auto bg-surface-card',
            drag && 'select-none',
          )}
        >
          {songs.map((entry, position) => {
            const song = entry.libraryId === null ? undefined : songsById.get(entry.libraryId)
            const isCurrent = position === current
            const canEdit = editable && position >= firstEditable
            const name = song === undefined ? 'this song' : formatTitleCredit(song)

            return (
              <SetlistRow
                key={entry.hash}
                entry={entry}
                song={song}
                position={position}
                isCurrent={isCurrent}
                isPlaying={isCurrent || (song !== undefined && song.id === playingId)}
                isPlayed={current !== null && position < current}
                isSelected={song !== undefined && song.id === selectedId}
                onSelect={song === undefined ? null : () => onSelect(song)}
                style={rowStyle(position)}
                dragging={drag?.from === position}
                grip={
                  canDrag && canEdit ? (
                    <DragGrip {...gripProps(position)} />
                  ) : null
                }
                controls={
                  canEdit ? (
                    <>
                      <RowButton
                        label={`Move ${name} up`}
                        className="pointer-coarse:sr-only"
                        disabled={pending || position <= firstEditable}
                        onClick={() =>
                          void run(() => moveInSetlist(entry.hash, position - 1, version))
                        }
                      >
                        <ArrowIcon direction="up" />
                      </RowButton>
                      <RowButton
                        label={`Move ${name} down`}
                        className="pointer-coarse:sr-only"
                        disabled={pending || position >= total - 1}
                        onClick={() =>
                          void run(() => moveInSetlist(entry.hash, position + 1, version))
                        }
                      >
                        <ArrowIcon direction="down" />
                      </RowButton>
                      <RowButton
                        label={`Remove ${name} from the setlist`}
                        disabled={pending}
                        onClick={() => void run(() => removeFromSetlist(entry.hash, version))}
                      >
                        <RemoveIcon />
                      </RowButton>
                    </>
                  ) : null
                }
              />
            )
          })}
        </ol>
      )}
    </>
  )
}

/** One line beside the heading: how big the set is and where the show is. */
function summary(setlist: Setlist): string {
  const total = setlist.songs.length
  if (total === 0) return 'empty'

  const songs = `${total} ${total === 1 ? 'song' : 'songs'}`
  if (setlist.mode === 'playing' && setlist.index !== null) {
    return `${songs} · playing ${setlist.index + 1} of ${total}`
  }
  return `${songs} · not started`
}

function SetlistRow({
  entry,
  song,
  position,
  isCurrent,
  isPlaying,
  isPlayed,
  isSelected,
  onSelect,
  style,
  dragging,
  grip,
  controls,
}: {
  entry: SetlistEntry
  song: Song | undefined
  position: number
  isCurrent: boolean
  isPlaying: boolean
  isPlayed: boolean
  isSelected: boolean
  /** Null for a chart the library doesn't have: there are no details to open. */
  onSelect: (() => void) | null
  /** Where a drag is drawing this row, if one is on. */
  style: CSSProperties | undefined
  /** This is the row being dragged. */
  dragging: boolean
  grip: ReactNode
  controls: ReactNode
}) {
  // The library row's two marks, for the same two reasons: see `SongList`.
  const playingBorder = isPlaying ? '#fff' : null

  const body = (
    <>
      {/* The cover slot holds its size with or without art, as in the library. */}
      <span className="flex size-[44px] shrink-0 items-center justify-center @2xl/list:size-[48px]">
        {song ? <AlbumThumb song={song} size={48} className="size-full" /> : null}
      </span>
      <span className="flex min-w-0 flex-1 flex-col justify-center gap-[4px] @2xl/list:gap-[6px]">
        <span
          dir="auto"
          className="truncate-tight text-[17px] leading-none font-semibold text-white @2xl/list:text-[22px]"
        >
          {song ? <SongTitle song={song} /> : 'Not in this library'}
        </span>
        <span className="min-w-0 text-[14px] leading-none font-medium text-content-secondary italic @2xl/list:text-[18px]">
          {song ? (
            <ArtistName song={song} credit="label" />
          ) : (
            <span className="font-numeric text-content-muted not-italic">
              {entry.hash.slice(0, 12)}
            </span>
          )}
        </span>
      </span>
      {song ? (
        <span className="font-numeric hidden shrink-0 text-[14px] tabular-nums text-count-muted @md/list:inline @2xl/list:text-[16px]">
          <span className="sr-only">Length </span>
          {formatDuration(song.lengthSeconds)}
        </span>
      ) : null}
    </>
  )

  return (
    <li
      className={cx(
        'flex h-[60px] items-center gap-[10px] pr-[10px] pl-[15px]',
        '@2xl/list:h-[80px] @2xl/list:pl-[25px]',
        'transition-[background] duration-160',
        // The wash points away from the text, as on the narrow library row.
        isPlaying
          ? 'yarg-wash-selected [--yarg-wash-angle:270deg]'
          : isSelected
            ? 'bg-surface-hover'
            : 'bg-surface-card',
        // History stays legible but steps back: nothing about it can change.
        isPlayed && 'opacity-60',
        // Lifted off the list while it is carried, in the hover colour.
        dragging && 'bg-surface-hover',
      )}
      style={{
        borderTop: playingBorder
          ? `3px solid ${playingBorder}`
          : '1px solid var(--color-border-row)',
        borderBottom: playingBorder
          ? `3px solid ${playingBorder}`
          : '1px solid var(--color-border-row)',
        borderLeft: `2px solid ${playingBorder ?? 'transparent'}`,
        borderRight: `2px solid ${playingBorder ?? 'transparent'}`,
        boxShadow: isSelected
          ? 'inset 0 0 0 var(--stroke) var(--yarg-vivid-sky-blue)'
          : undefined,
        ...style,
      }}
    >
      <span className="font-numeric w-[24px] shrink-0 text-right text-[14px] tabular-nums text-count-muted">
        {position + 1}
      </span>

      {isCurrent ? (
        <span className="sr-only">Now playing. </span>
      ) : isPlayed ? (
        <span className="sr-only">Played. </span>
      ) : null}

      {/*
       * The row opens the song, and the controls sit beside that button rather
       * than inside it: a button inside a button is not a thing a browser or a
       * screen reader will agree about.
       */}
      {onSelect ? (
        <button
          type="button"
          onClick={onSelect}
          aria-current={isSelected ? true : undefined}
          className={cx(
            'flex h-full min-w-0 flex-1 cursor-pointer items-center gap-[15px] text-left',
            'yarg-focusable focus-visible:[outline-offset:-3px]',
          )}
        >
          {body}
        </button>
      ) : (
        <div className="flex h-full min-w-0 flex-1 items-center gap-[15px]">{body}</div>
      )}

      {controls ? <span className="flex shrink-0 items-center">{controls}</span> : null}
      {grip}
    </li>
  )
}

/** A quiet, icon-only control; `Button` supplies the touch target on a coarse pointer. */
function RowButton({
  label,
  className,
  disabled,
  onClick,
  children,
}: {
  label: string
  className?: string
  disabled: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <Button
      quiet
      className={cx('px-[10px]', className)}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </Button>
  )
}

/**
 * The handle a drag starts from.
 *
 * Hidden from assistive technology: the up and down buttons beside it are the
 * accessible way to move a row, and a control that only answers to a pointer
 * would be one more stop that does nothing. `touch-action: none` is what lets
 * a finger drag it instead of scrolling the list.
 */
function DragGrip(props: { onPointerDown: (event: React.PointerEvent<HTMLElement>) => void }) {
  return (
    <span
      {...props}
      aria-hidden
      title="Drag to reorder"
      className={cx(
        'flex h-full w-[40px] shrink-0 cursor-grab touch-none items-center justify-center',
        'text-content-muted hover:text-white active:cursor-grabbing',
        'pointer-coarse:w-[48px]',
      )}
    >
      <GripIcon />
    </span>
  )
}

// Glyphs in the same hand as `SortArrow` and `ChevronRight`: 1.75 stroke, round caps.

function GripIcon() {
  return (
    <svg width="10" height="16" viewBox="0 0 10 16" fill="currentColor" aria-hidden>
      {[2, 8, 14].map((y) =>
        [2, 8].map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.5" />),
      )}
    </svg>
  )
}

function ArrowIcon({ direction }: { direction: 'up' | 'down' }) {
  return (
    <svg
      width="12"
      height="14"
      viewBox="0 0 12 14"
      fill="none"
      aria-hidden
      style={{ rotate: direction === 'up' ? '0deg' : '180deg' }}
    >
      <path
        d="M6 13V1M1.5 5.5L6 1L10.5 5.5"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function RemoveIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
      <path
        d="M1.5 1.5L10.5 10.5M10.5 1.5L1.5 10.5"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  )
}

function BackIcon() {
  return (
    <svg width="6" height="9" viewBox="0 0 6 9" fill="none" aria-hidden className="shrink-0">
      <path
        d="M5 1L1.5 4.5L5 8"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
