import 'server-only'
import { getHeadline, getIssue, getMetric, getPriority, getTodo, listPeople, listTeams, listMeetings, type Ctx } from '@motion/core'

export type SourceRef = { type: string; id: string } | null

const LABELS: Record<string, string> = { priority: 'priority', metric: 'metric', headline: 'headline', todo: 'to-do', issue: 'issue', meeting: 'meeting' }

/** Resolves {type,id} sources to display titles via core getters. Unknown/missing items keep just the label. */
export async function resolveSources(ctx: Ctx, labelFor: (type: string) => string | undefined, sources: SourceRef[]) {
  const uniq = new Map<string, { type: string; id: string }>()
  for (const s of sources) if (s) uniq.set(`${s.type}:${s.id}`, s)
  const out = new Map<string, { type: string; id: string; title: string | null; label: string }>()
  await Promise.all(
    [...uniq.entries()].map(async ([key, s]) => {
      let title: string | null = null
      try {
        if (s.type === 'priority') title = (await getPriority(ctx, s.id)).title
        else if (s.type === 'metric') title = (await getMetric(ctx, s.id)).title
        else if (s.type === 'headline') title = (await getHeadline(ctx, s.id)).text
        else if (s.type === 'todo') title = (await getTodo(ctx, s.id)).title
        else if (s.type === 'issue') title = (await getIssue(ctx, s.id)).title
      } catch {
        title = null
      }
      out.set(key, { type: s.type, id: s.id, title, label: labelFor(s.type) ?? LABELS[s.type] ?? s.type })
    }),
  )
  return (s: SourceRef) => (s ? (out.get(`${s.type}:${s.id}`) ?? null) : null)
}

export async function peopleAndTeams(ctx: Ctx) {
  const [people, teams] = await Promise.all([listPeople(ctx), listTeams(ctx)])
  return {
    people: people.map((p) => ({ id: p.id, name: p.name })),
    teams: teams.map((t) => ({ id: t.id, name: t.name, isLeadership: t.isLeadership })),
  }
}
export { listMeetings }
