/** 'Dec 31' (UTC, since due dates are plain calendar dates). Adds the year when it differs from `ref`. */
export function fmtDate(d: string | null | undefined, ref?: string): string {
  if (!d) return ''
  const dt = new Date(`${d}T12:00:00Z`)
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', timeZone: 'UTC' }
  if (ref && ref.slice(0, 4) !== d.slice(0, 4)) opts.year = 'numeric'
  return dt.toLocaleDateString('en-US', opts)
}

/** '2026-Q4' -> 'Q4 2026'. */
export function quarterLabel(q: string): string {
  const [y, n] = q.split('-')
  return `${n} ${y}`
}

export function newRequestId(): string {
  return globalThis.crypto.randomUUID()
}
