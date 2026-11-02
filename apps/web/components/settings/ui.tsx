import type { ComponentProps, ReactNode } from 'react'
import { cn } from '@motion/ui/cn'
import { controlClasses } from '@motion/ui/input'

/** Centered, scrolling column used by every settings page. */
export function SettingsBody({ children, wide }: { children: ReactNode; wide?: boolean }) {
  return <div className={cn('mx-auto flex w-full flex-col gap-7 px-6 py-6', wide ? 'max-w-[920px]' : 'max-w-[720px]')}>{children}</div>
}

/** Titled group with an optional description and right-side actions. */
export function Section({ title, description, actions, children }: { title?: ReactNode; description?: ReactNode; actions?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      {(title || actions) && (
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            {title && <h2 className="text-lg font-semibold tracking-tight text-ink">{title}</h2>}
            {description && <p className="mt-0.5 text-base text-body">{description}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  )
}

/** Bordered list container whose children are separated by hairlines. */
export function Panel({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('divide-y divide-line-faint overflow-hidden rounded-xl bg-surface shadow-panel', className)} {...props} />
}

/** Native select styled like the other controls. */
export function NativeSelect({ className, ...props }: ComponentProps<'select'>) {
  return <select className={cn(controlClasses, 'h-7 px-2', className)} {...props} />
}

export function Mono({ className, ...props }: ComponentProps<'code'>) {
  return <code className={cn('rounded-sm bg-canvas px-1.5 py-0.5 font-mono text-xs text-ink', className)} {...props} />
}

export const fmtDate = (d: Date | string | null | undefined) =>
  d ? new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'Never'

export function ago(d: Date | string | null | undefined) {
  if (!d) return 'never'
  const s = Math.max(0, (Date.now() - new Date(d).getTime()) / 1000)
  if (s < 90) return 'just now'
  if (s < 3600) return `${Math.round(s / 60)} min ago`
  if (s < 86400) return `${Math.round(s / 3600)} h ago`
  return `${Math.round(s / 86400)} d ago`
}
