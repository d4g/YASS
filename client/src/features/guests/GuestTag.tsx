/**
 * "🦊 Fox", in the guest's colour: who added a song, wherever it is shown.
 *
 * The colour is never the only thing that tells guests apart — the animal and
 * the name are always beside it — so it can stay a tint rather than having to
 * carry meaning a colour-blind guest would miss.
 */

import type { ButtonHTMLAttributes } from 'react'

import type { GuestTag as Tag } from '@shared/types'
import { cx } from '../../ui'

export function guestColor(tag: Pick<Tag, 'color'>): string {
  return `var(--guest-${tag.color})`
}

/** The tag's look: its colour for the text, and a 16% wash of it behind. */
function tagStyle(tag: Tag) {
  const color = guestColor(tag)
  return { color, background: `color-mix(in srgb, ${color} 16%, transparent)` }
}

const TAG_CLASS = cx(
  'inline-flex max-w-full min-w-0 items-center gap-[4px] px-[7px] py-[2px]',
  'text-[12px] leading-tight font-semibold not-italic',
)

export function GuestTag({ tag, label, className }: { tag: Tag; label?: string; className?: string }) {
  return (
    <span className={cx(TAG_CLASS, className)} style={{ ...tagStyle(tag), borderRadius: 'var(--radius-pill)' }}>
      <span aria-hidden>{tag.emoji}</span>
      {label ? <span className="sr-only">{label} </span> : null}
      <span dir="auto" className="truncate">
        {tag.name}
      </span>
    </span>
  )
}

/** The same tag as a button, for a guest's own marker. */
export function GuestTagButton({
  tag,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { tag: Tag }) {
  return (
    <button
      type="button"
      {...props}
      className={cx(
        TAG_CLASS,
        'cursor-pointer yarg-focusable hover:brightness-125 pointer-coarse:py-[6px]',
        className,
      )}
      style={{ ...tagStyle(tag), borderRadius: 'var(--radius-pill)' }}
    >
      <span aria-hidden>{tag.emoji}</span>
      <span dir="auto" className="truncate">
        {tag.name}
      </span>
    </button>
  )
}
