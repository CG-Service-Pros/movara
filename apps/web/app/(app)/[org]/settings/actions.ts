'use server'

import { revalidatePath } from 'next/cache'
import {
  agentsCreate, agentsRevoke, captureSettingsUpdate, getAiClientConfig, getAiSettings, recordUsage, updateAiSettings, type ScopePreset,
  agentsRevokeApiKey, agentsUpdate, agentsUpdateScopes, approveApproval, declineApproval, execute, getOrg, isMovaraError, issueApiKey,
  orgSetTerminologyOverrides, orgSetTerminologyPack, orgUpdateBranding, orgUpdateCalendar, orgUpdateGeneral, orgUpdateModules, peopleAdd, peopleCreateInvite, peopleRemove, peopleUpdateRole, requireRole,
  type Ctx,
} from '@movara/core'
import { previewImport, TermOverrides, type TerminologyPack } from '@movara/terminology'
import { getCtx } from '@/lib/ctx'
import { inviteUrl, sendInviteEmail } from '@/lib/invite'
import { fetchPack, PackFetchError, parseJson, parseNpmSpec, type PackSource } from '@/lib/terminology-import'

export type ActionResult<T = undefined> = { ok: true; data?: T; pending?: boolean } | { ok: false; error: string }

/** Run a core call as the signed-in person; map errors and approvals to a plain result for client components. */
async function run<T>(slug: string, paths: string[], fn: (ctx: Ctx) => Promise<{ ok: boolean; data?: T; needsApproval?: boolean }>, layout = false): Promise<ActionResult<T>> {
  try {
    const ctx = await getCtx(slug)
    const r = await fn(ctx)
    if (!r.ok) return { ok: true, pending: true }
    if (layout) revalidatePath(`/${slug}`, 'layout')
    for (const p of paths) revalidatePath(`/${slug}/settings/${p}`)
    return { ok: true, data: r.data as T }
  } catch (e) {
    if (isMovaraError(e)) return { ok: false, error: e.message }
    if (e instanceof PackFetchError) return { ok: false, error: e.message }
    throw e
  }
}

// ---- General / brand / modules / calendar -------------------------------------------------
export async function updateGeneral(slug: string, input: { name?: string; timezone?: string }) {
  return run(slug, ['general'], (ctx) => execute(ctx, orgUpdateGeneral, input), true)
}

export async function updateBranding(slug: string, input: Parameters<typeof orgUpdateBranding.run>[1]) {
  return run(slug, ['brand'], (ctx) => execute(ctx, orgUpdateBranding, input), true)
}

export async function updateModules(slug: string, modules: Record<string, boolean>) {
  return run(slug, ['modules'], (ctx) => execute(ctx, orgUpdateModules, { modules }), true)
}

export async function updateCalendar(slug: string, input: { fiscalYearStartMonth?: number; weekStartDay?: number; timezone?: string }) {
  return run(slug, ['calendar'], (ctx) => execute(ctx, orgUpdateCalendar, input), true)
}

// ---- Terminology ----------------------------------------------------------------------------
export type PackPreview = {
  pack: TerminologyPack
  changes: { key: string; from: string; to: string }[]
  termCount: number
  templates: { key: string; name: string; items: number }[]
}

async function currentPack(ctx: Ctx) {
  return (await getOrg(ctx)).terminologyPack ?? undefined
}

/** Fetch (npm / url) or parse (file text), validate, and report what would change. */
export async function previewPack(slug: string, input: { kind: 'npm' | 'url' | 'file' | 'json'; value: string }): Promise<ActionResult<PackPreview>> {
  try {
    const ctx = await getCtx(slug)
    // Fetching a remote file is an outbound request made by the server: admins only (the apply step is admin-only in core too).
    requireRole(ctx, 'admin')
    if (typeof input?.value !== 'string' || input.value.length > 300_000) return { ok: false, error: 'Input is missing or too large.' }
    let raw: unknown
    if (input.kind === 'npm') {
      const { name, version } = parseNpmSpec(input.value)
      const source: PackSource = { kind: 'npm', name, version }
      raw = await fetchPack(source)
    } else if (input.kind === 'url') raw = await fetchPack({ kind: 'url', url: input.value })
    else raw = typeof input.value === 'string' ? parseJson(input.value) : input.value
    const p = previewImport(raw, await currentPack(ctx))
    if (!p.ok) {
      const first = p.errors.slice(0, 3).map((i) => `${i.path.join('.') || 'pack'}: ${i.message}`).join('; ')
      return { ok: false, error: `Not a valid Movara pack. ${first}` }
    }
    return {
      ok: true,
      data: {
        pack: p.pack,
        changes: p.changes,
        termCount: Object.keys(p.pack.terms).length,
        templates: (p.pack.meetingTemplates ?? []).map((t) => ({ key: t.key, name: t.name, items: t.agenda.length })),
      },
    }
  } catch (e) {
    if (e instanceof PackFetchError) return { ok: false, error: e.message }
    if (isMovaraError(e)) return { ok: false, error: e.message }
    throw e
  }
}

