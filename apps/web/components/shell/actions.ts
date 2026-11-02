'use server'

import { search, isMotionError, type SearchHit } from '@motion/core'
import { getCtx, getOrgTerms } from '@/lib/ctx'

export type PaletteHit = { id: string; type: SearchHit['type']; typeLabel: string; title: string; subtitle?: string; href: string }

const AREA: Record<SearchHit['type'], string> = {
  priority: 'priorities', metric: 'scorecard', issue: 'issues', todo: 'todos', headline: 'headlines', person: 'settings/members', meeting: 'meetings',
}

/** Entity search for the ⌘K palette. Typed results with terminology labels and a link to the owning area. */
export async function searchEntities(slug: string, q: string): Promise<PaletteHit[]> {
  const query = q.trim()
  if (query.length < 2) return []
  try {
    const [ctx, T] = await Promise.all([getCtx(slug), getOrgTerms(slug)])
    const hits = await search(ctx, query, { limit: 12 })
    const label: Record<SearchHit['type'], string> = {
      priority: T.t('priority'), metric: T.t('metric'), issue: T.t('issue'), todo: T.t('todo'), headline: T.t('headline'), person: 'Person', meeting: T.t('weekly_meeting'),
    }
    return hits.map((h) => {
      const href =
        h.type === 'meeting' ? `/${slug}/meetings/${h.id}`
        : h.type === 'person' ? `/${slug}/settings/members`
        : `/${slug}/${AREA[h.type]}?${h.teamId ? `team=${h.teamId}&` : ''}id=${h.id}`
      return { id: `${h.type}:${h.id}`, type: h.type, typeLabel: label[h.type], title: h.title, subtitle: h.subtitle, href }
    })
  } catch (e) {
    if (isMotionError(e)) return []
    throw e
  }
}
