import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { orgs, MODULE_KEYS, type Branding } from '@motion/db'
import { TermOverrides, TERM_KEYS, previewImport, TerminologyPack } from '@motion/terminology'
import type { Ctx } from '../ctx'
import { MotionError } from '../errors'
import { assertVersion, found, touch } from '../helpers'
import { defineCommand } from '../runner'
import { TERMINOLOGY_HISTORY_MAX, terminologyHistoryOf } from './queries'

async function load(ctx: Ctx) {
  const [o] = await ctx.db.select().from(orgs).where(eq(orgs.id, ctx.orgId)).limit(1)
  return found(o, 'Organization')
}

/** Max length of an inline (data URL) logo, ~200KB of image data once base64-encoded. */
export const MAX_LOGO_DATA_URL = 280_000
const DATA_IMAGE = /^data:image\/(?:png|jpeg|webp|svg\+xml);base64,[A-Za-z0-9+/]+={0,2}$/

/**
 * A brand image: an https URL, or a base64 data URL of png/jpeg/webp/svg. Nothing else (no javascript:, http:, other mime types).
 * SVGs are only ever rendered through <img>, where scripts do not run.
 */
export const brandImage = z
  .string()
  .max(MAX_LOGO_DATA_URL)
  .refine((v) => {
    if (v.startsWith('data:')) return DATA_IMAGE.test(v)
    try {
      return new URL(v).protocol === 'https:'
    } catch {
      return false
    }
  }, 'Use an https URL or a PNG, JPEG, WebP or SVG image up to 200KB')

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use a #rrggbb color')

export const orgUpdateGeneral = defineCommand({
  name: 'org.update_general',
  scope: 'admin',
  minRole: 'admin',
  input: z.object({ name: z.string().trim().min(1).max(80).optional(), timezone: z.string().min(1).optional() }),
  run: async (ctx, input, h) => {
    const before = await load(ctx)
    assertVersion(before, h.expectedVersion)
    if (input.timezone) {
      try {
        new Intl.DateTimeFormat('en', { timeZone: input.timezone })
      } catch {
        throw new MotionError('validation', 'Unknown timezone')
      }
    }
    const [after] = await ctx.db.update(orgs).set({ ...input, ...touch(orgs, ctx) }).where(eq(orgs.id, ctx.orgId)).returning()
    return { data: after!, entity: { type: 'org', id: ctx.orgId }, before: { name: before.name, timezone: before.timezone }, after: { name: after!.name, timezone: after!.timezone } }
  },
})

export const orgUpdateBranding = defineCommand({
  name: 'org.update_branding',
  scope: 'admin',
  minRole: 'admin',
  input: z.object({
    wordmark: z.string().trim().max(40).optional(),
    logoLight: brandImage.nullable().optional(),
    logoDark: brandImage.nullable().optional(),
    favicon: brandImage.nullable().optional(),
    accent: hex.optional(),
    loginBackground: brandImage.nullable().optional(),
    emailSenderName: z.string().trim().max(80).optional(),
  }),
  run: async (ctx, input, h) => {
    const before = await load(ctx)
    assertVersion(before, h.expectedVersion)
    const merged: Record<string, unknown> = { ...before.branding }
    for (const [k, v] of Object.entries(input)) {
      if (v === null) delete merged[k]
      else if (v !== undefined) merged[k] = v
    }
    const [after] = await ctx.db.update(orgs).set({ branding: merged as Branding, ...touch(orgs, ctx) }).where(eq(orgs.id, ctx.orgId)).returning()
    return { data: after!, entity: { type: 'org', id: ctx.orgId }, before: { branding: before.branding }, after: { branding: after!.branding } }
  },
})

export const orgUpdateSettings = defineCommand({
  name: 'org.update_settings',
  scope: 'admin',
  minRole: 'admin',
  input: z.object({ settings: z.record(z.string(), z.unknown()) }),
  run: async (ctx, input, h) => {
    const before = await load(ctx)
    assertVersion(before, h.expectedVersion)
    const [after] = await ctx.db.update(orgs).set({ settings: { ...before.settings, ...input.settings }, ...touch(orgs, ctx) }).where(eq(orgs.id, ctx.orgId)).returning()
    return { data: after!, entity: { type: 'org', id: ctx.orgId }, before: { settings: before.settings }, after: { settings: after!.settings } }
  },
})

export const orgUpdateModules = defineCommand({
  name: 'org.update_modules',
  scope: 'admin',
  minRole: 'admin',
  input: z.object({ modules: z.partialRecord(z.enum(MODULE_KEYS), z.boolean()) }),
  run: async (ctx, input, h) => {
    const before = await load(ctx)
    assertVersion(before, h.expectedVersion)
    const [after] = await ctx.db.update(orgs).set({ modules: { ...before.modules, ...input.modules }, ...touch(orgs, ctx) }).where(eq(orgs.id, ctx.orgId)).returning()
    return { data: after!, entity: { type: 'org', id: ctx.orgId }, before: { modules: before.modules }, after: { modules: after!.modules } }
  },
})

