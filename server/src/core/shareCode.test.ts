import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { Setlist, SetlistEntry } from '@shared/types.js'
import { GUEST_ANIMALS, GUEST_COLOR_HEX, GUEST_COLORS } from '@shared/types.js'
import { GUEST_EMOJI_PNG } from './guestEmoji.js'
import { applyEnvOverrides, normalizeSettings } from './settings.js'
import { captionFor, encodeQr, shareAddress } from './shareCode.js'

const TUNNEL = 'https://some-four-words-here.trycloudflare.com/?key=abcdefghijklmnopqrstuvwxyz012345'

describe('the address YARG shows', () => {
  it('prefers the tunnel, which works for every guest', () => {
    assert.equal(shareAddress({ tunnelUrl: TUNNEL, host: '0.0.0.0', port: 4321 }), TUNNEL)
    assert.equal(shareAddress({ tunnelUrl: TUNNEL, host: '127.0.0.1', port: 4321 }), TUNNEL)
  })

  it('shows nothing for a server nobody else can reach', () => {
    assert.equal(shareAddress({ tunnelUrl: null, host: '127.0.0.1', port: 4321 }), null)
  })

  it('falls back to a LAN address on the right port', () => {
    const address = shareAddress({ tunnelUrl: null, host: '0.0.0.0', port: 4321 })
    // A machine with no network adapter up has none, which is also an answer.
    if (address !== null) assert.match(address, /^http:\/\/\d+\.\d+\.\d+\.\d+:4321$/)
  })
})

describe('the QR grid', () => {
  it('is a real QR version, sized for the plugin, one character per module', () => {
    const grid = encodeQr(TUNNEL)

    assert.equal((grid.size - 21) % 4, 0)
    assert.ok(grid.size >= 21 && grid.size <= 57)
    assert.equal(grid.modules.length, grid.size * grid.size)
    assert.match(grid.modules, /^[01]+$/)
  })

  it('has the three finder squares every scanner locks on to', () => {
    const { size, modules } = encodeQr(TUNNEL)
    const row = (r: number, from: number) => modules.slice(r * size + from, r * size + from + 7)

    // Top edge of the top-left and top-right squares; bottom edge of the bottom-left.
    assert.equal(row(0, 0), '1111111')
    assert.equal(row(0, size - 7), '1111111')
    assert.equal(row(size - 1, 0), '1111111')
    // And the light ring inside each.
    assert.equal(row(1, 0), '1000001')
  })
})

describe('the setting', () => {
  it('is on by default, and YASS_QR_IN_YARG can force it off', () => {
    assert.equal(normalizeSettings({}).qrInYarg, true)

    const previous = process.env.YASS_QR_IN_YARG
    try {
      process.env.YASS_QR_IN_YARG = 'off'
      assert.equal(applyEnvOverrides(normalizeSettings({})).qrInYarg, false)
    } finally {
      if (previous === undefined) delete process.env.YASS_QR_IN_YARG
      else process.env.YASS_QR_IN_YARG = previous
    }
  })
})

const A = '52302429C0ACBCD1612B144FCCB3565BB2C20109'
const B = '33D3D0D05A9D7C1D2E9A2FE59C23EDCB370A6A29'
const C = 'B0A8886C85ABB42D4511F811C7D580CBEE161608'
const FOX = { emoji: '🦊', name: 'Anna', color: 'pink' } as const

function show(songs: SetlistEntry[], index: number | null, mode: Setlist['mode'] = 'playing'): Setlist {
  return { available: true, editable: true, version: 1, mode, index, songs, updatedAt: 0 }
}

const entry = (hash: string, addedBy: SetlistEntry['addedBy'] = null): SetlistEntry => ({
  hash,
  libraryId: null,
  addedBy,
})

const library = new Map([
  [A, { artist: 'Queen', name: 'Bohemian Rhapsody' }],
  [B, { artist: 'Muse', name: 'Knights of Cydonia' }],
])

describe('the caption under the code', () => {
  it('names the next player and song while a show is on', () => {
    const caption = captionFor(show([entry(A), entry(B, FOX)], 0), library)

    assert.equal(caption?.song, 'Muse – Knights of Cydonia')
    assert.equal(caption?.player?.name, 'Anna')
    assert.equal(caption?.player?.color, GUEST_COLOR_HEX.pink)
    assert.equal(caption?.player?.image, GUEST_EMOJI_PNG['🦊'])
  })

  it('has only the song for a song added in YARG itself', () => {
    const caption = captionFor(show([entry(A), entry(B)], 0), library)
    assert.deepEqual(caption, { player: null, song: 'Muse – Knights of Cydonia' })
  })

  it('has only the player for a song the library does not know', () => {
    const caption = captionFor(show([entry(A), entry(C, FOX)], 0), library)
    assert.equal(caption?.song, null)
    assert.equal(caption?.player?.name, 'Anna')
  })

  it('says nothing after the last song, before a show starts, or without a setlist', () => {
    assert.equal(captionFor(show([entry(A), entry(B, FOX)], 1), library), null)
    assert.equal(captionFor(show([entry(A), entry(B, FOX)], null, 'building'), library), null)
    assert.equal(captionFor({ ...show([], null, 'idle'), available: false }, library), null)
  })

  it('cuts a long title to what the plugin takes, without splitting a character', () => {
    const long = new Map([[B, { artist: 'Band', name: '🦊'.repeat(150) }]])
    const song = captionFor(show([entry(A), entry(B)], 0), long)?.song ?? ''

    assert.ok(song.length <= 200, `${song.length} UTF-16 units`)
    assert.ok(song.endsWith('…'))
    // A lone high surrogate would be half a character.
    assert.doesNotMatch(song, /[\uD800-\uDBFF](?![\uDC00-\uDFFF])/)
  })
})

describe('the guest pictures and colours', () => {
  it('has a PNG for every animal, small enough for the plugin', () => {
    for (const { emoji } of GUEST_ANIMALS) {
      const png = Buffer.from(GUEST_EMOJI_PNG[emoji] ?? '', 'base64')
      assert.ok(png.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47])), emoji)
      assert.ok(png.length <= 2400, `${emoji}: ${png.length} bytes`)
    }
  })

  it('gives the plugin the same colours the client draws', () => {
    // The client's --guest-* values, with --yarg-* tokens resolved from the vendored palette.
    const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'client', 'src')
    const css = readFileSync(join(root, 'index.css'), 'utf8')
    const palette = readFileSync(join(root, 'design', 'tokens', 'colors.css'), 'utf8')
    const token = (name: string) => new RegExp(`--${name}:\\s*(#[0-9A-Fa-f]{6})`).exec(palette)?.[1]

    for (const color of GUEST_COLORS) {
      const value = new RegExp(`--guest-${color}:\\s*([^;]+);`).exec(css)?.[1]?.trim() ?? ''
      const hex = value.startsWith('var(--') ? token(value.slice(6, -1)) : value
      assert.equal(hex?.toLowerCase(), GUEST_COLOR_HEX[color], color)
    }
  })
})
