/**
 * Who added which song to the setlist.
 *
 * YARG's setlist is a list of song hashes and nothing else, so "added by"
 * cannot live there. It lives here instead: a small roster of guests, and a map
 * from each song in the setlist to the guest who added it.
 *
 * ## A guest is an animal first, a name second
 *
 * The first time a phone adds a song, the server hands it an identity: an
 * animal emoji nobody else has, its name as the default display name ("🦊 Fox"),
 * and one of eight colours. The guest may type a name of their own and pick
 * another free animal. So every added song shows who added it, readably, even
 * when nobody bothers to type anything, and two guests who both type "Alex"
 * are still told apart by the animal and the colour.
 *
 * Handed out on the first add rather than the first visit, so the forty
 * animals go to people who take part, not to every phone that looked.
 *
 * ## In memory, on purpose
 *
 * Guests reach YASS through the Cloudflare tunnel, whose address changes on
 * every start of the server. A phone keeps its guest id per address, so after a
 * restart every guest is new anyway, and a roster saved to disk would be
 * remembering people who can no longer be recognised. The cost is that a
 * restart forgets who added the songs still queued in YARG; they stay queued.
 *
 * ## Ids stay private
 *
 * The id is the only thing that lets a phone act as its guest, so it is sent
 * back to that phone alone. What everybody else sees is the tag: emoji, display
 * name, colour.
 */

import { randomBytes } from 'node:crypto'

import type { GuestColor, GuestTag, OwnGuest } from '@shared/types.js'
import { GUEST_ANIMALS, GUEST_COLORS } from '@shared/types.js'

/** The header a phone names its guest id in. */
export const GUEST_HEADER = 'x-yass-guest'

/** Long enough for a name, short enough for a row on a phone. */
export const MAX_NAME_LENGTH = 24

interface Guest {
  id: string
  emoji: string
  color: GuestColor
  /** What the guest typed, or null to go by the animal's name. */
  name: string | null
  lastSeen: number
}

export type GuestUpdate = { name?: string | null; emoji?: string }

export type GuestUpdateResult =
  | { ok: true; guest: OwnGuest }
  | { ok: false; error: 'not_found' | 'taken' | 'invalid' }

const ANIMAL_NAME = new Map<string, string>(GUEST_ANIMALS.map((animal) => [animal.emoji, animal.name]))

/**
 * Tidy a typed name: trimmed, inner whitespace collapsed, control characters
 * dropped, cut to length. Empty means "go back to the animal's name".
 *
 * Only ever rendered as text, so there is nothing to escape here; this is about
 * what fits on a row, not about safety.
 */
export function cleanName(raw: string): string | null {
  const cleaned = Array.from(
    raw
      .replace(/\p{Cc}/gu, '')
      .replace(/\s+/g, ' ')
      .trim(),
  )
    .slice(0, MAX_NAME_LENGTH)
    .join('')
    .trim()

  return cleaned.length === 0 ? null : cleaned
}

export class Guests {
  #guests = new Map<string, Guest>()
  /** Song hash → the id of the guest who added it. */
  #addedBy = new Map<string, string>()
  /**
   * Adds sent to YARG and not yet answered. Kept through `retain`, because a
   * setlist update from somebody else's edit can arrive before YARG has the
   * song, and would otherwise take the attribution away before it is used.
   */
  #pending = new Set<string>()
  #listeners = new Set<() => void>()
  #random: () => number
  #now: () => number

  constructor(options: { random?: () => number; now?: () => number } = {}) {
    this.#random = options.random ?? Math.random
    this.#now = options.now ?? Date.now
  }

  /** The guest with this id, as that guest sees themselves, or null. */
  get(id: string | null | undefined): OwnGuest | null {
    const guest = id ? this.#guests.get(id) : undefined
    if (!guest) return null
    guest.lastSeen = this.#now()
    return this.#own(guest)
  }

  /**
   * The guest with this id, or a new one if the id is unknown or missing.
   *
   * An unknown id is normal: it is a phone that was a guest before the server
   * restarted. It gets a new identity rather than an error.
   */
  identify(id: string | null | undefined): OwnGuest {
    const known = this.get(id)
    if (known) return known

    const guest: Guest = {
      id: randomBytes(16).toString('base64url'),
      emoji: this.#freeEmoji(),
      color: this.#freeColor(),
      name: null,
      lastSeen: this.#now(),
    }
    this.#guests.set(guest.id, guest)
    return this.#own(guest)
  }

  /** Animals nobody holds right now, in the fixed order of the set. */
  available(): string[] {
    const taken = this.#takenEmoji()
    return GUEST_ANIMALS.map((animal) => animal.emoji).filter((emoji) => !taken.has(emoji))
  }

