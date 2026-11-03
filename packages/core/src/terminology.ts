import { eq } from 'drizzle-orm'
import { orgs } from '@movara/db'
import { resolveTerm, type Term, type TermKey, type TermOverrides, type TerminologyPack } from '@movara/terminology'
import type { Ctx } from './ctx'
import { requireRead } from './ctx'
import { MovaraError } from './errors'

export type TermForm = 'singular' | 'plural' | 'short'

export const DEFAULT_STATUS_LABELS: Record<string, string> = {
  on_track: 'On track',
  off_track: 'Off track',
  done: 'Done',
  not_done: 'Not done',
  dropped: 'Dropped',
  open: 'Open',
  pending: 'Pending',
  solved: 'Solved',
}

export type Terms = {
  /** Label for a concept. `short` falls back to `singular`. */
  t(key: TermKey, form?: TermForm): string
  /** The full resolved term (singular, plural, short?, description?). */
  term(key: TermKey): Term
  /** Label for a status value ("on_track" -> "On track" / the pack's label). */
  status(value: string): string
  pack: TerminologyPack | null
  overrides: TermOverrides
  /** Trademark/attribution notice of the active pack, if any. */
  attribution?: string
}

/** Build a resolver from a pack + overrides (pure; usable on the client when given plain JSON). */
export function createTerms(pack?: TerminologyPack | null, overrides?: TermOverrides | null): Terms {
  const ov = overrides ?? {}
  const p = pack ?? undefined
  return {
    t(key, form = 'singular') {
      const term = resolveTerm(key, p, ov)
      return form === 'short' ? (term.short ?? term.singular) : term[form]
    },
    term: (key) => resolveTerm(key, p, ov),
    status: (value) => p?.statuses?.[value] ?? DEFAULT_STATUS_LABELS[value] ?? value,
    pack: pack ?? null,
    overrides: ov,
    attribution: p?.attribution,
  }
}

/** The org's resolved terminology: override -> active pack -> Standard. */
export async function getTerms(ctx: Ctx): Promise<Terms> {
  requireRead(ctx)
  const [o] = await ctx.db.select({ pack: orgs.terminologyPack, overrides: orgs.terminologyOverrides }).from(orgs).where(eq(orgs.id, ctx.orgId)).limit(1)
  if (!o) throw new MovaraError('not_found', 'Organization not found')
  return createTerms(o.pack, o.overrides)
}
