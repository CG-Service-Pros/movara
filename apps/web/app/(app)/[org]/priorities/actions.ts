'use server'

import { revalidatePath } from 'next/cache'
import {
  execute,
  isMovaraError,
  milestoneAdd,
  milestoneDelete,
  milestoneReorder,
  milestoneToggle,
  milestoneUpdate,
  priorityCreate,
  priorityDelete,
  prioritySetStatus,
  priorityUpdate,
} from '@movara/core'
import { getCtx } from '@/lib/ctx'
import type { ActionResult, PLevel, PStatus } from '@/components/priorities/types'

type Cmd = Parameters<typeof execute>[1]

/** Run a command as the signed-in person; map errors and approvals to a plain result for the client. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- each command returns its own data shape; `pick` narrows it per call site
async function run<T = undefined>(slug: string, cmd: Cmd, input: unknown, requestId: string | undefined, pick?: (data: any) => T): Promise<ActionResult<T>> {
  try {
    const ctx = await getCtx(slug)
    const r = await execute(ctx, cmd, input as never, { requestId })
    revalidatePath(`/${slug}/priorities`)
    revalidatePath(`/${slug}`)
    if (!r.ok) return { ok: true, message: 'Sent for approval' }
    return { ok: true, data: pick ? pick(r.data) : undefined }
  } catch (e) {
    if (isMovaraError(e)) return { ok: false, error: e.message }
    throw e
  }
}

export async function setStatusAction(slug: string, priorityId: string, status: PStatus, requestId?: string) {
  return run(slug, prioritySetStatus as Cmd, { priorityId, status }, requestId)
}

export async function updatePriorityAction(
  slug: string,
  priorityId: string,
  patch: { title?: string; description?: string | null; ownerId?: string | null; teamId?: string | null; dueDate?: string | null; level?: PLevel },
  requestId?: string,
) {
  return run(slug, priorityUpdate as Cmd, { priorityId, ...patch }, requestId)
}

export async function createPriorityAction(
  slug: string,
  input: { title: string; ownerId: string | null; teamId: string | null; level: PLevel; dueDate: string | null; quarter: string; milestones: string[] },
  requestId?: string,
) {
  return run<string>(
    slug,
    priorityCreate as Cmd,
    {
      title: input.title,
      ownerId: input.ownerId,
      teamId: input.teamId,
      level: input.level,
      dueDate: input.dueDate,
      quarter: input.quarter,
      milestones: input.milestones.map((t) => ({ title: t })),
    },
    requestId,
    (d) => d.id as string,
  )
}

export async function deletePriorityAction(slug: string, priorityId: string, requestId?: string) {
  return run(slug, priorityDelete as Cmd, { priorityId }, requestId)
}

export async function addMilestoneAction(slug: string, priorityId: string, title: string, requestId?: string) {
  return run(slug, milestoneAdd as Cmd, { priorityId, title }, requestId)
}

export async function toggleMilestoneAction(slug: string, milestoneId: string, done: boolean, requestId?: string) {
  return run(slug, milestoneToggle as Cmd, { milestoneId, done }, requestId)
}

export async function renameMilestoneAction(slug: string, milestoneId: string, title: string, requestId?: string) {
  return run(slug, milestoneUpdate as Cmd, { milestoneId, title }, requestId)
}

export async function deleteMilestoneAction(slug: string, milestoneId: string, requestId?: string) {
  return run(slug, milestoneDelete as Cmd, { milestoneId }, requestId)
}

export async function reorderMilestonesAction(slug: string, priorityId: string, milestoneIds: string[], requestId?: string) {
  return run(slug, milestoneReorder as Cmd, { priorityId, milestoneIds }, requestId)
}
