import type { ReactNode } from 'react'

/** Centered card used by sign-in, sign-up and onboarding. */
export function AuthCard({ title, subtitle, children, footer }: { title: string; subtitle?: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="grid min-h-screen place-items-center bg-canvas px-4">
      <div className="w-full max-w-[380px]">
        <div className="mb-6 text-center text-lg font-[650] tracking-tight text-ink">Motion</div>
        <div className="rounded-xl bg-surface p-6 shadow-panel">
          <h1 className="text-lg font-semibold text-ink">{title}</h1>
          {subtitle && <p className="mt-1 text-base text-body">{subtitle}</p>}
          <div className="mt-5">{children}</div>
        </div>
        {footer && <div className="mt-4 text-center text-sm text-body">{footer}</div>}
      </div>
    </div>
  )
}
