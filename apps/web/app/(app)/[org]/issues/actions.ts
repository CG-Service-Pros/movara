'use server'

import { execute, issueCreate, issueDrop, issueMove, issueReopen, issueSetRank, issueSolve, issueUpdate } from '@motion/core'
import { runAction, type ActionResult } from '@/components/issues/action'

const paths = ['issues', 'scorecard', 'todos']

export async function createIssuesAction(
  slug: string,
  input: { title: string; description?: string; ownerIds: string[]; teamId: string | null; horizon: 'short' | 'long'; source?: { type: string; id: string } | null },
): Promise<ActionResult> {
  return runAction(slug, paths, (ctx) =>
    execute(ctx, issueCreate, {
      title: input.title,
      description: input.description || undefined,
      ownerIds: input.ownerIds.length ? input.ownerIds : undefined,
      teamId: input.teamId,
      horizon: input.horizon,
      source: input.source ?? undefined,
    }),
  )
}

export async function updateIssueAction(slug: string, input: { issueId: string; title?: string; description?: string | null; ownerId?: string | null }): Promise<ActionResult> {
  return runAction(slug, paths, (ctx) => execute(ctx, issueUpdate, input))
}

export async function setIssueRankAction(slug: string, issueId: string, rank: number): Promise<ActionResult> {
  return runAction(slug, paths, (ctx) => execute(ctx, issueSetRank, { issueId, rank }))
}

export async function issueStateAction(slug: string, issueId: string, op: 'solve' | 'reopen' | 'drop'): Promise<ActionResult> {
  const cmd = op === 'solve' ? issueSolve : op === 'reopen' ? issueReopen : issueDrop
  return runAction(slug, paths, (ctx) => execute(ctx, cmd, { issueId }))
}

export async function moveIssueAction(slug: string, issueId: string, to: { teamId?: string | null; horizon?: 'short' | 'long' }): Promise<ActionResult> {
  return runAction(slug, paths, (ctx) => execute(ctx, issueMove, { issueId, ...to }))
}
