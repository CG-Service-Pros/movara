import {
  Bot, Building2, CalendarDays, Gauge, Home, Inbox, KeyRound, LayoutGrid, ListChecks, Mountain, Network, Newspaper, Palette, ScrollText, Settings, ShieldCheck, Target, TriangleAlert, Type, Users,
  type LucideIcon,
} from 'lucide-react'
import type { IconKey } from './nav'

const ICONS: Record<IconKey, LucideIcon> = {
  home: Home, todos: ListChecks, meeting: Users, priorities: Target, scorecard: Gauge, issues: TriangleAlert, headlines: Newspaper, vision: Mountain, chart: Network,
  agents: Bot, settings: Settings, general: Building2, brand: Palette, terminology: Type, modules: LayoutGrid, calendar: CalendarDays, members: Users, keys: KeyRound,
  audit: ScrollText, approvals: ShieldCheck, inbox: Inbox,
}

/** Lucide icon at the design system size (15px, stroke 1.7). */
export function NavIcon({ name, size = 15 }: { name: IconKey; size?: number }) {
  const Icon = ICONS[name]
  return <Icon size={size} strokeWidth={1.7} />
}
