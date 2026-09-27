/**
 * The QR code YARG shows, through the Setlist Bridge plugin.
 *
 * The address is the one a guest needs: the tunnel's, key included, while the
 * tunnel is up — that is the one that works from anywhere — and otherwise the
 * best LAN address. A server bound to loopback has nothing to hand anyone, and
 * shows nothing.
 *
 * Encoded here, not in the plugin, so the plugin stays a thing that draws
 * squares: the address, when it changes, and whether to show it at all are all
 * this server's knowledge. The grid is the same library's the tray draws its own
 * code with, so the two codes on the host's screens are the same code.
 */

import qrcode from 'qrcode-generator'

import type { QrGrid } from './setlistBridge.js'
import { lanAddresses } from './net.js'

/** Bind addresses that make the server reachable from other machines. */
const LAN_HOSTS = new Set(['0.0.0.0', '::'])

/**
 * The address to put in YARG, or null for none.
 *
 * The tunnel wins because a guest on mobile data can use it and a guest on the
 * Wi-Fi can too; the LAN address only serves the second.
 */
export function shareAddress(options: {
  tunnelUrl: string | null
  host: string
  port: number
}): string | null {
  if (options.tunnelUrl !== null) return options.tunnelUrl
  if (!LAN_HOSTS.has(options.host)) return null
  return lanAddresses(options.port)[0]?.url ?? null
}

/**
 * An address as a grid of modules, row by row, `1` dark.
 *
 * Error correction `L`, like the tray's: the code is read off a screen, not a
 * scuffed sticker, and the lowest level gives the biggest modules for the space.
 */
export function encodeQr(text: string): QrGrid {
  const code = qrcode(0, 'L')
  code.addData(text)
  code.make()

  const size = code.getModuleCount()
  let modules = ''
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) modules += code.isDark(row, col) ? '1' : '0'
  }

  return { size, modules }
}
