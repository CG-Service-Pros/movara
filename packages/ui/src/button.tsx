import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { Loader2 } from 'lucide-react'
import { cn } from './cn'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
export type ButtonSize = 'sm' | 'md' | 'icon'

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-white hover:brightness-110 shadow-[inset_0_0_0_1px_rgb(0_0_0/0.08)]',
  secondary: 'bg-surface text-ink shadow-[0_0_0_1px_var(--m-line)] hover:bg-canvas',
  ghost: 'bg-transparent text-body hover:bg-nav-active hover:text-ink',
  danger: 'bg-danger text-white hover:brightness-110',
}
const sizes: Record<ButtonSize, string> = {
  sm: 'h-6 px-2 text-xs gap-1.5 rounded-md',
  md: 'h-7 px-3 text-sm gap-1.5 rounded-md',
  icon: 'h-7 w-7 rounded-md',
}

/** Build button classes, for styling links or other elements like a button. */
export function buttonClasses(variant: ButtonVariant = 'secondary', size: ButtonSize = 'md', className?: string) {
  return cn(
    'inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap font-[550] outline-none transition-colors',
    'focus-visible:ring-2 focus-visible:ring-accent/50 disabled:pointer-events-none disabled:opacity-50 [&_svg]:shrink-0',
    variants[variant],
    sizes[size],
    className,
  )
}

export interface ButtonProps extends React.ComponentProps<'button'> {
  /** Visual style. Default `secondary`. */
  variant?: ButtonVariant
  /** `sm` 24px, `md` 28px (default), `icon` 28px square. */
  size?: ButtonSize
  /** Render the child element (e.g. a link) with button styling. */
  asChild?: boolean
  /** Shows a spinner and disables the button. */
  loading?: boolean
}

/** 28px action button. Use `primary` once per view, `secondary` by default, `ghost` in toolbars. */
export function Button({ variant = 'secondary', size = 'md', asChild, loading, disabled, className, children, type, ...props }: ButtonProps) {
  const Comp = asChild ? Slot : 'button'
  return (
    <Comp
      className={buttonClasses(variant, size, className)}
      disabled={disabled || loading}
      type={asChild ? undefined : (type ?? 'button')}
      aria-busy={loading || undefined}
      {...props}
    >
      {asChild ? (
        children
      ) : (
        <>
          {loading && <Loader2 size={14} strokeWidth={1.7} className="animate-spin" />}
          {children}
        </>
      )}
    </Comp>
  )
}
