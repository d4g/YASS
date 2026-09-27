import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { applyEnvOverrides, normalizeSettings } from './settings.js'
import { encodeQr, shareAddress } from './shareCode.js'

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
