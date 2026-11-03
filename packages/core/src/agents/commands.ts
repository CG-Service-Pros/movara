import { and, eq, isNull } from 'drizzle-orm'
import { z } from 'zod'
import { agents, apiKeys, API_KEY_PREFIX, generateApiKey, hashApiKey, people, type Db } from '@movara/db'
import { actingPersonId, ctxForAgent, hasRole, presetScopes, SCOPES, SCOPE_PRESET_KEYS, type Ctx, type Scope, type ScopePreset } from '../ctx'
import { MovaraError } from '../errors'
import { assertVersion, base, found, scoped, softDelete, touch } from '../helpers'
import { revokeAgentOAuthTokens } from './oauth'
import { defineCommand, execute, type ExecuteOptions } from '../runner'

const scopesSchema = z.array(z.enum(SCOPES)).max(SCOPES.length)
const presetSchema = z.enum(SCOPE_PRESET_KEYS as [ScopePreset, ...ScopePreset[]])

/** The preset name to store: only when the final scopes equal that preset exactly. */
function presetFor(preset: ScopePreset | null | undefined, scopes: Scope[]): ScopePreset | null {
  if (!preset) return null
  const want = presetScopes(preset)
  return want.length === scopes.length && want.every((s) => scopes.includes(s)) ? preset : null
}

async function ownedAgent(ctx: Ctx, agentId: string) {
  const [a] = await ctx.db.select().from(agents).where(scoped(agents, ctx, eq(agents.id, agentId))).limit(1)
  const agent = found(a, 'Agent')
  if (agent.kind === 'builtin_coach') throw new MovaraError('forbidden', 'The built-in Coach is managed by Movara and cannot be changed or revoked here')
  if (!hasRole(ctx, 'admin') && agent.ownerPersonId !== actingPersonId(ctx)) throw new MovaraError('forbidden', 'Only an admin or the agent\'s owner can do this')
  return agent
}

/** Create an agent. Members can create agents they own; admins can assign any owner. */
export const agentsCreate = defineCommand({
  name: 'agents.create',
  scope: 'admin',
  minRole: 'member',
  input: z.object({
    name: z.string().trim().min(1).max(60),
    client: z.string().trim().max(80).optional(),
    ownerPersonId: z.uuid().optional(),
    /** Explicit scopes, or give a `preset` (see SCOPE_PRESETS). Default: read-only. */
    scopes: scopesSchema.optional(),
    preset: presetSchema.optional(),
  }),
  summary: (i) => `Create agent "${i.name}"`,
  run: async (ctx, input) => {
    const ownerId = input.ownerPersonId ?? actingPersonId(ctx)
    if (ownerId !== actingPersonId(ctx) && !hasRole(ctx, 'admin')) throw new MovaraError('forbidden', 'Only an admin can create an agent for someone else')
    const [owner] = await ctx.db.select({ id: people.id }).from(people).where(scoped(people, ctx, eq(people.id, ownerId))).limit(1)
    found(owner, 'Owner')
    const scopes = [...new Set(input.scopes ?? (input.preset ? presetScopes(input.preset) : (['read'] as Scope[])))]
    const preset = presetFor(input.preset, scopes)
    const [row] = await ctx.db.insert(agents).values({ ...base(ctx), name: input.name, client: input.client ?? null, ownerPersonId: ownerId, scopes, preset }).returning()
    return { data: row!, entity: { type: 'agent', id: row!.id }, before: null, after: { name: row!.name, ownerPersonId: ownerId, scopes: row!.scopes, preset } }
  },
})

export const agentsUpdate = defineCommand({
  name: 'agents.update',
  scope: 'admin',
  minRole: 'member',
  input: z.object({ agentId: z.uuid(), name: z.string().trim().min(1).max(60).optional(), client: z.string().trim().max(80).nullable().optional(), status: z.enum(['active', 'paused']).optional() }),
  run: async (ctx, input, h) => {
    const before = await ownedAgent(ctx, input.agentId)
    assertVersion(before, h.expectedVersion)
    if (before.status === 'revoked') throw new MovaraError('conflict', 'Agent is revoked')
    const { agentId, ...patch } = input
    const [after] = await ctx.db.update(agents).set({ ...patch, ...touch(agents, ctx) }).where(scoped(agents, ctx, eq(agents.id, agentId))).returning()
    return { data: after!, entity: { type: 'agent', id: agentId }, before: before as unknown as Record<string, unknown>, after: after as unknown as Record<string, unknown> }
  },
})

export const agentsUpdateScopes = defineCommand({
  name: 'agents.update_scopes',
  scope: 'admin',
  minRole: 'member',
  input: z.object({ agentId: z.uuid(), scopes: scopesSchema.optional(), preset: presetSchema.optional() }).refine((i) => i.scopes || i.preset, 'Give scopes or a preset'),
  summary: (i) => `Set scopes of agent ${i.agentId} to ${i.scopes ? i.scopes.join(', ') : `preset ${i.preset}`}`,
  run: async (ctx, input, h) => {
    const before = await ownedAgent(ctx, input.agentId)
    assertVersion(before, h.expectedVersion)
    if (before.status === 'revoked') throw new MovaraError('conflict', 'Agent is revoked')
    const scopes = [...new Set(input.scopes ?? presetScopes(input.preset!))]
    const preset = presetFor(input.preset, scopes)
    // Members can only grant scopes that are not 'admin'.
    if (scopes.includes('admin') && !hasRole(ctx, 'admin')) throw new MovaraError('forbidden', "Only an admin can grant the 'admin' scope")
    const [after] = await ctx.db.update(agents).set({ scopes, preset, ...touch(agents, ctx) }).where(scoped(agents, ctx, eq(agents.id, input.agentId))).returning()
    return { data: after!, entity: { type: 'agent', id: input.agentId }, before: { scopes: before.scopes }, after: { scopes, preset } }
  },
})

