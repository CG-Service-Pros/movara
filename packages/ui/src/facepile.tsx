import * as React from 'react'
import { cn } from './cn'
import { Avatar } from './avatar'
import { AgentMark } from './agent-mark'

export interface FacepileItem {
  name: string
  /** Render as an agent (rounded square) instead of a person. */
  agent?: boolean
  src?: string
}

export interface FacepileProps extends Omit<React.ComponentProps<'div'>, 'children'> {
  items: FacepileItem[]
  /** Max faces shown before "+N". Default 3. */
  max?: number
  /** Pixel size of each face. Default 20. */
  size?: number
}

/** Overlapping people and agents with a +N overflow chip. */
export function Facepile({ items, max = 3, size = 20, className, ...props }: FacepileProps) {
  const shown = items.slice(0, max)
  const extra = items.length - shown.length
  const ring = 'rounded-[inherit] shadow-[0_0_0_2px_var(--m-surface)]'
  return (
    <div className={cn('inline-flex items-center', className)} {...props}>
      {shown.map((it, i) => (
        <span key={`${it.name}-${i}`} className={cn('inline-flex rounded-full', i > 0 && '-ml-1.5')} title={it.name}>
          {it.agent ? (
            <AgentMark size={size} className="shadow-[0_0_0_2px_var(--m-surface)]" aria-label={`${it.name} (agent)`} />
          ) : (
            <Avatar name={it.name} src={it.src} size={size} className={ring} />
          )}
        </span>
      ))}
      {extra > 0 && (
        <span
          className="-ml-1.5 inline-flex items-center justify-center rounded-full bg-canvas px-1 text-2xs font-[550] text-body shadow-[0_0_0_2px_var(--m-surface)]"
          style={{ minWidth: size, height: size }}
        >
          +{extra}
        </span>
      )}
    </div>
  )
}
