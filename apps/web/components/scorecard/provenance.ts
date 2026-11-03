import 'server-only'
import { listAgents, listPeople, requireRead, type Ctx, type ScorecardMetric } from '@movara/core'

export type Provenance = { agent: boolean; name: string; onBehalfOf: string | null; at: string }

/** Who wrote each visible value, derived from the cells' `enteredByActor` / `updatedAt`. Key: `${metricId}|${periodStart}`. */
export async function valueProvenance(ctx: Ctx, metrics: Pick<ScorecardMetric, 'id' | 'cells'>[]): Promise<Record<string, Provenance>> {
  requireRead(ctx)
  const [agents, people] = await Promise.all([listAgents(ctx, { includeRevoked: true }), listPeople(ctx)])
  const agentName = new Map(agents.map((a) => [a.id, a.name]))
  const personName = new Map(people.map((p) => [p.id, p.name]))
  const out: Record<string, Provenance> = {}
  for (const m of metrics) {
    for (const c of m.cells) {
      const actor = c.enteredByActor
      if (!actor || !c.updatedAt) continue
      const agent = actor.type === 'agent'
      out[`${m.id}|${c.periodStart}`] = {
        agent,
        name: (agent ? agentName.get(actor.id) : personName.get(actor.id)) ?? (agent ? 'An agent' : 'Someone'),
        onBehalfOf: actor.onBehalfOf ? (personName.get(actor.onBehalfOf) ?? null) : null,
        at: c.updatedAt.toISOString(),
      }
    }
  }
  return out
}
