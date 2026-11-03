import { and, asc, desc, eq } from 'drizzle-orm'
import { coachMessages, coachThreads } from '@movara/db'
import { actingPersonId, requireRead, type Ctx } from '../ctx'
import { base, found, newId, scoped } from '../helpers'

export type CoachThreadRow = typeof coachThreads.$inferSelect
export type CoachMessageRow = typeof coachMessages.$inferSelect

/** Threads are private to the person who started them. */
const mine = (ctx: Ctx, ...extra: Parameters<typeof scoped>[2][]) => scoped(coachThreads, ctx, eq(coachThreads.personId, actingPersonId(ctx)), ...extra)

export async function createCoachThread(ctx: Ctx, input: { title?: string; context?: Record<string, unknown> } = {}): Promise<CoachThreadRow> {
  requireRead(ctx)
  const [row] = await ctx.db.insert(coachThreads).values({ ...base(ctx), personId: actingPersonId(ctx), title: input.title?.slice(0, 120) || 'New conversation', context: input.context ?? {} }).returning()
  return row!
}

export async function listCoachThreads(ctx: Ctx, opts: { limit?: number } = {}): Promise<CoachThreadRow[]> {
  requireRead(ctx)
  return ctx.db.select().from(coachThreads).where(mine(ctx)).orderBy(desc(coachThreads.updatedAt)).limit(opts.limit ?? 50)
}

export async function getCoachThread(ctx: Ctx, threadId: string): Promise<CoachThreadRow & { messages: CoachMessageRow[] }> {
  requireRead(ctx)
  const [t] = await ctx.db.select().from(coachThreads).where(mine(ctx, eq(coachThreads.id, threadId))).limit(1)
  const thread = found(t, 'Conversation')
  const messages = await ctx.db.select().from(coachMessages).where(and(eq(coachMessages.orgId, ctx.orgId), eq(coachMessages.threadId, threadId))).orderBy(asc(coachMessages.createdAt), asc(coachMessages.id))
  return { ...thread, messages }
}

export async function appendCoachMessage(
  ctx: Ctx,
  threadId: string,
  m: { role: 'user' | 'assistant' | 'tool'; content?: unknown; toolCalls?: unknown; usage?: Record<string, unknown> | null },
): Promise<CoachMessageRow> {
  requireRead(ctx)
  const [t] = await ctx.db.select({ id: coachThreads.id }).from(coachThreads).where(mine(ctx, eq(coachThreads.id, threadId))).limit(1)
  found(t, 'Conversation')
  const [row] = await ctx.db.insert(coachMessages).values({ id: newId(), orgId: ctx.orgId, threadId, role: m.role, content: m.content ?? null, toolCalls: m.toolCalls ?? null, usage: m.usage ?? null }).returning()
  await ctx.db.update(coachThreads).set({ updatedAt: new Date() }).where(eq(coachThreads.id, threadId))
  return row!
}

export async function renameCoachThread(ctx: Ctx, threadId: string, title: string): Promise<void> {
  requireRead(ctx)
  const r = await ctx.db.update(coachThreads).set({ title: title.slice(0, 120), updatedAt: new Date() }).where(mine(ctx, eq(coachThreads.id, threadId))).returning({ id: coachThreads.id })
  found(r[0], 'Conversation')
}

export async function deleteCoachThread(ctx: Ctx, threadId: string): Promise<void> {
  requireRead(ctx)
  const r = await ctx.db.update(coachThreads).set({ deletedAt: new Date() }).where(mine(ctx, eq(coachThreads.id, threadId))).returning({ id: coachThreads.id })
  found(r[0], 'Conversation')
}
