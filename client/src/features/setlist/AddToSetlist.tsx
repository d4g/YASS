/**
 * Queue a song in YARG's setlist from its details.
 *
 * Renders nothing unless the host runs the YARG Setlist Bridge plugin at a
 * version that takes edits, so for most hosts this is not there at all — not
 * disabled, not explained, absent. A control that can never work is worse than
 * none.
 *
 * Once the song is in the setlist the button gives way to where it sits. That
 * state comes from the event stream, not from this component's own request:
 * the setlist can also change from the console or another phone, and the
 * stream is the one account of it every surface agrees on.
 *
 * Both states also say who added it — the song's guest tag — and, once this
 * phone has added anything, who this phone is, with the way to change it.
 */

import { useState } from 'react'

import type { Setlist, SetlistEditError, Song } from '@shared/types'
import { Button } from '../../ui'
import { addToSetlist } from '../../lib/api'
import { GuestTag } from '../guests/GuestTag'
import { YouAre } from '../guests/YouAre'
import { describeSetlistError } from './messages'

export function AddToSetlist({ song, setlist }: { song: Song; setlist: Setlist }) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<SetlistEditError | null>(null)

  if (!setlist.available || !setlist.editable || song.hash === null) return null

  const hash = song.hash
  const position = setlist.songs.findIndex((entry) => entry.hash === hash)

  if (position >= 0) {
    const addedBy = setlist.songs[position]?.addedBy ?? null
    return (
      <div className="flex flex-col items-start gap-[10px]">
        <p className="flex flex-wrap items-center gap-x-[6px] gap-y-[4px]" role="status">
          <span className="yarg-label text-[11px] text-content-muted">
            {placement(setlist, position)}
          </span>
          {addedBy ? (
            <>
              <span className="yarg-label text-[11px] text-content-muted">· added by</span>
              <GuestTag tag={addedBy} />
            </>
          ) : null}
        </p>
        <YouAre />
      </div>
    )
  }

  const add = async () => {
    setPending(true)
    setError(null)
    const outcome = await addToSetlist(hash)
    setPending(false)
    // On success there is nothing to do here: the stream is about to report the
    // song in the setlist, and that swaps this button for its position.
    if (!outcome.ok) setError(outcome.error)
  }

  return (
    <div className="flex flex-col items-start gap-[10px]">
      <Button tone="accent" disabled={pending} onClick={() => void add()}>
        {pending ? 'Adding…' : 'Add to setlist'}
      </Button>
      <p className="text-[13px] leading-tight text-content-muted empty:hidden" aria-live="polite">
        {error ? describeSetlistError(error) : null}
      </p>
      <YouAre />
    </div>
  )
}

/** Where a song already in the setlist sits, in the setlist's own terms. */
function placement(setlist: Setlist, position: number): string {
  const total = setlist.songs.length
  const current = setlist.mode === 'playing' ? setlist.index : null

  if (current !== null) {
    if (position < current) return 'Played earlier in this setlist'
    if (position === current) return 'Playing now in the setlist'
    if (position === current + 1) return 'Up next in the setlist'
  }

  return `In the setlist · ${position + 1} of ${total}`
}
