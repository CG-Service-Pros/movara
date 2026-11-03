import { Badge } from '@movara/ui/badge'

const APP_NAMES: Record<string, string> = { granola: 'Granola', plaud: 'Plaud', manual: 'Manual', coach: 'Coach' }
export const appLabel = (a: string) => APP_NAMES[a.toLowerCase()] ?? a.charAt(0).toUpperCase() + a.slice(1)

export function timeAgo(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 90) return 'just now'
  if (s < 3600) return `${Math.round(s / 60)} min ago`
  if (s < 86400) return `${Math.round(s / 3600)} h ago`
  if (s < 86400 * 14) return `${Math.round(s / 86400)} d ago`
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function SourceBadge({ app }: { app: string }) {
  return <Badge tone={app.toLowerCase() === 'manual' ? 'neutral' : 'accent'}>{appLabel(app)}</Badge>
}

