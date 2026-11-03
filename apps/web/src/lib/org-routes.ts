/**
 * The page routes under /{org}, used by proxy.ts to answer unknown URLs with a real HTTP 404.
 * (Pages stream behind [org]/loading.tsx, so a notFound() inside them can only produce a "soft" 404:
 * status 200 + noindex. See node_modules/next/dist/docs/.../file-conventions/loading.md#status-codes.)
 * `src/lib/org-routes.test.ts` fails when a page is added or removed without updating this table.
 */
export type ModuleGate = 'priorities' | 'vision' | 'todos' | 'issues' | 'agents' | 'chart' | 'headlines' | 'scorecard' | 'meetings'
export type IdKind = 'meeting' | 'agent'
type Route = { path: string; module?: ModuleGate; id?: IdKind }

/** `:id` marks a uuid segment. Order does not matter. */
export const ORG_PAGE_ROUTES: Route[] = [
  { path: '' },
  { path: 'todos', module: 'todos' },
  { path: 'inbox' },
  { path: 'priorities', module: 'priorities' },
  { path: 'scorecard', module: 'scorecard' },
  { path: 'issues', module: 'issues' },
  { path: 'headlines', module: 'headlines' },
  { path: 'meetings', module: 'meetings' },
  { path: 'meetings/:id', module: 'meetings', id: 'meeting' },
  { path: 'vision', module: 'vision' },
  { path: 'chart', module: 'chart' },
  { path: 'settings' },
  { path: 'settings/general' },
  { path: 'settings/brand' },
  { path: 'settings/terminology' },
  { path: 'settings/modules' },
  { path: 'settings/calendar' },
  { path: 'settings/members' },
  { path: 'settings/agents', module: 'agents' },
  { path: 'settings/agents/:id', module: 'agents', id: 'agent' },
  { path: 'settings/keys', module: 'agents' },
  { path: 'settings/approvals' },
  { path: 'settings/audit' },
  { path: 'settings/coach' },
]

/** Route handlers under /{org} (not pages): the proxy leaves them alone. */
export const ORG_HANDLER_ROUTES = ['meetings/:id/state']

/** Top-level app paths that are not organization slugs. */
export const NON_ORG_TOP_LEVEL = new Set(['sign-in', 'sign-up', 'invite', 'oauth', 'onboarding', 'api', 'mcp', '.well-known', '_next', 'favicon.ico'])

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type Classified =
  | { kind: 'skip' } // not an org page (top-level route, handler, root)
  | { kind: 'not_found' } // no such page, or a malformed id: 404 without touching the database
  | { kind: 'page'; slug: string; module?: ModuleGate; id?: { kind: IdKind; value: string } }

const match = (pattern: string, rest: string[]) => {
  const parts = pattern ? pattern.split('/') : []
  if (parts.length !== rest.length) return null
  let id: string | undefined
  for (let i = 0; i < parts.length; i++) {
    if (parts[i] === ':id') id = rest[i]
    else if (parts[i] !== rest[i]) return null
  }
  return { id }
}

/** Classify a pathname like `/vindex/meetings/<uuid>`. */
export function classifyOrgPath(pathname: string): Classified {
  const segs = pathname.split('/').filter(Boolean)
  if (segs.length === 0 || NON_ORG_TOP_LEVEL.has(segs[0]!)) return { kind: 'skip' }
  const [slug, ...rest] = segs as [string, ...string[]]
  if (ORG_HANDLER_ROUTES.some((p) => match(p, rest))) return { kind: 'skip' }
  for (const r of ORG_PAGE_ROUTES) {
    const m = match(r.path, rest)
    if (!m) continue
    if (r.id) {
      if (!m.id || !UUID_RE.test(m.id)) return { kind: 'not_found' }
      return { kind: 'page', slug, module: r.module, id: { kind: r.id, value: m.id } }
    }
    return { kind: 'page', slug, module: r.module }
  }
  return { kind: 'not_found' }
}