const validTz = (tz: string) => {
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz })
    return true
  } catch {
    return false
  }
}
const month = z.number().int().min(1).max(12)
export const orgUpdateCalendar = defineCommand({
  name: 'org.update_calendar',
  scope: 'admin',
  minRole: 'admin',
  input: z.object({
    fiscalYearStartMonth: month.optional(),
    weekStartDay: z.number().int().min(0).max(6).optional(),
    timezone: z.string().refine(validTz, 'Unknown timezone').optional(),
    quarterCalendar: z
      .object({ mode: z.enum(['standard', 'custom']), quarterStartMonths: z.tuple([month, month, month, month]).optional() })
      .refine((q) => q.mode === 'standard' || !!q.quarterStartMonths, { message: 'quarterStartMonths is required for a custom calendar' })
      .optional(),
  }),
  run: async (ctx, input, h) => {
    const before = await load(ctx)
    assertVersion(before, h.expectedVersion)
    const [after] = await ctx.db.update(orgs).set({ ...input, ...touch(orgs, ctx) }).where(eq(orgs.id, ctx.orgId)).returning()
    const pick = (o: typeof before) => ({ fiscalYearStartMonth: o.fiscalYearStartMonth, weekStartDay: o.weekStartDay, timezone: o.timezone, quarterCalendar: o.quarterCalendar })
    return { data: after!, entity: { type: 'org', id: ctx.orgId }, before: pick(before), after: pick(after!) }
  },
})

/**
 * Apply a terminology pack (validated with previewImport), `revert` to the previously applied one, or reset to Standard
 * (`pack: null`). Applying or resetting pushes the current pack on a history stack and revert pops it,
 * so repeated reverts walk back through every applied pack. Agents always need approval.
 */
export const orgSetTerminologyPack = defineCommand({
  name: 'org.set_terminology_pack',
  scope: 'admin',
  minRole: 'admin',
  input: z.object({ pack: z.unknown().nullable(), revert: z.boolean().optional() }),
  requiresApprovalForAgents: true,
  summary: (i) => (i.revert ? 'Revert to the previous terminology pack' : i.pack ? `Apply terminology pack "${(i.pack as { name?: string }).name ?? 'unknown'}"` : 'Reset terminology to Standard'),
  run: async (ctx, input, h) => {
    const before = await load(ctx)
    assertVersion(before, h.expectedVersion)
    let next: TerminologyPack | null
    let history = terminologyHistoryOf(before)
    if (input.revert) {
      if (!history.length) throw new MotionError('conflict', 'There is no previous terminology pack to revert to')
      next = history[history.length - 1] ?? null
      history = history.slice(0, -1)
    } else if (input.pack === null) {
      next = null
      if (before.terminologyPack) history = [...history, before.terminologyPack].slice(-TERMINOLOGY_HISTORY_MAX)
    } else {
      const preview = previewImport(input.pack, before.terminologyPack ?? undefined)
      if (!preview.ok) throw new MotionError('validation', 'Invalid terminology pack', { issues: preview.errors })
      next = preview.pack
      const same = before.terminologyPack && before.terminologyPack.id === next.id && before.terminologyPack.version === next.version
      if (!same) history = [...history, before.terminologyPack ?? null].slice(-TERMINOLOGY_HISTORY_MAX)
    }
    const [after] = await ctx.db
      .update(orgs)
      .set({
        terminologyPack: next,
        terminologyPreviousPack: history[history.length - 1] ?? null,
        settings: { ...before.settings, terminologyHistory: history },
        ...touch(orgs, ctx),
      })
      .where(eq(orgs.id, ctx.orgId))
      .returning()
    return {
      data: after!,
      entity: { type: 'org', id: ctx.orgId },
      before: { terminologyPack: before.terminologyPack ? { id: before.terminologyPack.id, version: before.terminologyPack.version } : null },
      after: { terminologyPack: next ? { id: next.id, version: next.version } : null, historyDepth: history.length },
    }
  },
})

/** Replace the org's per-term overrides (send the full desired map; `{}` clears). */
export const orgSetTerminologyOverrides = defineCommand({
  name: 'org.set_terminology_overrides',
  scope: 'admin',
  minRole: 'admin',
  input: z.object({ overrides: TermOverrides }),
  run: async (ctx, input, h) => {
    const before = await load(ctx)
    assertVersion(before, h.expectedVersion)
    const keys = Object.keys(input.overrides)
    for (const k of keys) if (!(TERM_KEYS as readonly string[]).includes(k)) throw new MotionError('validation', `Unknown term key: ${k}`)
    const [after] = await ctx.db.update(orgs).set({ terminologyOverrides: input.overrides, ...touch(orgs, ctx) }).where(eq(orgs.id, ctx.orgId)).returning()
    return { data: after!, entity: { type: 'org', id: ctx.orgId }, before: { terminologyOverrides: before.terminologyOverrides }, after: { terminologyOverrides: after!.terminologyOverrides } }
  },
})