export async function applyPack(slug: string, pack: unknown) {
  return run(slug, ['terminology'], (ctx) => execute(ctx, orgSetTerminologyPack, { pack }), true)
}
export async function revertPack(slug: string) {
  return run(slug, ['terminology'], (ctx) => execute(ctx, orgSetTerminologyPack, { pack: null, revert: true }), true)
}
export async function resetToStandard(slug: string) {
  return run(slug, ['terminology'], (ctx) => execute(ctx, orgSetTerminologyPack, { pack: null }), true)
}

export async function saveOverrides(slug: string, overrides: unknown) {
  const parsed = TermOverrides.safeParse(overrides)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid term' } satisfies ActionResult
  return run(slug, ['terminology'], (ctx) => execute(ctx, orgSetTerminologyOverrides, { overrides: parsed.data }), true)
}

// ---- Members -------------------------------------------------------------------------------
export type InviteResult = { link: string; email: string; name: string; emailed: boolean }

/** Invite someone: returns the single-use `/invite/<token>` link (shown once in Members settings; emailed when SMTP is configured). */
export async function inviteMember(slug: string, input: { name: string; email: string; role: 'admin' | 'member' | 'viewer' }): Promise<ActionResult<InviteResult>> {
  const r = await run<{ inviteToken: string; name: string; email: string }>(slug, ['members'], (ctx) => execute(ctx, peopleAdd, input))
  if (!r.ok || !r.data) return r as ActionResult<InviteResult>
  const link = inviteUrl(r.data.inviteToken)
  const emailed = await sendInviteEmail({ to: r.data.email, name: r.data.name, orgName: (await getOrg(await getCtx(slug))).name, link })
  return { ok: true, data: { link, email: r.data.email, name: r.data.name, emailed } }
}

/** Issue a fresh invite link for someone who has not joined yet (invalidates the previous link). */
export async function reissueInvite(slug: string, personId: string): Promise<ActionResult<InviteResult>> {
  const r = await run<{ inviteToken: string; name: string; email: string }>(slug, ['members'], (ctx) => execute(ctx, peopleCreateInvite, { personId }))
  if (!r.ok || !r.data) return r as ActionResult<InviteResult>
  const link = inviteUrl(r.data.inviteToken)
  return { ok: true, data: { link, email: r.data.email, name: r.data.name, emailed: false } }
}
export async function changeRole(slug: string, personId: string, role: 'owner' | 'admin' | 'member' | 'viewer') {
  return run(slug, ['members'], (ctx) => execute(ctx, peopleUpdateRole, { personId, role }))
}
export async function removeMember(slug: string, personId: string) {
  return run(slug, ['members'], (ctx) => execute(ctx, peopleRemove, { personId }))
}

// ---- Agents & keys -------------------------------------------------------------------------
export async function createAgent(slug: string, input: { name: string; client?: string; ownerPersonId?: string; preset?: ScopePreset }) {
  return run(slug, ['agents', 'keys'], (ctx) => execute(ctx, agentsCreate, { ...input, client: input.client || undefined }), true)
}
export async function updateAgentScopes(slug: string, agentId: string, scopes: string[]) {
  return run(slug, ['agents'], (ctx) => execute(ctx, agentsUpdateScopes, { agentId, scopes: scopes as never }))
}
export async function setAgentPreset(slug: string, agentId: string, preset: ScopePreset) {
  return run(slug, ['agents'], (ctx) => execute(ctx, agentsUpdateScopes, { agentId, preset }))
}
export async function setCaptureAutoAccept(slug: string, autoAcceptFromAgents: boolean) {
  return run(slug, ['agents'], (ctx) => execute(ctx, captureSettingsUpdate, { autoAcceptFromAgents }))
}

