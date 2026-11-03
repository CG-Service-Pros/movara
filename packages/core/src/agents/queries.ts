import { asc, desc, eq } from 'drizzle-orm'
import { agents, apiKeys } from '@movara/db'
import { requireRead, type Ctx } from '../ctx'
import { found, scoped } from '../helpers'

export type AgentRow = typeof agents.$inferSelect
/** API key metadata. The hash and plaintext are never returned. */
export type ApiKeyInfo = Omit<typeof apiKeys.$inferSelect, 'keyHash'>

export async function listAgents(ctx: Ctx, opts: { includeRevoked?: boolean } = {}): Promise<AgentRow[]> {
  requireRead(ctx)
  const rows = await ctx.db.select().from(agents).where(scoped(agents, ctx)).orderBy(asc(agents.name))
  return opts.includeRevoked ? rows : rows.filter((a) => a.status !== 'revoked')
}

export async function getAgent(ctx: Ctx, id: string): Promise<AgentRow> {
  requireRead(ctx)
  const [a] = await ctx.db.select().from(agents).where(scoped(agents, ctx, eq(agents.id, id))).limit(1)
  return found(a, 'Agent')
}

export async function listApiKeys(ctx: Ctx, agentId?: string): Promise<ApiKeyInfo[]> {
  requireRead(ctx)
  const rows = await ctx.db
    .select()
    .from(apiKeys)
    .where(scoped(apiKeys, ctx, agentId ? eq(apiKeys.agentId, agentId) : undefined))
    .orderBy(desc(apiKeys.createdAt))
  return rows.map(({ keyHash: _h, ...k }) => k)
}

