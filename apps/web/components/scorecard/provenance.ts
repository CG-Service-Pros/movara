import 'server-only'
import { and, eq, inArray, isNull } from 'drizzle-orm'
import { metricValues } from '@motion/db'
import { listAgents, listPeople, requireRead, type Ctx } from '@motion/core'

export type Provenance = { agent: boolean; name: string; onBehalfOf: string | null; at: string }

/**
 * Who wrote each visible value. Core's getScorecard cells do not expose `entered_by_actor` / `updated_at`
 * yet, so this reads them for the already-authorized metrics (org-scoped). Key: `${metricId}|${periodStart}`.
 */
export async function valueProvenance(ctx: Ctx, metricIds: string[], periods: string[]): Promise<Record<string, Provenance>> {
  requireRead(ctx)
  if (!metricIds.length) return {}
  const [rows, agents, people] = await Promise.all([
    ctx.db
      .select({ metricId: metricValues.metricId, periodStart: metricValues.periodStart, actor: metricValues.enteredByActor, at: metricValues.updatedAt })
      .from(metricValues)
      .where(and(eq(metricValues.orgId, ctx.orgId), isNull(metricValues.deletedAt), inArray(metricValues.metricId, metricIds), inArray(metricValues.periodStart, periods))),
    listAgents(ctx, { includeRevoked: true }),
    listPeople(ctx),
  ])
  const agentName = new Map(agents.map((a) => [a.id, a.name]))
  const personName = new Map(people.map((p) => [p.id, p.name]))
  const out: Record<string, Provenance> = {}
  for (const r of rows) {
    if (!r.actor) continue
    const agent = r.actor.type === 'agent'
    out[`${r.metricId}|${r.periodStart}`] = {
      agent,
      name: (agent ? agentName.get(r.actor.id) : personName.get(r.actor.id)) ?? (agent ? 'An agent' : 'Someone'),
      onBehalfOf: r.actor.onBehalfOf ? (personName.get(r.actor.onBehalfOf) ?? null) : null,
      at: r.at.toISOString(),
    }
  }
  return out
}
