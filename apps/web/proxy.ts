import { getSessionCookie } from 'better-auth/cookies'
import { NextResponse, type NextRequest } from 'next/server'
import { notFoundResponse } from './src/lib/not-found-response'
import { classifyOrgPath } from './src/lib/org-routes'

const PUBLIC = ['/sign-in', '/sign-up', '/invite', '/api/auth', '/api/v1', '/api/health', '/mcp', '/_next', '/favicon.ico']

/**
 * 1. Auth guard: anything but the public paths needs a Better Auth session cookie. (Real session checks happen in getCtx.)
 * 2. Real 404s for unknown org URLs. Org pages stream behind [org]/loading.tsx, so a notFound() inside them can
 *    only send status 200 + noindex. Checking here, before rendering, lets full page loads answer a real 404
 *    (a standalone "Page not found" card).
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  if (PUBLIC.some((p) => pathname === p || pathname.startsWith(p + '/'))) return NextResponse.next()
  if (!getSessionCookie(request)) {
    const url = request.nextUrl.clone()
    url.pathname = '/sign-in'
    url.search = pathname === '/' ? '' : `?next=${encodeURIComponent(pathname + request.nextUrl.search)}`
    return NextResponse.redirect(url)
  }
  // Applies to full loads and client navigations alike: Next strips RSC headers in Proxy so both get the same answer
  // (see the Proxy docs, "RSC requests and rewrites"). A client navigation to an unknown URL therefore lands on the
  // 404 card through a full load; no in-app link points to one.
  const isDocument = request.method === 'GET' || request.method === 'HEAD'
  if (isDocument) {
    const c = classifyOrgPath(pathname)
    const missing = c.kind === 'not_found' || (c.kind === 'page' && !(await (await import('./src/lib/org-404-check')).orgPageExists(c, request.headers)))
    if (missing) {
      const slug = pathname.split('/').filter(Boolean)[0]!
      const theme = request.cookies.get('movara-theme')?.value === 'dark' ? 'dark' : 'light'
      return notFoundResponse({ slug, theme, head: request.method === 'HEAD' })
    }
  }
  return NextResponse.next()
}

export const config = { matcher: ['/((?!_next/static|_next/image|.*\\..*).*)'] }
