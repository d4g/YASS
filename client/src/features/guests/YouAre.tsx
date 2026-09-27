/**
 * This phone's own marker, and the place to change it.
 *
 * Shown only once the phone is a guest — after its first "Add to setlist" —
 * because before that there is nothing to change. Tapping the marker opens a
 * small editor in place, not a dialog: a name field, and the animals nobody
 * else has. A dialog over a party app is one more thing to dismiss on
 * somebody else's phone.
 *
 * Every change saves as it happens. The name is sent when the field is left or
 * Enter is pressed, and an empty name goes back to the animal's.
 */

import { useEffect, useId, useState } from 'react'

import { GUEST_ANIMALS } from '@shared/types'
import { loadGuest, updateGuest, useGuest, type GuestUpdateError } from '../../lib/guest'
import { Button, cx, TextField } from '../../ui'
import { guestColor, GuestTagButton } from './GuestTag'

const MAX_NAME_LENGTH = 24

const ERRORS: Record<GuestUpdateError, string> = {
  taken: 'Someone just took that one. Pick another.',
  invalid: 'That didn’t work. Try again.',
  not_found: 'YASS restarted since. Your next song gets you a new animal.',
  unavailable: 'Can’t reach YASS right now.',
}

export function YouAre({ className }: { className?: string }) {
  const guest = useGuest()
  const [open, setOpen] = useState(false)
  const [available, setAvailable] = useState<string[]>([])
  const [name, setName] = useState('')
  const [error, setError] = useState<GuestUpdateError | null>(null)
  const nameId = useId()

  // The field starts from what the guest typed, never from the animal's name:
  // an untouched field is the one that follows the animal.
  useEffect(() => {
    if (open) setName(guest?.customName ?? '')
  }, [open, guest?.customName])

  useEffect(() => {
    if (!open) return
    let current = true
    void loadGuest()
      .then((info) => {
        if (current) setAvailable(info.available)
      })
      .catch(() => {
        if (current) setError('unavailable')
      })
    return () => {
      current = false
    }
  }, [open])

  if (!guest) return null

  const saveName = async () => {
    const next = name.trim()
    if (next === (guest.customName ?? '')) return
    setError(null)
    const outcome = await updateGuest({ name: next === '' ? null : next })
    if (!outcome.ok) setError(outcome.error)
  }

  const pick = async (emoji: string) => {
    if (emoji === guest.emoji) return
    setError(null)
    const outcome = await updateGuest({ emoji })
    if (outcome.ok) setAvailable((list) => list.filter((entry) => entry !== emoji).concat(guest.emoji))
    else setError(outcome.error)
  }

  // Yours first, then the free ones, in the set's own order.
  const choices = GUEST_ANIMALS.filter(
    (animal) => animal.emoji === guest.emoji || available.includes(animal.emoji),
  )

  return (
    <div className={cx('flex min-w-0 flex-col gap-[10px]', className)}>
      <div className="flex min-w-0 items-center gap-[8px] text-[13px] text-content-muted">
        <span className="shrink-0">You’re</span>
        <GuestTagButton
          tag={guest}
          aria-expanded={open}
          aria-label={`You’re ${guest.name}. Change your name or animal`}
          onClick={() => setOpen((value) => !value)}
        />
      </div>

      {open ? (
        <div className="flex flex-col gap-[12px] bg-surface-sunken p-[12px]" style={{ borderRadius: 'var(--radius-md)' }}>
          <label htmlFor={nameId} className="yarg-label text-[11px] text-content-muted">
            Your name
          </label>
          <TextField
            id={nameId}
            value={name}
            maxLength={MAX_NAME_LENGTH}
            placeholder={GUEST_ANIMALS.find((animal) => animal.emoji === guest.emoji)?.name ?? 'Guest'}
            autoComplete="nickname"
            enterKeyHint="done"
            onChange={(event) => setName(event.target.value)}
            onBlur={() => void saveName()}
            onKeyDown={(event) => {
              if (event.key === 'Enter') event.currentTarget.blur()
            }}
          />

          <p className="yarg-label text-[11px] text-content-muted">Your animal</p>
          <div role="radiogroup" aria-label="Your animal" className="flex flex-wrap gap-[6px]">
            {choices.map((animal) => {
              const mine = animal.emoji === guest.emoji
              return (
                <button
                  key={animal.emoji}
                  type="button"
                  role="radio"
                  aria-checked={mine}
                  aria-label={animal.name}
                  title={animal.name}
                  onClick={() => void pick(animal.emoji)}
                  className={cx(
                    'flex size-[40px] items-center justify-center text-[22px] yarg-focusable',
                    'pointer-coarse:size-[44px]',
                    mine ? '' : 'hover:bg-surface-hover',
                  )}
                  style={{
                    borderRadius: 'var(--radius-md)',
                    boxShadow: mine ? `inset 0 0 0 2px ${guestColor(guest)}` : undefined,
                  }}
                >
                  {animal.emoji}
                </button>
              )
            })}
          </div>

          <p className="text-[13px] leading-tight text-content-muted empty:hidden" aria-live="polite">
            {error ? ERRORS[error] : null}
          </p>

          <Button className="self-start" onClick={() => setOpen(false)}>
            done
          </Button>
        </div>
      ) : null}
    </div>
  )
}
