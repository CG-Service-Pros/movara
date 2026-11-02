import { hasRole } from '@motion/core'
import { Page } from '@/components/shell/page'
import { ModulesForm, type ModuleRow } from '@/components/settings/modules-form'
import { SettingsBody } from '@/components/settings/ui'
import { getOrgContext } from '@/lib/ctx'

export default async function ModulesPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params
  const { ctx, terms: T, modules } = await getOrgContext(slug)
  const rows: ModuleRow[] = [
    { key: 'vision', label: T.t('vision_plan'), description: 'The company vision, kept as published revisions.' },
    { key: 'chart', label: T.t('accountability_chart'), description: 'Seats, roles and who is accountable for what.' },
    { key: 'priorities', label: T.t('priority', 'plural'), description: 'Quarterly goals with owners and milestones.' },
    { key: 'scorecard', label: T.t('scorecard'), description: 'Weekly numbers with on-track and off-track targets.' },
    { key: 'issues', label: T.t('issue', 'plural'), description: 'Short and long-term problems to solve together.' },
    { key: 'todos', label: T.t('todo', 'plural'), description: 'Personal action items with due dates.' },
    { key: 'headlines', label: T.t('headline', 'plural'), description: 'Quick good-news and customer updates shared with the team.' },
    { key: 'meetings', label: T.t('weekly_meeting', 'plural'), description: 'Agendas, timers, ratings and recaps.' },
    { key: 'agents', label: 'Agents', description: 'Connect AI agents with scoped, audited access.' },
  ].map((m) => ({ ...m, enabled: modules[m.key as keyof typeof modules] }))
  return (
    <Page title="Modules" meta="Hide what your team does not use">
      <SettingsBody>
        <ModulesForm slug={slug} modules={rows} canEdit={hasRole(ctx, 'admin')} />
      </SettingsBody>
    </Page>
  )
}
