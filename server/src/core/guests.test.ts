import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { GUEST_ANIMALS, GUEST_COLORS } from '@shared/types.js'
import { cleanName, Guests, MAX_NAME_LENGTH } from './guests.js'

const A = '52302429C0ACBCD1612B144FCCB3565BB2C20109'
const B = '33D3D0D05A9D7C1D2E9A2FE59C23EDCB370A6A29'

describe('guests', () => {
  it('hands a new guest a free animal, its name, and a colour', () => {
    const guests = new Guests({ random: () => 0 })
    const fox = guests.identify(null)

    assert.equal(fox.emoji, '🦊')
    assert.equal(fox.name, 'Fox')
    assert.equal(fox.customName, null)
    assert.equal(fox.color, GUEST_COLORS[0])
    assert.ok(fox.id.length >= 16)
  })

  it('knows a returning guest by id, and makes a new one for an unknown id', () => {
    const guests = new Guests()
    const first = guests.identify(null)

    assert.equal(guests.identify(first.id).id, first.id)
    assert.notEqual(guests.identify('from-before-a-restart').id, first.id)
  })

  it('never hands out an animal twice while one is free, and spreads the colours', () => {
    const guests = new Guests()
    const all = GUEST_ANIMALS.map(() => guests.identify(null))

    assert.equal(new Set(all.map((guest) => guest.emoji)).size, GUEST_ANIMALS.length)
    assert.deepEqual(guests.available(), [])

    const perColour = new Map<string, number>()
    for (const guest of all) perColour.set(guest.color, (perColour.get(guest.color) ?? 0) + 1)
    assert.equal(perColour.size, GUEST_COLORS.length)
    assert.equal(Math.max(...perColour.values()), GUEST_ANIMALS.length / GUEST_COLORS.length)
  })

  it('frees the animal of the longest-idle guest without a queued song when all are taken', () => {
    let now = 0
    const guests = new Guests({ now: () => now })
    const all = GUEST_ANIMALS.map(() => {
      now += 1
      return guests.identify(null)
    })
    const [oldest, second] = all as [(typeof all)[0], (typeof all)[0]]
    guests.attribute(A, oldest.id)

    now += 1
    const late = guests.identify(null)

    // The oldest guest has a song queued, so the second-oldest makes way.
    assert.equal(late.emoji, second.emoji)
    assert.equal(guests.get(second.id), null)
    assert.notEqual(guests.get(oldest.id), null)
  })

  it('renames, switches animal, and follows the animal while no name is typed', () => {
    const guests = new Guests({ random: () => 0 })
    const guest = guests.identify(null)

    const frog = guests.update(guest.id, { emoji: '🐸' })
    assert.ok(frog.ok && frog.guest.name === 'Frog')

    const anna = guests.update(guest.id, { name: '  Anna  ' })
    assert.ok(anna.ok && anna.guest.name === 'Anna' && anna.guest.customName === 'Anna')

    const kept = guests.update(guest.id, { emoji: '🦉' })
    assert.ok(kept.ok && kept.guest.name === 'Anna')

    const cleared = guests.update(guest.id, { name: '' })
    assert.ok(cleared.ok && cleared.guest.name === 'Owl' && cleared.guest.customName === null)
  })

  it('refuses an animal somebody else has, one not in the set, and an unknown guest', () => {
    const guests = new Guests({ random: () => 0 })
    const fox = guests.identify(null)
    const other = guests.identify(null)

    assert.deepEqual(guests.update(other.id, { emoji: fox.emoji }), { ok: false, error: 'taken' })
    assert.deepEqual(guests.update(other.id, { emoji: '🍕' }), { ok: false, error: 'invalid' })
    assert.deepEqual(guests.update('nobody', { name: 'x' }), { ok: false, error: 'not_found' })
  })

  it('tags songs with who added them, and never takes a song from whoever added it first', () => {
    const guests = new Guests({ random: () => 0 })
    const fox = guests.identify(null)
    const frog = guests.identify(null)

    assert.equal(guests.attribute(A, fox.id), true)
    guests.confirm(A)
    // A duplicate add by somebody else records nothing.
    assert.equal(guests.attribute(A, frog.id), false)

    assert.deepEqual(guests.tagFor(A), { emoji: fox.emoji, name: fox.name, color: fox.color })
    assert.equal(guests.tagFor(B), null)
  })

  it('forgets songs that left the setlist, but not adds YARG has not answered yet', () => {
    const guests = new Guests()
    const guest = guests.identify(null)

    guests.attribute(A, guest.id)
    guests.confirm(A)
    guests.attribute(B, guest.id)

    // An update from somebody else's edit, before YARG has B.
    guests.retain([])
    assert.equal(guests.tagFor(A), null)
    assert.notEqual(guests.tagFor(B), null)

    guests.forget(B)
    assert.equal(guests.tagFor(B), null)
  })

  it('tells subscribers when a guest changes', () => {
    const guests = new Guests()
    const guest = guests.identify(null)
    let heard = 0
    guests.subscribe(() => heard++)

    guests.update(guest.id, { name: 'Anna' })
    assert.equal(heard, 1)
  })
})

describe('cleanName', () => {
  it('trims, collapses whitespace, drops control characters and cuts to length', () => {
    assert.equal(cleanName('  Anna \t Lee '), 'Anna Lee')
    assert.equal(cleanName('An\u0007na'), 'Anna')
    assert.equal(cleanName('   '), null)
    assert.equal(cleanName('x'.repeat(100))?.length, MAX_NAME_LENGTH)
  })

  it('counts characters, not UTF-16 units, so an emoji is never cut in half', () => {
    const name = cleanName('🎸'.repeat(30))
    assert.equal(Array.from(name ?? '').length, MAX_NAME_LENGTH)
  })
})
