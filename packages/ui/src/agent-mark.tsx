import * as React from 'react'
import { Bot } from 'lucide-react'
import { cn } from './cn'

export interface AgentMarkProps extends Omit<React.ComponentProps<'span'>, 'children'> {
  /** Pixel size, default 18. */
  size?: number
}

/** Agents are rounded squares with a Bot glyph; people are circles (see Avatar). */
export function AgentMark({ size = 18, className, style, ...props }: AgentMarkProps) {
  return (
    <span
      role="img"
      aria-label="Agent"
      className={cn('inline-grid shrink-0 place-items-center bg-agent text-agent-text', className)}
      style={{ width: size, height: size, borderRadius: Math.max(4, Math.round(size * 0.28)), ...style }}
      {...props}
    >
      <Bot size={Math.round(size * 0.62)} strokeWidth={2} />
    </span>
  )
}
