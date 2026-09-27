/**
 * YARG's setlist, over the shared server event stream.
 *
 * Only ever `available` when the host runs the YARG Setlist Bridge plugin, so
 * every consumer has to treat the unavailable state as the normal one and draw
 * nothing for it.
 *
 * No polling fallback for a stream that dropped: this is a nicety layered onto
 * the banner, and while the stream is down the banner already says so. A stream
 * the server *declined* is different — over the Cloudflare tunnel there is no
 * stream at all, and a guest there who queues a song has to see it land. So
 * then, and only then, it polls, at now-playing's pace.
 */

import { useEffect, useState } from 'react'

import type { Setlist } from '@shared/types'
import { fetchSetlist } from './api'
import { isStreamDeclined, onConnectionChange, onServerEvent } from './events'

const POLL_MS = 2000

const UNAVAILABLE: Setlist = {
  available: false,
  editable: false,
  version: null,
  mode: 'idle',
  index: null,
  songs: [],
  updatedAt: 0,
}

export function useSetlist(): Setlist {
  const [setlist, setSetlist] = useState<Setlist>(UNAVAILABLE)

  useEffect(() => {
    let disposed = false
    let timer: number | null = null

    const poll = () => {
      void fetchSetlist()
        .then((next) => {
          if (!disposed) setSetlist(next)
        })
        .catch(() => {
          /* Server down; the next tick retries. */
        })
    }

    const startPolling = () => {
      if (timer !== null || !isStreamDeclined()) return
      timer = window.setInterval(poll, POLL_MS)
      poll()
    }

    const unsubscribeSetlist = onServerEvent<Setlist>('setlist', setSetlist)
    // Declined is only ever learned through a connection change — or already
    // known, if this mounted after it happened.
    const unsubscribeConnection = onConnectionChange(startPolling)
    startPolling()

    return () => {
      disposed = true
      if (timer !== null) window.clearInterval(timer)
      unsubscribeSetlist()
      unsubscribeConnection()
    }
  }, [])

  return setlist
}
