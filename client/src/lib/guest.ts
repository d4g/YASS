/**
 * Who this phone is, as a guest: the animal, colour and name the server handed
 * it on its first "Add to setlist".
 *
 * The id is kept in `localStorage` and named in the `X-YASS-Guest` header on
 * every setlist edit, which is all it takes for the server to know who added
 * what. It is per address, and the tunnel's address changes whenever the server
 * restarts — so after a restart the stored id is unknown to the server, and the
 * next add simply hands out a new animal. That is expected, not an error; see
 * `server/src/core/guests.ts`.
 *
 * One small store for the whole page, because the marker is drawn in more than
 * one place and a rename in one must show in the others.
 */

import { useEffect, useState } from 'react'

import type { GuestInfo, OwnGuest } from '@shared/types'

const KEY = 'yass.guest'
const HEADER = 'X-YASS-Guest'

let current: OwnGuest | null = null
let loaded = false
const listeners = new Set<(guest: OwnGuest | null) => void>()

function storedId(): string | null {
  try {
    return window.localStorage.getItem(KEY)
  } catch {
    // Private browsing and locked-down webviews can refuse storage. Then the
    // phone is a new guest on every page load, which is the most it can be.
    return null
  }
}

function storeId(id: string | null): void {
  try {
    if (id === null) window.localStorage.removeItem(KEY)
    else window.localStorage.setItem(KEY, id)
  } catch {
    // As above: remembered for this page only.
  }
}

function publish(guest: OwnGuest | null): void {
  current = guest
  for (const listener of listeners) listener(guest)
}

/** The header naming this phone's guest, when it is one. */
export function guestHeaders(): Record<string, string> {
  const id = current?.id ?? storedId()
  return id ? { [HEADER]: id } : {}
}

/** Keep the guest a server response handed back. */
export function rememberGuest(guest: OwnGuest): void {
  storeId(guest.id)
  publish(guest)
}

/**
 * Ask the server who this phone is, and which animals are free.
 *
 * An id the server doesn't know is dropped, so the next add starts clean
 * rather than naming a guest that no longer exists.
 */
export async function loadGuest(): Promise<GuestInfo> {
  const response = await fetch('/api/guest', {
    headers: { Accept: 'application/json', ...guestHeaders() },
  })
  if (!response.ok) throw new Error(`/api/guest failed: ${response.status}`)

  const info = (await response.json()) as GuestInfo
  if (info.guest) rememberGuest(info.guest)
  else if (storedId() !== null) {
    storeId(null)
    publish(null)
  }
  return info
}

export type GuestUpdateError = 'taken' | 'invalid' | 'not_found' | 'unavailable'

/** Rename, and/or switch animal. `name: null` goes back to the animal's name. */
export async function updateGuest(update: {
  name?: string | null
  emoji?: string
}): Promise<{ ok: true } | { ok: false; error: GuestUpdateError }> {
  let response: Response
  try {
    response = await fetch('/api/guest', {
      method: 'PUT',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...guestHeaders() },
      body: JSON.stringify(update),
    })
  } catch {
    return { ok: false, error: 'unavailable' }
  }

  const payload = (await response.json().catch(() => null)) as {
    ok?: boolean
    guest?: OwnGuest
    error?: GuestUpdateError
  } | null

  if (response.ok && payload?.ok && payload.guest) {
    rememberGuest(payload.guest)
    return { ok: true }
  }
  if (payload?.error === 'not_found') {
    // The server restarted since; this phone is nobody until its next add.
    storeId(null)
    publish(null)
  }
  return { ok: false, error: payload?.error ?? 'unavailable' }
}

/** This phone's guest, or null until its first add. */
export function useGuest(): OwnGuest | null {
  const [guest, setGuest] = useState(current)

  useEffect(() => {
    listeners.add(setGuest)
    // Once per page: a phone that was a guest before a reload is one still.
    if (!loaded && storedId() !== null) {
      loaded = true
      void loadGuest().catch(() => {
        /* No server right now; the next add will sort it out. */
      })
    }
    return () => {
      listeners.delete(setGuest)
    }
  }, [])

  return guest
}
