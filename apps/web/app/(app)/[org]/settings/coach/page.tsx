import { and, eq, gte, lt, sql } from 'drizzle-orm'
import { aiUsage } from '@movara/db'
import { getAiSettings, getCoachProfile, getUsageSummary, hasRole, listPeople } from '@movara/core'
import { Page } from '@/components/shell/page'
import { CoachForm, type UsageView } from '@/components/settings/coach-form'
import { SettingsBody } from '@/components/settings/ui'
import { getOrgContext } from '@/lib/ctx'

export default async function CoachSettingsPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params
  const { ctx } = await getOrgContext(slug)
  const people = await listPeople(ctx)
  const me = people.find((p) => p.id === (ctx.actor.type === 'person' ? ctx.actor.id : ctx.actor.onBehalfOf))
  const isAdmin = hasRole(ctx, 'admin')
  let usage: UsageView | null = null
  let settings = null
  if (isAdmin) {
    settings = await getAiSettings(ctx)
    const s = await getUsageSummary(ctx)
    const [y, m] = s.month.split('-').map(Number) as [number, number]
    const rows = await ctx.db
      .select({
        personId: aiUsage.personId,
        input: sql<number>`coalesce(sum(${aiUsage.inputTokens}), 0)`,
        output: sql<number>`coalesce(sum(${aiUsage.outputTokens}), 0)`,
        cost: sql<number>`coalesce(sum(${aiUsage.costEstimateUsd}), 0)`,
      })
      .from(aiUsage)
      .where(and(eq(aiUsage.orgId, ctx.orgId), gte(aiUsage.at, new Date(Date.UTC(y, m - 1, 1))), lt(aiUsage.at, new Date(Date.UTC(y, m, 1)))))
      .groupBy(aiUsage.personId)
    const names = new Map(people.map((p) => [p.id, p.name]))
    usage = {
      month: s.month, inputTokens: s.inputTokens, outputTokens: s.outputTokens, costEstimateUsd: s.costEstimateUsd, limit: s.limit, overLimit: s.overLimit,
      byFeature: Object.entries(s.byFeature).map(([feature, v]) => ({ feature, ...v })),
      byPerson: rows
        .map((r) => ({ name: r.personId ? (names.get(r.personId) ?? 'Unknown') : 'System', inputTokens: Number(r.input), outputTokens: Number(r.output), costEstimateUsd: Number(r.cost) }))
        .sort((a, b) => b.inputTokens + b.outputTokens - (a.inputTokens + a.outputTokens)),
    }
  }
  return (
    <Page title="Coach" meta="AI provider, personality and usage">
      <SettingsBody>
        <CoachForm
          slug={slug}
          canEdit={isAdmin}
          mock={process.env.MOVARA_AI_MOCK === '1'}
          myFirstName={(me?.name ?? 'there').split(' ')[0]!}
          settings={settings && { enabled: settings.enabled, provider: settings.provider, baseUrl: settings.baseUrl, model: settings.model, reasoningEffort: settings.reasoningEffort, monthlyTokenLimit: settings.monthlyTokenLimit, coachName: settings.coachName, coachPersonality: settings.coachPersonality, hasKey: settings.hasKey, keyLast4: settings.keyLast4 }}
          usage={usage}
          profile={isAdmin ? null : await getCoachProfile(ctx)}
        />
      </SettingsBody>
    </Page>
  )
}
