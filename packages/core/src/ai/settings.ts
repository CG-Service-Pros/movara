import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { agents, orgAiSettings } from '@movara/db'
import { requireRead, requireRole, type Ctx } from '../ctx'
import { MovaraError } from '../errors'
import { base, touch } from '../helpers'
import { defineCommand, execute, type ExecuteOptions } from '../runner'
import { decryptSecret, encryptSecret } from './crypto'
import { assertWithinTokenLimit } from './usage'

export const AI_PROVIDERS = ['openai', 'openai_compatible'] as const
export const REASONING_EFFORTS = ['minimal', 'low', 'medium', 'high'] as const
export type AiProvider = (typeof AI_PROVIDERS)[number]
export type ReasoningEffort = (typeof REASONING_EFFORTS)[number]

export const DEFAULT_AI_MODEL = 'gpt-5.6-luna'
export const DEFAULT_COACH_NAME = 'Coach'
export const DEFAULT_COACH_PERSONALITY = 'Warm, direct and practical. Coaches on accountability and clarity.'

/** What the admin UI sees. The API key itself is never returned. */
export type AiSettingsView = {
  enabled: boolean
  provider: AiProvider
  baseUrl: string | null
  model: string
  reasoningEffort: ReasoningEffort
  monthlyTokenLimit: number | null
  coachName: string
  coachPersonality: string
  hasKey: boolean
  /** Last 4 characters of the stored key, for display. */
  keyLast4: string | null
  updatedAt: Date | null
  updatedBy: { type: 'person' | 'agent'; id: string; onBehalfOf?: string } | null
}

type Row = typeof orgAiSettings.$inferSelect

const view = (r: Row | undefined): AiSettingsView => ({
  enabled: r?.enabled ?? false,
  provider: (r?.provider as AiProvider) ?? 'openai',
  baseUrl: r?.baseUrl ?? null,
  model: r?.model ?? DEFAULT_AI_MODEL,
  reasoningEffort: (r?.reasoningEffort as ReasoningEffort) ?? 'low',
  monthlyTokenLimit: r?.monthlyTokenLimit ?? null,
  coachName: r?.coachName ?? DEFAULT_COACH_NAME,
  coachPersonality: r?.coachPersonality ?? DEFAULT_COACH_PERSONALITY,
  hasKey: !!r?.apiKeyCiphertext,
  keyLast4: r?.apiKeyLast4 ?? null,
  updatedAt: r?.updatedAt ?? null,
  updatedBy: r?.updatedBy ?? null,
})

const loadRow = async (ctx: Ctx): Promise<Row | undefined> =>
  (await ctx.db.select().from(orgAiSettings).where(eq(orgAiSettings.orgId, ctx.orgId)).limit(1))[0]

/** Full AI settings (admin or owner only). */
export async function getAiSettings(ctx: Ctx): Promise<AiSettingsView> {
  requireRead(ctx)
  requireRole(ctx, 'admin')
  return view(await loadRow(ctx))
}

/** What any member may know: is Coach available, and how it is called. No provider details. */
export type CoachProfile = { enabled: boolean; ready: boolean; coachName: string; coachPersonality: string }
export async function getCoachProfile(ctx: Ctx): Promise<CoachProfile> {
  requireRead(ctx)
  const r = view(await loadRow(ctx))
  return { enabled: r.enabled, ready: r.enabled && r.hasKey && (r.provider !== 'openai_compatible' || !!r.baseUrl), coachName: r.coachName, coachPersonality: r.coachPersonality }
}

const httpUrl = z.string().trim().max(500).refine((v) => {
  try {
    return ['http:', 'https:'].includes(new URL(v).protocol)
  } catch {
    return false
  }
}, 'Use an http(s) URL, e.g. https://api.openai.com/v1')

/**
 * Update AI settings. People only (the key must not land in an approval payload); admins and owners.
 * `apiKey`: a string sets/replaces the key, null removes it, omitted keeps it. The audit diff never contains the key.
 */
