import { getSessionCookie } from 'better-auth/cookies'
import { NextResponse, type NextRequest } from 'next/server'

const PUBLIC = ['/sign-in', '/sign-up', '/invite', '/api/auth', '/api/v1', '/api/health', '/mcp', '/_next', '/favicon.ico']

/** Auth guard: anything but the public paths needs a Better Auth session cookie. (Real session checks happen in getCtx.) */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  if (PUBLIC.some((p) => pathname === p || pathname.startsWith(p + '/'))) return NextResponse.next()
  if (!getSessionCookie(request)) {
    const url = request.nextUrl.clone()
    url.pathname = '/sign-in'
    url.search = pathname === '/' ? '' : `?next=${encodeURIComponent(pathname + request.nextUrl.search)}`
    return NextResponse.redirect(url)
  }
  return NextResponse.next()
}

export const config = { matcher: ['/((?!_next/static|_next/image|.*\\..*).*)'] }
