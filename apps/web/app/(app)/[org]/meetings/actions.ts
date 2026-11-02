'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { execute, isMotionError, meetingSeriesCreate, meetingStart, zonedToUtc, getOrg } from '@motion/core'
import { getCtx } from '@/lib/ctx'

export type CreateSeriesInput = {
  name: string
  teamId: string
  templateKey: string
  agenda: { term: string; minutes: number }[]
  /** 'weekly' with days + time, or 'adhoc' with a date + time (both in the org timezone). */
  schedule: { kind: 'weekly'; days: string[]; time: string } | { kind: 'adhoc'; date: string; time: string }
  attendeeIds: string[]
  scribeAgentId: string | null
}

export async function createSeries(slug: string, input: CreateSeriesInput): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const ctx = await getCtx(slug)
  try {
    const org = await getOrg(ctx)
    const total = input.agenda.reduce((n, a) => n + a.minutes, 0)
    const weekly = input.schedule.kind === 'weekly'
    if (weekly && input.schedule.kind === 'weekly' && input.schedule.days.length === 0) return { ok: false, error: 'Pick at least one day' }
    const r = await execute(ctx, meetingSeriesCreate, {
      name: input.name,
      teamId: input.teamId,
      templateKey: input.templateKey,
      agenda: input.agenda,
      rrule: input.schedule.kind === 'weekly' ? `FREQ=WEEKLY;BYDAY=${input.schedule.days.join(',')}` : null,
      startTime: input.schedule.time || null,
      durationMinutes: Math.min(600, Math.max(5, total)),
      attendeeIds: input.attendeeIds,
      scribeActor: input.scribeAgentId ? { type: 'agent' as const, id: input.scribeAgentId } : null,
      firstScheduledAt: input.schedule.kind === 'adhoc' && input.schedule.date ? zonedToUtc(input.schedule.date, input.schedule.time || '09:00', org.timezone) : undefined,
    })
    if (!r.ok) return { ok: false, error: 'Sent for approval' }
    revalidatePath(`/${slug}/meetings`)
    return { ok: true, id: r.data.series.id }
  } catch (e) {
    if (isMotionError(e)) return { ok: false, error: e.message }
    throw e
  }
}

/** Start (or join the start of) a series' meeting, then open it. */
export async function startSeries(slug: string, seriesId: string): Promise<{ ok: false; error: string } | never> {
  const ctx = await getCtx(slug)
  let id: string
  try {
    const r = await execute(ctx, meetingStart, { seriesId })
    if (!r.ok) return { ok: false, error: 'Sent for approval' }
    id = r.data.id
  } catch (e) {
    if (isMotionError(e)) return { ok: false, error: e.message }
    throw e
  }
  revalidatePath(`/${slug}/meetings`)
  redirect(`/${slug}/meetings/${id}`)
}
