import { and, eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import { approvals, auditEvents, requestLog, type ActorJson, type Db } from '@movara/db'
import { hasRole, hasScope, requireScope, type Ctx, type Role, type Scope } from './ctx'
import { MovaraError } from './errors'
import { changedFields, newId } from './helpers'

/** What a command's `run` returns. `data` goes to the caller; the rest feeds the audit log. */
export type Outcome<T> = {
  data: T
  /** The primary entity touched (audit_events.entity_type/entity_id). */
  entity?: { type: string; id: string }
  /** Full before/after objects; the runner stores only the changed keys. */
  before?: Record<string, unknown> | null
  after?: Record<string, unknown> | null
  /** Pre-computed diff, used instead of before/after when given. */
  diff?: Record<string, unknown>
}

export type RunHelpers = {
  requestId?: string
  expectedVersion?: number
  /** Set when this execution was triggered by approving an approval. */
  approvalId?: string
  /** Set together with `approvalId`: the person who approved it. */
  approvedBy?: ActorJson
}

export type Command<I extends z.ZodType = z.ZodType, O = unknown> = {
  /** Canonical dotted name, e.g. "priority.set_status". Stable: it is stored in approvals and audit. */
  name: string
  /** Scope(s) the actor needs (any one of them). Persons always pass. */
  scope: Scope | Scope[]
  /** Minimum role (of the person, or of the agent's owner). Default 'member'. */
  minRole?: Role
  input: I
  /** Agents get an approval instead of an execution. Scope 'admin' commands always need approval for agents. */
  requiresApprovalForAgents?: boolean | ((input: z.output<I>) => boolean)
  /** One-liner shown on the approval card. */
  summary?: (input: z.output<I>) => string
  /** Do not store the result in request_log / replay it (e.g. API key plaintext). */
  redactResult?: boolean
  run: (ctx: Ctx, input: z.output<I>, h: RunHelpers) => Promise<Outcome<O>>
}

const registry = new Map<string, Command<any, any>>()

/** Define (and register) a command. Registration is what lets approvals re-execute by name. */
export function defineCommand<I extends z.ZodType, O>(cmd: Command<I, O>): Command<I, O> {
  registry.set(cmd.name, cmd)
  return cmd
}
export const getCommand = (name: string): Command<any, any> | undefined => registry.get(name)
export const listCommands = (): string[] => [...registry.keys()].sort()

export type ExecuteOptions = {
  /** Idempotency key. Repeating the same (org, requestId) replays the first response. */
  requestId?: string
  /** Optimistic concurrency: the version the caller last saw. */
  expectedVersion?: number
  /** INTERNAL (used by approvals.decide): skip the agent approval gate. */
  skipApproval?: boolean
  /** INTERNAL: id of the approval being executed. */
  approvalId?: string
  /** INTERNAL: the person who approved it (passed to `run` as `h.approvedBy`). */
  approvedBy?: ActorJson
}

export type ExecuteResult<O> =
  | { ok: true; data: O; entity?: { type: string; id: string }; auditId: string; replayed?: boolean }
  | { ok: false; needsApproval: true; approvalId: string; replayed?: boolean }

const scopesOf = (c: Command<any, any>): Scope[] => (Array.isArray(c.scope) ? c.scope : [c.scope])

function needsApproval(cmd: Command<any, any>, ctx: Ctx, input: unknown): boolean {
  if (ctx.actor.type !== 'agent') return false
  if (scopesOf(cmd).includes('admin')) return true
  const r = cmd.requiresApprovalForAgents
  return typeof r === 'function' ? r(input) : !!r
}

/**
 * Run a command: validate -> scope and role checks -> idempotency -> (agent approval gate) ->
 * transaction { run, audit_events row, request_log }. Throws MovaraError on failure.
 */
export async function execute<I extends z.ZodType, O>(
  ctx: Ctx,
  cmd: Command<I, O>,
  rawInput: z.input<I>,
  opts: ExecuteOptions = {},
): Promise<ExecuteResult<O>> {
  const parsed = cmd.input.safeParse(rawInput)
  if (!parsed.success) {
    throw new MovaraError('validation', parsed.error.issues.map((i) => `${i.path.join('.') || 'input'}: ${i.message}`).join('; '), { issues: parsed.error.issues })
  }
  const input = parsed.data as z.output<I>

  // Scope: persons pass; agents need one of the command's scopes.
  const scopes = scopesOf(cmd)
  if (!scopes.some((s) => hasScope(ctx, s))) {
    throw new MovaraError('forbidden_scope', `Missing scope: ${scopes.join(' or ')}`, { scope: scopes })
  }
  const minRole = cmd.minRole ?? 'member'
  if (!hasRole(ctx, minRole)) throw new MovaraError('forbidden', `Requires role ${minRole} or higher`, { role: ctx.role, required: minRole })

  // Idempotent replay (cheap pre-check outside the transaction).
  if (opts.requestId) {
    const replay = await readLog<O>(ctx.db, ctx, cmd, opts.requestId)
    if (replay) return replay
  }

  const gate = !opts.skipApproval && needsApproval(cmd, ctx, input)

  try {
    return await ctx.db.transaction(async (tx) => {
      const tctx: Ctx = { ...ctx, db: tx as unknown as Db }

      // Claim the idempotency key; a concurrent duplicate blocks here, then gets 0 rows.
      if (opts.requestId) {
        const claimed = await tx
          .insert(requestLog)
          .values({ id: newId(), orgId: ctx.orgId, requestId: opts.requestId, command: cmd.name, actorId: ctx.actor.id, status: 'pending' })
          .onConflictDoNothing()
          .returning({ id: requestLog.id })
        if (claimed.length === 0) throw new Replay()
      }

      let result: ExecuteResult<O>

      if (gate) {
        const approvalId = newId()
        await tx.insert(approvals).values({
          id: approvalId,
          orgId: ctx.orgId,
          requestedByActor: ctx.actor,
          createdByActor: ctx.actor,
          updatedByActor: ctx.actor,
          action: cmd.name,
          payload: input as unknown,
          summary: cmd.summary?.(input) ?? cmd.name,
          requestId: opts.requestId ?? null,
          status: 'pending',
        })
        await tx.insert(auditEvents).values({
          id: newId(),
          orgId: ctx.orgId,
          actor: ctx.actor,
          onBehalfOf: ctx.actor.onBehalfOf ?? null,
          command: 'approval.request',
          entityType: 'approval',
          entityId: approvalId,
          diff: { after: { action: cmd.name, payload: input } },
          requestId: opts.requestId ?? null,
        })
        result = { ok: false, needsApproval: true, approvalId }
      } else {
        const out = await cmd.run(tctx, input, { requestId: opts.requestId, expectedVersion: opts.expectedVersion, approvalId: opts.approvalId, approvedBy: opts.approvedBy })
        let diff: Record<string, unknown> | null = out.diff ?? null
        if (!diff && (out.before || out.after)) diff = changedFields(out.before ?? {}, out.after ?? {})
        if (opts.approvalId) diff = { ...(diff ?? {}), approvalId: opts.approvalId, ...(opts.approvedBy ? { approvedBy: opts.approvedBy } : {}) }
        const auditId = newId()
        await tx.insert(auditEvents).values({
          id: auditId,
          orgId: ctx.orgId,
          actor: ctx.actor,
          onBehalfOf: ctx.actor.onBehalfOf ?? null,
          command: cmd.name,
          entityType: out.entity?.type ?? null,
          entityId: out.entity?.id ?? null,
          diff,
          requestId: opts.requestId ?? null,
        })
        result = { ok: true, data: out.data, entity: out.entity, auditId }
      }

      if (opts.requestId) {
        const stored = cmd.redactResult && result.ok ? { ok: true, redacted: true, entity: result.entity, auditId: result.auditId } : result
        await tx
          .update(requestLog)
          .set({ status: 'done', response: JSON.parse(JSON.stringify(stored)) })
          .where(and(eq(requestLog.orgId, ctx.orgId), eq(requestLog.requestId, opts.requestId)))
      }
      return result
    })
  } catch (e) {
    if (e instanceof Replay && opts.requestId) {
      const replay = await readLog<O>(ctx.db, ctx, cmd, opts.requestId)
      if (replay) return replay
      throw new MovaraError('conflict', 'Request is still being processed; retry shortly')
    }
    throw e
  }
}

class Replay extends Error {}

async function readLog<O>(db: Db, ctx: Ctx, cmd: Command<any, any>, requestId: string): Promise<ExecuteResult<O> | null> {
  const [row] = await db
    .select()
    .from(requestLog)
    .where(and(eq(requestLog.orgId, ctx.orgId), eq(requestLog.requestId, requestId)))
    .limit(1)
  if (!row || row.status !== 'done') return null
  if (row.command !== cmd.name || row.actorId !== ctx.actor.id) {
    throw new MovaraError('conflict', 'requestId was already used for a different request')
  }
  const res = row.response as (ExecuteResult<O> & { redacted?: boolean }) | null
  if (!res) return null
  if ((res as { redacted?: boolean }).redacted) {
    throw new MovaraError('conflict', 'This request already succeeded; its result was redacted and cannot be replayed', { auditId: (res as { auditId?: string }).auditId })
  }
  return { ...res, replayed: true }
}


