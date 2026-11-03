'use client'

import * as React from 'react'
import { Check } from 'lucide-react'
import { cn } from '@movara/ui/cn'
import { toast } from '@movara/ui/toaster'
import { recordMetricAction } from './actions'

export type DueMetric = { id: string; title: string; periodStart: string; goalText: string; unit: 'number' | 'percent' | 'currency' | 'duration' | 'boolean'; teamName: string }

const adorn: Record<DueMetric['unit'], { pre?: string; post?: string }> = {
  number: {},
  percent: { post: '%' },
  currency: { pre: '$' },
  duration: { post: 'h' },
  boolean: {},
}

/** Inline value entry for the metrics I own that still lack this period's value. */
export function MetricsDue({ slug, metrics }: { slug: string; metrics: DueMetric[] }) {
  return (
    <ul className="divide-y divide-line-faint">
      {metrics.map((m) => (
        <MetricRow key={m.id} slug={slug} m={m} />
      ))}
    </ul>
  )
}

function MetricRow({ slug, m }: { slug: string; m: DueMetric }) {
  const [value, setValue] = React.useState('')
  const [saved, setSaved] = React.useState<{ v: number; status: string } | null>(null)
  const [busy, setBusy] = React.useState(false)
  const { pre, post } = adorn[m.unit]

  async function save() {
    const n = Number(value.replace(/,/g, ''))
    if (value.trim() === '' || !Number.isFinite(n)) return toast.error('Enter a number')
    setBusy(true)
    const r = await recordMetricAction(slug, m.id, m.periodStart, n, globalThis.crypto.randomUUID())
    setBusy(false)
    if (!r.ok) return toast.error(r.error)
    if (r.message) return toast(r.message)
    setSaved({ v: n, status: r.data?.status ?? 'on' })
  }

  return (
    <li className="flex min-h-14 items-center justify-between gap-3 py-2">
      <div className="min-w-0">
        <div className="truncate text-base font-[550] text-ink">{m.title}</div>
        <div className="truncate text-xs text-body">{[m.goalText, m.teamName].filter(Boolean).join(' · ')}</div>
      </div>
      {saved ? (
        <span className={cn('inline-flex items-center gap-1.5 text-lg font-[650] tabular-nums', saved.status === 'off' ? 'text-danger-text' : 'text-success-text')} aria-live="polite">
          <Check size={15} strokeWidth={2.2} />
          {pre}
          {saved.v}
          {post}
        </span>
      ) : (
        <form
          className="flex shrink-0 items-center gap-1.5"
          onSubmit={(e) => {
            e.preventDefault()
            void save()
          }}
        >
          <label className="relative">
            <span className="sr-only">Value for {m.title}</span>
            {pre && <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-faint">{pre}</span>}
            <input
              inputMode="decimal"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="Enter value"
              disabled={busy}
              className={cn(
                'h-8 w-[118px] rounded-lg bg-surface text-right text-sm font-[500] max-sm:h-9 max-sm:text-[16px] tabular-nums text-ink shadow-[0_0_0_1px_var(--m-line)] outline-none placeholder:text-faint focus:shadow-[0_0_0_1.5px_var(--color-accent),0_0_0_4px_var(--color-accent-soft)]',
                pre ? 'pl-6 pr-2.5' : 'px-2.5',
                post && 'pr-6',
              )}
            />
            {post && <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-sm text-faint">{post}</span>}
          </label>
          <button
            type="submit"
            disabled={busy || value.trim() === ''}
            className="h-8 rounded-lg bg-accent px-3 text-sm font-[550] text-white outline-none transition-opacity focus-visible:ring-2 focus-visible:ring-accent/50 disabled:opacity-0"
          >
            Save
          </button>
        </form>
      )}
    </li>
  )
}
