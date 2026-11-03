import 'server-only'
import { and, eq, isNull } from 'drizzle-orm'
import { agents, meetings, orgs, people } from '@movara/db'
import { getAuth } from './auth'
import { getDb } from './db'
import type { Classified } from './org-routes'

type OrgRow = { id: string; modules: Record<string, boolean | undefined> }
const ORG_TTL_MS = 10_000
// On globalThis: Proxy and the app are bundled separately but share the process, so settings writes can clear it.
const g = globalThis as unknown as { __movaraOrgRouteCache?: Map<string, { at: number; org: OrgRow | null }> }
const orgCache = (g.__movaraOrgRouteCache ??= new Map())

/** Call after org settings change (modules, etc.) so the proxy's 404 check sees it immediately. */
export function forgetOrgRouteCache(slug: string) {
  orgCache.delete(slug)
}

/** Org id + module switches by slug, cached for a few seconds: Proxy sees every link prefetch. */
async function orgBySlug(slug: string): Promise<OrgRow | null> {
  const hit = orgCache.get(slug)
  if (hit && Date.now() - hit.at < ORG_TTL_MS) return hit.org
  const db = await getDb()
  const [org] = await db.select({ id: orgs.id, modules: orgs.modules }).from(orgs).where(and(eq(orgs.slug, slug), isNull(orgs.deletedAt))).limit(1)
  if (orgCache.size > 500) orgCache.clear()
  orgCache.set(slug, { at: Date.now(), org: org ?? null })
  return org ?? null
}

/**
 * Database half of the proxy's 404 check, for URLs whose shape is valid.
 * - Module switched off → 404 (module settings are not sensitive; cached org lookup, no session needed).
 * - Id routes → 404 when the id does not exist in that org (same scoping as the pages: org_id, not soft-deleted).
 *   Only answered for a valid session of a member of that org, so the status never reveals ids to outsiders.
 * Unknown slugs return `true` so the app keeps its behavior (membership check → redirect).
 */
export async function orgPageExists(c: Extract<Classified, { kind: 'page' }>, requestHeaders: Headers): Promise<boolean> {
  if (!c.module && !c.id) return true
  const org = await orgBySlug(c.slug)
  if (!org) return true
  if (c.module && org.modules[c.module] === false) return false
  if (!c.id) return true
  const session = await (await getAuth()).api.getSession({ headers: requestHeaders })
  if (!session) return true
  const db = await getDb()
  const [member] = await db.select({ id: people.id }).from(people).where(and(eq(people.orgId, org.id), eq(people.userId, session.user.id), isNull(people.deletedAt))).limit(1)
  if (!member) return true
  const table = c.id.kind === 'meeting' ? meetings : agents
  const [row] = await db.select({ id: table.id }).from(table).where(and(eq(table.id, c.id.value), eq(table.orgId, org.id), isNull(table.deletedAt))).limit(1)
  return !!row
}
