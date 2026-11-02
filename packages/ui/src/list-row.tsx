import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cn } from './cn'

export interface ListRowProps extends Omit<React.ComponentProps<'div'>, 'title'> {
  /** Leading slot: StatusGlyph, Checkbox, Avatar... */
  leading?: React.ReactNode
  title: React.ReactNode
  /** Secondary content right after the title (counts, owner). */
  meta?: React.ReactNode
  /** Right-aligned slot: Meter, due date, Facepile... */
  trailing?: React.ReactNode
  /** Accent-tinted selected state. */
  selected?: boolean
  /**
   * Render the child as the row root (e.g. `<ListRow asChild><a href>...`). The child's own children are
   * replaced by the row layout, so pass the element with no children: `<ListRow asChild title="x"><Link href="/x" /></ListRow>`.
   */
  asChild?: boolean
}

/** 44px list row with leading / title / meta / trailing. Interactive when given onClick or asChild (link). */
export function ListRow({ leading, title, meta, trailing, selected, asChild, className, children, ...props }: ListRowProps) {
  const content = (
    <>
      {leading != null && <span className="flex shrink-0 items-center">{leading}</span>}
      <span className="min-w-0 flex-1 truncate text-base font-[500] text-ink">{title}</span>
      {meta != null && <span className="flex shrink-0 items-center gap-1.5 text-xs text-body">{meta}</span>}
      {trailing != null && <span className="flex shrink-0 items-center gap-3 text-sm text-body">{trailing}</span>}
    </>
  )
  const interactive = asChild || props.onClick != null
  const classes = cn(
    'flex h-11 w-full items-center gap-3 rounded-md px-3 text-left outline-none',
    interactive && 'cursor-default hover:bg-canvas focus-visible:ring-2 focus-visible:ring-accent/50',
    selected && 'bg-accent-soft hover:bg-accent-soft',
    className,
  )
  if (asChild) {
    const child = React.Children.only(children) as React.ReactElement<{ children?: React.ReactNode }>
    return (
      <Slot className={classes} data-selected={selected || undefined} aria-current={selected || undefined} {...(props as object)}>
        {React.cloneElement(child, undefined, content)}
      </Slot>
    )
  }
  return (
    <div
      className={classes}
      data-selected={selected || undefined}
      aria-current={selected || undefined}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      {...props}
    >
      {content}
      {children}
    </div>
  )
}

/** Uppercase section heading between groups of rows ("Delivery team"); `count` is optional. */
export function ListRowGroup({ className, children, count, ...props }: Omit<React.ComponentProps<'div'>, 'children'> & { children: React.ReactNode; count?: React.ReactNode }) {
  return (
    <div className={cn('mx-3 mb-1.5 mt-[18px] flex items-center justify-between text-xs font-semibold uppercase tracking-[0.04em] text-faint', className)} {...props}>
      <span>{children}</span>
      {count != null && <span className="font-[500] normal-case tracking-normal text-body">{count}</span>}
    </div>
  )
}