/** Revoke an agent and all its API keys. Irreversible (create a new agent instead). */
export const agentsRevoke = defineCommand({
  name: 'agents.revoke',
  scope: 'admin',
  minRole: 'member',
  input: z.object({ agentId: z.uuid() }),
  summary: (i) => `Revoke agent ${i.agentId}`,
  run: async (ctx, input, h) => {
    const before = await ownedAgent(ctx, input.agentId)
    assertVersion(before, h.expectedVersion)
    const now = new Date()
    const [after] = await ctx.db.update(agents).set({ status: 'revoked', ...touch(agents, ctx) }).where(scoped(agents, ctx, eq(agents.id, input.agentId))).returning()
    await ctx.db.update(apiKeys).set({ revokedAt: now, ...touch(apiKeys, ctx) }).where(and(eq(apiKeys.orgId, ctx.orgId), eq(apiKeys.agentId, input.agentId), isNull(apiKeys.revokedAt)))
    await revokeAgentOAuthTokens(ctx.db, ctx.orgId, input.agentId)
    return { data: after!, entity: { type: 'agent', id: input.agentId }, before: { status: before.status }, after: { status: 'revoked' } }
  },
})

export const agentsIssueApiKey = defineCommand({
  name: 'agents.issue_api_key',
  scope: 'admin',
  minRole: 'member',
  input: z.object({
    agentId: z.uuid(),
    name: z.string().trim().max(60).optional(),
    /** Optionally narrow the key below the agent's own scopes. */
    scopes: scopesSchema.optional(),
    expiresAt: z.coerce.date().optional(),
  }),
  redactResult: true,
  summary: (i) => `Issue an API key for agent ${i.agentId}`,
  run: async (ctx, input) => {
    const agent = await ownedAgent(ctx, input.agentId)
    if (agent.status !== 'active') throw new MovaraError('conflict', `Agent is ${agent.status}`)
    const key = generateApiKey()
    const [row] = await ctx.db
      .insert(apiKeys)
      .values({ ...base(ctx), agentId: agent.id, name: input.name ?? null, prefix: key.slice(0, API_KEY_PREFIX.length + 4), keyHash: hashApiKey(key), scopes: input.scopes ?? null, expiresAt: input.expiresAt ?? null })
      .returning()
    // The plaintext is returned once and never stored; the audit diff holds only the prefix.
    return { data: { key, keyId: row!.id, prefix: row!.prefix, agentId: agent.id }, entity: { type: 'api_key', id: row!.id }, before: null, after: { agentId: agent.id, prefix: row!.prefix, scopes: input.scopes ?? null } }
  },
})

export const agentsRevokeApiKey = defineCommand({
  name: 'agents.revoke_api_key',
  scope: 'admin',
  minRole: 'member',
  input: z.object({ keyId: z.uuid() }),
  run: async (ctx, input) => {
    const [k] = await ctx.db.select().from(apiKeys).where(scoped(apiKeys, ctx, eq(apiKeys.id, input.keyId))).limit(1)
    const key = found(k, 'API key')
    await ownedAgent(ctx, key.agentId)
    await ctx.db.update(apiKeys).set({ revokedAt: new Date(), ...touch(apiKeys, ctx) }).where(eq(apiKeys.id, key.id))
    return { data: { id: key.id }, entity: { type: 'api_key', id: key.id }, before: { revoked: false }, after: { revoked: true } }
  },
})

/**
 * Authenticate a static API key (`mk_live_…`) and return the agent's Ctx. Updates last-used
 * timestamps. Throws `forbidden` for unknown, revoked or expired keys.
 */
export async function authenticateApiKey(db: Db, key: string): Promise<Ctx> {
  if (!key.startsWith(API_KEY_PREFIX)) throw new MovaraError('forbidden', 'Invalid API key')
  const [row] = await db.select().from(apiKeys).where(and(eq(apiKeys.keyHash, hashApiKey(key)), isNull(apiKeys.deletedAt))).limit(1)
  if (!row || row.revokedAt) throw new MovaraError('forbidden', 'Invalid or revoked API key')
  if (row.expiresAt && row.expiresAt.getTime() < Date.now()) throw new MovaraError('forbidden', 'API key expired')
  const ctx = await ctxForAgent(db, row.orgId, row.agentId, row.scopes)
  const now = new Date()
  await db.update(apiKeys).set({ lastUsedAt: now }).where(eq(apiKeys.id, row.id))
  await db.update(agents).set({ lastSeenAt: now }).where(eq(agents.id, row.agentId))
  return ctx
}

/** Issue a key via the runner (permission checked, audited, plaintext returned once in `data.key`). */
export async function issueApiKey(ctx: Ctx, input: z.input<typeof agentsIssueApiKey.input>, opts: ExecuteOptions = {}) {
  return execute(ctx, agentsIssueApiKey, input, opts)
}
