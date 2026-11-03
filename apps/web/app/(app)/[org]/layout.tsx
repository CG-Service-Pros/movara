import { Suspense, type ReactNode } from 'react'
import { cookies } from 'next/headers'
import { isMockMode } from '@movara/coach'
import { countPendingCaptures, getCoachProfile, hasRole, listApprovals, listMembershipsForUser } from '@movara/core'
import { AppShell } from '@/components/shell/app-shell'
import { buildNav, buildQuickActions, buildSettingsNav, paletteItemsFrom } from '@/components/shell/nav'
import { getDb } from '@/lib/db'
import { getMyTeams, getOrgContext } from '@/lib/ctx'
import { getSession } from '@/lib/session'

/** The app shell for every page under /{org}. Membership is enforced by getOrgContext -> getCtx. */
export default async function OrgLayout({ children, params }: { children: ReactNode; params: Promise<{ org: string }> }) {
  const { org: slug } = await params
  const { ctx, org, terms, modules } = await getOrgContext(slug)
  const [teams, session, theme] = await Promise.all([getMyTeams(slug), getSession(), cookies()])
  const memberships = await listMembershipsForUser(await getDb(), session!.user.id)
  const pendingApprovals = (await listApprovals(ctx, { status: 'pending', limit: 100 }).catch(() => ({ items: [] }))).items.length

  const pendingCaptures = await countPendingCaptures(ctx).catch(() => 0)
  const profile = await getCoachProfile(ctx)
  const lc = (s: string) => s.toLowerCase()

  const sections = buildNav({ org: slug, terms, teams, modules, pendingApprovals, pendingCaptures })
  const settings = buildSettingsNav(slug, modules, pendingApprovals)
  const palette = paletteItemsFrom(sections, [
    ...buildQuickActions({ org: slug, terms, teams, modules }),
    ...settings.flatMap((s) => s.items.map((i) => ({ id: `settings:${i.key}`, label: i.label, href: i.href, group: 'Settings', icon: i.icon }))),
    ...(modules.headlines ? [{ id: 'headlines', label: terms.t('headline', 'plural'), href: `/${slug}/headlines`, group: 'Go to', icon: 'headlines' as const }] : []),
  ])

  return (
    <Suspense fallback={null}>
      <AppShell
        accent={org.branding.accent}
        sections={sections}
        palette={palette}
        coach={{
          coachName: profile.coachName,
          ready: profile.ready || isMockMode(),
          canConfigure: hasRole(ctx, 'admin'),
          labels: {
            priority: lc(terms.t('priority')), priorities: lc(terms.t('priority', 'plural')), metrics: lc(terms.t('metric', 'plural')),
            issues: lc(terms.t('issue', 'plural')), todos: lc(terms.t('todo', 'plural')), meeting: lc(terms.t('weekly_meeting')), vision: lc(terms.t('vision_plan')),
          },
        }}
        switcher={{
          orgSlug: slug,
          wordmark: org.branding.wordmark || org.name,
          logoLight: org.branding.logoLight,
          logoDark: org.branding.logoDark,
          orgs: memberships.map((m) => ({ slug: m.slug, name: m.name })),
          user: { name: session!.user.name, email: session!.user.email },
          initialTheme: theme.get('movara-theme')?.value === 'dark' ? 'dark' : 'light',
        }}
      >
        {children}
      </AppShell>
    </Suspense>
  )
}