// ---- Coach / AI ----------------------------------------------------------------------------
export type CoachInput = Parameters<typeof updateAiSettings>[1]

export async function saveCoachSettings(slug: string, input: CoachInput): Promise<ActionResult> {
  try {
    const ctx = await getCtx(slug)
    await updateAiSettings(ctx, input)
    revalidatePath(`/${slug}/settings/coach`)
    revalidatePath(`/${slug}`, 'layout')
    return { ok: true }
  } catch (e) {
    if (isMovaraError(e)) return { ok: false, error: e.message }
    throw e
  }
}

/** Tiny request with the saved config. Mock mode (MOVARA_AI_MOCK=1) succeeds without network. */
export async function testCoachConnection(slug: string): Promise<ActionResult<{ message: string }>> {
  try {
    const ctx = await getCtx(slug)
    await getAiSettings(ctx) // admin only
    const mock = process.env.MOVARA_AI_MOCK === '1'
    if (mock) {
      await recordUsage(ctx, { feature: 'coach', model: 'mock', inputTokens: 12, outputTokens: 2, costEstimateUsd: 0 })
      revalidatePath(`/${slug}/settings/coach`)
      return { ok: true, data: { message: 'Mock mode: connection simulated, no request was sent.' } }
    }
    const cfg = await getAiClientConfig(ctx)
    const base = (cfg.baseUrl ?? 'https://api.openai.com/v1').replace(/\/+$/, '')
    const res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${cfg.apiKey}` },
      body: JSON.stringify({ model: cfg.model, messages: [{ role: 'user', content: 'Reply with the single word: ok' }], max_completion_tokens: 16 }),
      signal: AbortSignal.timeout(20_000),
    })
    const body = (await res.json().catch(() => null)) as { error?: { message?: string }; usage?: { prompt_tokens?: number; completion_tokens?: number } } | null
    if (!res.ok) return { ok: false, error: `The provider answered ${res.status}: ${body?.error?.message ?? res.statusText}`.slice(0, 300) }
    await recordUsage(ctx, { feature: 'coach', model: cfg.model, inputTokens: body?.usage?.prompt_tokens ?? 0, outputTokens: body?.usage?.completion_tokens ?? 0 })
    revalidatePath(`/${slug}/settings/coach`)
    return { ok: true, data: { message: `Connected. ${cfg.model} answered.` } }
  } catch (e) {
    if (isMovaraError(e)) return { ok: false, error: e.message }
    if (e instanceof Error && (e.name === 'TimeoutError' || e.name === 'TypeError')) return { ok: false, error: e.name === 'TimeoutError' ? 'The provider did not answer within 20 seconds.' : `Could not reach the provider: ${(e.cause as Error | undefined)?.message ?? e.message}` }
    throw e
  }
}
export async function setAgentStatus(slug: string, agentId: string, status: 'active' | 'paused') {
  return run(slug, ['agents'], (ctx) => execute(ctx, agentsUpdate, { agentId, status }))
}
export async function revokeAgent(slug: string, agentId: string) {
  return run(slug, ['agents', 'keys'], (ctx) => execute(ctx, agentsRevoke, { agentId }), true)
}
export async function revokeKey(slug: string, keyId: string) {
  return run(slug, ['agents', 'keys'], (ctx) => execute(ctx, agentsRevokeApiKey, { keyId }))
}
export async function issueKey(slug: string, agentId: string, name?: string) {
  return run(slug, ['agents', 'keys'], async (ctx) => {
    const r = await issueApiKey(ctx, { agentId, name: name || undefined })
    return r as { ok: boolean; data?: { key: string; keyId: string; prefix: string; agentId: string }; needsApproval?: boolean }
  })
}

// ---- Approvals -----------------------------------------------------------------------------
export async function decideApproval(slug: string, approvalId: string, decision: 'approve' | 'decline', note?: string) {
  return run(slug, ['approvals'], (ctx) => (decision === 'approve' ? approveApproval(ctx, approvalId, note) : declineApproval(ctx, approvalId, note)), true)
}