  update(id: string, update: GuestUpdate): GuestUpdateResult {
    const guest = this.#guests.get(id)
    if (!guest) return { ok: false, error: 'not_found' }

    if (update.emoji !== undefined && update.emoji !== guest.emoji) {
      if (!ANIMAL_NAME.has(update.emoji)) return { ok: false, error: 'invalid' }
      if (this.#takenEmoji().has(update.emoji)) return { ok: false, error: 'taken' }
      guest.emoji = update.emoji
    }

    if (update.name !== undefined) {
      guest.name = update.name === null ? null : cleanName(update.name)
    }

    guest.lastSeen = this.#now()
    this.#changed()
    return { ok: true, guest: this.#own(guest) }
  }

  /**
   * Record who added a song, before the add is sent to YARG.
   *
   * Before, not after: the plugin's new setlist can reach subscribers a moment
   * ahead of its answer to the add, and a tag recorded on the answer would miss
   * that first update. Returns false — recording nothing — when the song is
   * already attributed, so an add refused as a duplicate never takes the song
   * from whoever really added it.
   */
  attribute(hash: string, guestId: string): boolean {
    if (this.#addedBy.has(hash)) return false
    this.#addedBy.set(hash, guestId)
    this.#pending.add(hash)
    return true
  }

  /** YARG took the add: from here on the setlist itself keeps the song listed. */
  confirm(hash: string): void {
    this.#pending.delete(hash)
  }

  /** Undo `attribute` for an add YARG refused. */
  forget(hash: string): void {
    this.#pending.delete(hash)
    this.#addedBy.delete(hash)
  }

  /**
   * Keep only the songs still in the setlist.
   *
   * A song removed and added again later belongs to whoever adds it then.
   */
  retain(hashes: Iterable<string>): void {
    const keep = new Set(hashes)
    for (const hash of this.#addedBy.keys()) {
      if (!keep.has(hash) && !this.#pending.has(hash)) this.#addedBy.delete(hash)
    }
  }

  tagFor(hash: string): GuestTag | null {
    const id = this.#addedBy.get(hash)
    const guest = id === undefined ? undefined : this.#guests.get(id)
    return guest ? this.#tag(guest) : null
  }

  /** Hear about renames and new animals, which change how the setlist reads. */
  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener)
    return () => this.#listeners.delete(listener)
  }

  #changed(): void {
    for (const listener of this.#listeners) {
      try {
        listener()
      } catch (error) {
        console.error('[guests] subscriber:', error)
      }
    }
  }

  #takenEmoji(): Set<string> {
    return new Set(Array.from(this.#guests.values(), (guest) => guest.emoji))
  }

  /**
   * A random free animal.
   *
   * Random rather than in order, so the first guest of the night is not always
   * the fox. With all forty taken, the animal of the guest seen longest ago who
   * has no song in the setlist is freed; that phone becomes a new guest if it
   * comes back. If every guest has a song queued, animals repeat — colours
   * still tell most of them apart, and a party of forty-one people adding songs
   * is a good problem to have.
   */
  #freeEmoji(): string {
    const free = this.available()
    if (free.length > 0) return free[Math.floor(this.#random() * free.length)] ?? free[0]!

    const queued = new Set(this.#addedBy.values())
    const idle = [...this.#guests.values()]
      .filter((guest) => !queued.has(guest.id))
      .sort((a, b) => a.lastSeen - b.lastSeen)[0]

    if (idle) {
      this.#guests.delete(idle.id)
      return idle.emoji
    }

    const all = GUEST_ANIMALS.map((animal) => animal.emoji)
    return all[Math.floor(this.#random() * all.length)] ?? all[0]!
  }

  /** The colour fewest guests have, earliest in the palette on a tie. */
  #freeColor(): GuestColor {
    const counts = new Map<GuestColor, number>(GUEST_COLORS.map((color) => [color, 0]))
    for (const guest of this.#guests.values()) {
      counts.set(guest.color, (counts.get(guest.color) ?? 0) + 1)
    }

    let best: GuestColor = GUEST_COLORS[0]
    for (const color of GUEST_COLORS) {
      if ((counts.get(color) ?? 0) < (counts.get(best) ?? 0)) best = color
    }
    return best
  }

  #displayName(guest: Guest): string {
    return guest.name ?? ANIMAL_NAME.get(guest.emoji) ?? 'Guest'
  }

  #tag(guest: Guest): GuestTag {
    return { emoji: guest.emoji, name: this.#displayName(guest), color: guest.color }
  }

  #own(guest: Guest): OwnGuest {
    return { ...this.#tag(guest), id: guest.id, customName: guest.name }
  }
}