export const aiSettingsUpdate = defineCommand({
  name: 'ai.update_settings',
  scope: 'admin',
  minRole: 'admin',
  redactResult: true,
  input: z.object({
    enabled: z.boolean().optional(),
    provider: z.enum(AI_PROVIDERS).optional(),
    baseUrl: httpUrl.nullable().optional(),
    apiKey: z.string().trim().min(8).max(500).nullable().optional(),
    model: z.string().trim().min(1).max(100).optional(),
    reasoningEffort: z.enum(REASONING_EFFORTS).optional(),
    monthlyTokenLimit: z.number().int().min(0).max(2_000_000_000).nullable().optional(),
    coachName: z.string().trim().min(1).max(40).optional(),
    coachPersonality: z.string().trim().min(1).max(2000).optional(),
  }),
  summary: () => 'Update AI settings',
  run: async (ctx, input, h) => {
    if (ctx.actor.type !== 'person') throw new MovaraError('forbidden', 'AI settings can only be changed by a person')
    const before = await loadRow(ctx)
    const { apiKey, ...rest } = input
    const patch: Partial<typeof orgAiSettings.$inferInsert> = { ...rest, updatedBy: ctx.actor }
    if (apiKey === null) Object.assign(patch, { apiKeyCiphertext: null, apiKeyIv: null, apiKeyTag: null, apiKeyLast4: null })
    else if (apiKey !== undefined) {
      const e = encryptSecret(apiKey)
      Object.assign(patch, { apiKeyCiphertext: e.ciphertext, apiKeyIv: e.iv, apiKeyTag: e.tag, apiKeyLast4: apiKey.slice(-4) })
    }
    let after: Row
    if (before) {
      if (h.expectedVersion !== undefined && before.version !== h.expectedVersion) throw new MovaraError('conflict', 'Stale write', { current: view(before) })
      ;[after] = await ctx.db.update(orgAiSettings).set({ ...patch, ...touch(orgAiSettings, ctx) }).where(eq(orgAiSettings.orgId, ctx.orgId)).returning() as [Row]
    } else {
      ;[after] = await ctx.db.insert(orgAiSettings).values({ ...base(ctx), ...patch }).returning() as [Row]
    }
    const b = view(before)
    const a = view(after)
    const { updatedAt: _u, updatedBy: _b, ...bb } = b
    const { updatedAt: _u2, updatedBy: _b2, ...aa } = a
    return { data: a, entity: { type: 'ai_settings', id: after.id }, before: bb, after: aa }
  },
})

/** Wrapper returning the settings view (never the key). */
export async function updateAiSettings(ctx: Ctx, input: z.input<typeof aiSettingsUpdate.input>, opts: ExecuteOptions = {}) {
  if (ctx.actor.type !== 'person') throw new MovaraError('forbidden', 'AI settings can only be changed by a person')
  const r = await execute(ctx, aiSettingsUpdate, input, opts)
  if (!r.ok) throw new MovaraError('needs_approval', 'Unexpected approval')
  return r.data as AiSettingsView
}

export type AiClientConfig = {
  provider: AiProvider
  /** Null = the provider default (api.openai.com). */
  baseUrl: string | null
  /** DECRYPTED. Server-only: never send to the browser or log it. */
  apiKey: string
  model: string
  reasoningEffort: ReasoningEffort
  monthlyTokenLimit: number | null
  coachName: string
  coachPersonality: string
}

/**
 * SERVER-ONLY. Decrypted provider config for the AI engine. Callable by any member (the engine acts for them) or by the
 * org's built-in Coach agent; other agents are refused. Throws `validation` when AI is off or not configured and
 * `forbidden` when the monthly token limit is reached (unless `checkLimit: false`).
 */
export async function getAiClientConfig(ctx: Ctx, opts: { checkLimit?: boolean } = {}): Promise<AiClientConfig> {
  requireRead(ctx)
  if (ctx.actor.type === 'agent') {
    const [a] = await ctx.db.select({ kind: agents.kind }).from(agents).where(eq(agents.id, ctx.actor.id)).limit(1)
    if (a?.kind !== 'builtin_coach') throw new MovaraError('forbidden', 'Only people and the built-in Coach can use the AI configuration')
  }
  const r = await loadRow(ctx)
  if (!r?.enabled) throw new MovaraError('validation', 'AI features are turned off for this organization. An admin can enable them in Settings.')
  if (!r.apiKeyCiphertext || !r.apiKeyIv || !r.apiKeyTag) throw new MovaraError('validation', 'No AI API key is configured. An admin can add one in Settings.')
  if (r.provider === 'openai_compatible' && !r.baseUrl) throw new MovaraError('validation', 'The OpenAI-compatible provider needs a base URL.')
  if (opts.checkLimit !== false) await assertWithinTokenLimit(ctx)
  return {
    provider: r.provider as AiProvider,
    baseUrl: r.baseUrl,
    apiKey: decryptSecret({ ciphertext: r.apiKeyCiphertext, iv: r.apiKeyIv, tag: r.apiKeyTag }),
    model: r.model,
    reasoningEffort: r.reasoningEffort as ReasoningEffort,
    monthlyTokenLimit: r.monthlyTokenLimit,
    coachName: r.coachName,
    coachPersonality: r.coachPersonality,
  }
}
