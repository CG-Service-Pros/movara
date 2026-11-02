import type { Terms } from '@motion/core'
import type { ModuleKey } from '@motion/db'

export type IconKey =
  | 'home' | 'todos' | 'meeting' | 'priorities' | 'scorecard' | 'issues' | 'headlines' | 'vision' | 'chart' | 'agents' | 'settings'
  | 'general' | 'brand' | 'terminology' | 'modules' | 'calendar' | 'members' | 'keys' | 'audit' | 'approvals'

export type NavItem = {
  key: string
  label: string
  /** Path relative to the app root, without the query. */
  href: string
  /** Query string appended to links (e.g. team context). */
  query?: string
  icon: IconKey
  /** Team id for per-team items (active state also checks ?team=). */
  teamId?: string
  /** Match only the exact path (Home). */
  exact?: boolean
  /** Count shown as a pill (pending approvals). Hidden when 0. */
  badge?: number
}
export type NavSection = { key: string; label?: string; items: NavItem[] }

export type NavTeam = { id: string; name: string; isLeadership: boolean }

/**
 * The sidebar tree, with every label from terminology. Modules the org switched off are
 * omitted. Per-team items carry `?team=<teamId>`: feature pages read that search param
 * (default: the person's first team, the leadership team if they are on it).
 */
export function buildNav(o: { org: string; terms: Terms; teams: NavTeam[]; modules: Record<ModuleKey, boolean>; pendingApprovals?: number }): NavSection[] {
  const { org, terms: T, teams, modules: m } = o
  const base = `/${org}`
  const sections: NavSection[] = []

  const top: NavItem[] = [{ key: 'home', label: 'Home', href: base, icon: 'home', exact: true }]
  if (m.todos) top.push({ key: 'todos', label: `My ${T.t('todo', 'plural').toLowerCase()}`, href: `${base}/todos`, icon: 'todos' })
  sections.push({ key: 'top', items: top })

  for (const team of teams) {
    const q = `team=${team.id}`
    const items: NavItem[] = []
    if (m.meetings) items.push({ key: `meetings:${team.id}`, label: T.t('weekly_meeting', 'short'), href: `${base}/meetings`, query: q, icon: 'meeting', teamId: team.id })
    if (m.priorities) items.push({ key: `priorities:${team.id}`, label: T.t('priority', 'plural'), href: `${base}/priorities`, query: q, icon: 'priorities', teamId: team.id })
    if (m.scorecard) items.push({ key: `scorecard:${team.id}`, label: T.t('scorecard'), href: `${base}/scorecard`, query: q, icon: 'scorecard', teamId: team.id })
    if (m.issues) items.push({ key: `issues:${team.id}`, label: T.t('issues_list', 'short'), href: `${base}/issues`, query: q, icon: 'issues', teamId: team.id })
    if (items.length) sections.push({ key: `team:${team.id}`, label: team.name, items })
  }

  const company: NavItem[] = []
  if (m.vision) company.push({ key: 'vision', label: T.t('vision_plan', 'short'), href: `${base}/vision`, icon: 'vision' })
  if (m.chart) company.push({ key: 'chart', label: T.t('accountability_chart', 'short'), href: `${base}/chart`, icon: 'chart' })
  if (company.length) sections.push({ key: 'company', label: 'Company', items: company })

  const workspace: NavItem[] = []
  if (m.agents) workspace.push({ key: 'agents', label: 'Agents', href: `${base}/settings/agents`, icon: 'agents' })
  workspace.push({ key: 'settings', label: 'Settings', href: `${base}/settings`, icon: 'settings', badge: o.pendingApprovals })
  sections.push({ key: 'workspace', label: 'Workspace', items: workspace })
  return sections
}

/** Settings sub-navigation (used by the settings layout and the command palette). */
export function buildSettingsNav(org: string, modules: Record<ModuleKey, boolean>, pendingApprovals = 0): NavSection[] {
  const b = `/${org}/settings`
  const item = (key: string, label: string, icon: IconKey, badge?: number): NavItem => ({ key, label, href: `${b}/${key}`, icon, badge })
  return [
    { key: 'organization', label: 'Organization', items: [item('general', 'General', 'general'), item('brand', 'Brand', 'brand'), item('terminology', 'Terminology', 'terminology'), item('modules', 'Modules', 'modules'), item('calendar', 'Calendar', 'calendar'), item('members', 'Members', 'members')] },
    {
      key: 'agents',
      label: 'Agents',
      items: [
        ...(modules.agents ? [item('agents', 'Connected agents', 'agents'), item('keys', 'MCP & API keys', 'keys')] : []),
        item('approvals', 'Approvals', 'approvals', pendingApprovals),
        item('audit', 'Audit log', 'audit'),
      ],
    },
  ]
}

export const hrefOf = (i: NavItem) => (i.query ? `${i.href}?${i.query}` : i.href)

export type PaletteItem = { id: string; label: string; href: string; group: string; icon: IconKey; hint?: string }

/** Flatten nav sections into command-palette items (plus extra pages that are not in the sidebar). */
export function paletteItemsFrom(sections: NavSection[], extra: PaletteItem[] = []): PaletteItem[] {
  const items = sections.flatMap((s) =>
    s.items.map((i) => ({
      id: i.key,
      label: s.label && s.key.startsWith('team:') ? `${i.label} · ${s.label}` : i.label,
      href: hrefOf(i),
      group: s.key.startsWith('team:') ? 'Teams' : (s.label ?? 'Go to'),
      icon: i.icon,
    })),
  )
  return [...items, ...extra]
}

/** "New …" quick actions for the palette. Feature pages open their create form on `?new=1`. */
export function buildQuickActions(o: { org: string; terms: Terms; teams: NavTeam[]; modules: Record<ModuleKey, boolean> }): PaletteItem[] {
  const { org, terms: T, teams, modules: m } = o
  const team = teams[0] ? `team=${teams[0].id}&` : ''
  const out: PaletteItem[] = []
  if (m.priorities) out.push({ id: 'new:priority', label: `New ${T.t('priority').toLowerCase()}`, href: `/${org}/priorities?${team}new=1`, group: 'Create', icon: 'priorities' })
  if (m.issues) out.push({ id: 'new:issue', label: `New ${T.t('issue').toLowerCase()}`, href: `/${org}/issues?${team}new=1`, group: 'Create', icon: 'issues' })
  if (m.todos) out.push({ id: 'new:todo', label: `New ${T.t('todo').toLowerCase()}`, href: `/${org}/todos?new=1`, group: 'Create', icon: 'todos' })
  if (m.headlines) out.push({ id: 'new:headline', label: `New ${T.t('headline').toLowerCase()}`, href: `/${org}/headlines?new=1`, group: 'Create', icon: 'headlines' })
  if (m.scorecard) out.push({ id: 'new:metric', label: `New ${T.t('metric').toLowerCase()}`, href: `/${org}/scorecard?${team}new=1`, group: 'Create', icon: 'scorecard' })
  if (m.meetings) out.push({ id: 'new:meeting', label: `New ${T.t('weekly_meeting').toLowerCase()}`, href: `/${org}/meetings?new=1`, group: 'Create', icon: 'meeting' })
  return out
}
