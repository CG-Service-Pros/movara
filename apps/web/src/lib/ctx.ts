import 'server-only'
import { cache } from 'react'
import { redirect } from 'next/navigation'
import { ctxForUser, getOrg, getTerms, listTeamsForPerson, type Ctx, type OrgRow, type Terms } from '@motion/core'
import { MODULE_KEYS, type ModuleKey } from '@motion/db'
import { notFound } from 'next/navigation'
import { getDb } from './db'
import { getSession } from './session'

/**
 * The acting Ctx for the signed-in user in org `orgSlug`.
 * Redirects to /sign-in when signed out and to / (which routes to a member org or onboarding)
 * when the user is not a member of that org. Cached per request.
 */
export const getCtx = cache(async (orgSlug: string): Promise<Ctx> => {
  const session = await getSession()
  if (!session) redirect(`/sign-in?next=${encodeURIComponent(`/${orgSlug}`)}`)
  const db = await getDb()
  const ctx = await ctxForUser(db, { slug: orgSlug }, session.user.id)
  if (!ctx) redirect('/')
  return ctx
})

/** The org's resolved terminology resolver `t(key, 'singular' | 'plural' | 'short')`. */
export const getOrgTerms = cache(async (orgSlug: string): Promise<Terms> => getTerms(await getCtx(orgSlug)))

/** Everything a page usually needs: ctx, org row, terms, enabled modules. Cached per request. */
export const getOrgContext = cache(async (orgSlug: string) => {
  const ctx = await getCtx(orgSlug)
  const [org, terms] = await Promise.all([getOrg(ctx), getTerms(ctx)])
  return { ctx, org, terms, modules: resolveModules(org) }
})

export type EnabledModules = Record<ModuleKey, boolean>
export function resolveModules(org: Pick<OrgRow, 'modules'>): EnabledModules {
  return Object.fromEntries(MODULE_KEYS.map((k) => [k, org.modules[k] !== false])) as EnabledModules
}

/** Call at the top of a module's pages: 404s when the org switched the module off. */
export async function requireModule(orgSlug: string, key: ModuleKey) {
  const c = await getOrgContext(orgSlug)
  if (!c.modules[key]) notFound()
  return c
}

/** The teams the acting person belongs to (Leadership first). */
export const getMyTeams = cache(async (orgSlug: string) => {
  const ctx = await getCtx(orgSlug)
  return listTeamsForPerson(ctx, ctx.actor.type === 'person' ? ctx.actor.id : (ctx.actor.onBehalfOf as string))
})
