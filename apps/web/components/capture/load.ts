import 'server-only'
import { listAgents, listMeetingCaptures, listPeople, type Ctx, type Terms } from '@movara/core'
import { itemView, noteView, type CaptureItemView, type CaptureNoteView, type CaptureLabels, type PersonOpt } from './types'

/** Plural terminology labels for the capture groups. */
export function captureLabels(terms: Terms): CaptureLabels {
  return { todo: terms.t('todo', 'plural'), issue: terms.t('issue', 'plural'), headline: terms.t('headline', 'plural'), decision: 'Decisions' }
}

export async function loadPeopleAndAgents(ctx: Ctx) {
  const [people, agents] = await Promise.all([listPeople(ctx), listAgents(ctx, { includeRevoked: true, includeBuiltin: true })])
  const opts: PersonOpt[] = people.map((p) => ({ id: p.id, name: p.name }))
  return { opts, names: { people: new Map(people.map((p) => [p.id, p.name])), agents: new Map(agents.map((a) => [a.id, a.name])) } }
}

/** Notes and items of one meeting as plain, serializable views. */
export async function loadMeetingCaptures(ctx: Ctx, meetingId: string): Promise<{ notes: CaptureNoteView[]; items: CaptureItemView[]; people: PersonOpt[] }> {
  const [{ notes, items }, { opts, names }] = await Promise.all([listMeetingCaptures(ctx, meetingId, { includeTranscript: true }), loadPeopleAndAgents(ctx)])
  return { notes: notes.map((n) => noteView(n, names)), items: items.map(itemView), people: opts }
}
