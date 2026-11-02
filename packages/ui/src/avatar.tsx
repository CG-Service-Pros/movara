import * as React from 'react'
import { cn } from './cn'

function hash(s: string) {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return h
}

/** Up to two initials from a name. */
export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  const first = parts[0]![0]!
  const last = parts.length > 1 ? parts[parts.length - 1]![0]! : ''
  return (first + last).toUpperCase()
}

export interface AvatarProps extends Omit<React.ComponentProps<'span'>, 'children'> {
  /** Person's name; drives initials and the deterministic color. */
  name: string
  /** Pixel size, default 20. */
  size?: number
  /** Optional photo URL. */
  src?: string
}

/** Person circle with initials (or photo). Color is stable per name. */
export function Avatar({ name, size = 20, src, className, style, ...props }: AvatarProps) {
  // Muted hue from the name, mixed with theme surface/ink so it works in light and dark.
  const hue = (hash(name) * 47) % 360
  const tone: React.CSSProperties = src
    ? {}
    : {
        background: `color-mix(in oklab, oklch(0.62 0.1 ${hue}) 20%, var(--m-surface))`,
        color: `color-mix(in oklab, oklch(0.55 0.12 ${hue}) 70%, var(--m-ink))`,
      }
  return (
    <span
      role="img"
      aria-label={name}
      title={name}
      className={cn('inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full font-semibold', className)}
      style={{ width: size, height: size, fontSize: Math.max(8, Math.round(size * 0.42)), ...tone, ...style }}
      {...props}
    >
      {src ? <img src={src} alt="" className="h-full w-full object-cover" /> : initials(name)}
    </span>
  )
}
