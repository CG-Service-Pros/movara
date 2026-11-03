import { getOrg, getTerms } from '@movara/core'
import type { HandlerMap } from '../types'

/** REST handlers for the org area. Keys: "METHOD /path/:param" relative to /api/v1. */
export const handlers: HandlerMap = {
  // The acting org: identity, calendar, branding, modules and the active terminology.
  'GET /org': async ({ ctx }) => {
    const [org, terms] = await Promise.all([getOrg(ctx), getTerms(ctx)])
    return {
      id: org.id,
      name: org.name,
      slug: org.slug,
      timezone: org.timezone,
      fiscalYearStartMonth: org.fiscalYearStartMonth,
      weekStartDay: org.weekStartDay,
      quarterCalendar: org.quarterCalendar,
      branding: org.branding,
      modules: org.modules,
      terminologyPack: terms.pack ? { id: terms.pack.id, name: terms.pack.name, version: terms.pack.version } : null,
      version: org.version,
      actor: ctx.actor,
      scopes: ctx.scopes,
    }
  },
}
