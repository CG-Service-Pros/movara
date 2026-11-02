'use server'

import { execute, headlineCascade, headlineDelete, headlineMarkReviewed, headlinePost } from '@motion/core'
import { runAction, type ActionResult } from '@/components/issues/action'

const paths = ['headlines', 'meetings']

export async function postHeadlineAction(slug: string, input: { text: string; kind: 'customer' | 'employee' | 'general'; ownerIds: string[]; teamId: string }): Promise<ActionResult> {
  return runAction(slug, paths, (ctx) => execute(ctx, headlinePost, { text: input.text, kind: input.kind, teamId: input.teamId, ownerIds: input.ownerIds.length ? input.ownerIds : undefined }))
}
export async function reviewHeadlineAction(slug: string, headlineId: string, reviewed: boolean): Promise<ActionResult> {
  return runAction(slug, paths, (ctx) => execute(ctx, headlineMarkReviewed, { headlineId, reviewed }))
}
export async function cascadeHeadlineAction(slug: string, headlineId: string, teamIds: string[]): Promise<ActionResult> {
  return runAction(slug, paths, (ctx) => execute(ctx, headlineCascade, { headlineId, teamIds }))
}
export async function deleteHeadlineAction(slug: string, headlineId: string): Promise<ActionResult> {
  return runAction(slug, paths, (ctx) => execute(ctx, headlineDelete, { headlineId }))
}
