import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { agents, approvals } from '@motion/db'
import { actingPersonId, ctxForAgent, hasRole } from '../ctx'
import { MotionError } from '../errors'
import { found, scoped, touch } from '../helpers'
import { defineCommand, execute, getCommand } from '../runner'

/**
 * Approve or decline a pending approval. Approving re-executes the stored command as the
 * requesting agent (with the approval gate skipped but scope/role checks intact) inside the same
 * transaction; if that fails, nothing changes and the error is thrown. Only people can decide:
 * admins/owners, or the owner of the requesting agent.
 */
export const approvalsDecide = defineCommand({
  name: 'approvals.decide',
  scope: 'admin',
  minRole: 'member',
  input: z.object({ approvalId: z.uuid(), decision: z.enum(['approve', 'decline']), note: z.string().max(500).optional() }),
  run: async (ctx, input) => {
    if (ctx.actor.type !== 'person') throw new MotionError('forbidden', 'Only people can decide approvals')
    const [a] = await ctx.db.select().from(approvals).where(scoped(approvals, ctx, eq(approvals.id, input.approvalId))).limit(1)
    const approval = found(a, 'Approval')
    if (approval.status !== 'pending') throw new MotionError('conflict', `Approval is already ${approval.status}`)

    const requester = approval.requestedByActor
    let isAgentOwner = false
    if (requester.type === 'agent') {
      const [ag] = await ctx.db.select({ owner: agents.ownerPersonId }).from(agents).where(eq(agents.id, requester.id)).limit(1)
      isAgentOwner = ag?.owner === actingPersonId(ctx)
    }
    if (!hasRole(ctx, 'admin') && !isAgentOwner) throw new MotionError('forbidden', 'Only an admin or the requesting agent\'s owner can decide')

    let result: unknown = null
    if (input.decision === 'approve') {
      const cmd = getCommand(approval.action)
      if (!cmd) throw new MotionError('validation', `Unknown command "${approval.action}"`)
      if (requester.type !== 'agent') throw new MotionError('validation', 'Only agent requests can be approved')
      const agentCtx = await ctxForAgent(ctx.db, ctx.orgId, requester.id)
      const r = await execute(agentCtx, cmd, approval.payload, { skipApproval: true, approvalId: approval.id, approvedBy: ctx.actor })
      result = r.ok ? (cmd.redactResult ? { redacted: true, entity: r.entity } : { data: r.data, entity: r.entity, auditId: r.auditId }) : null
    }

    const [after] = await ctx.db
      .update(approvals)
      .set({
        status: input.decision === 'approve' ? 'approved' : 'declined',
        decidedBy: ctx.actor,
        decidedAt: new Date(),
        decisionNote: input.note ?? null,
        result: result === null ? null : JSON.parse(JSON.stringify(result)),
        ...touch(approvals, ctx),
      })
      .where(eq(approvals.id, approval.id))
      .returning()
    return {
      data: after!,
      entity: { type: 'approval', id: approval.id },
      before: { status: 'pending' },
      after: { status: after!.status, action: approval.action },
    }
  },
})

/** Convenience wrappers. */
export const approveApproval = (ctx: Parameters<typeof execute>[0], approvalId: string, note?: string) =>
  execute(ctx, approvalsDecide, { approvalId, decision: 'approve', note })
export const declineApproval = (ctx: Parameters<typeof execute>[0], approvalId: string, note?: string) =>
  execute(ctx, approvalsDecide, { approvalId, decision: 'decline', note })
