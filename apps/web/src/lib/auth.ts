import 'server-only'
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { nextCookies } from 'better-auth/next-js'
import { APIError, createAuthMiddleware } from 'better-auth/api'
import { account, session, user, verification } from '@movara/db'
import { resolveAuthSecret } from './auth-secret'
import { getDb } from './db'
import { signupAllowed } from './signup'
import { INVITE_HEADER, INVITE_ONLY_MESSAGE } from './signup-policy'

function build(db: Awaited<ReturnType<typeof getDb>>) {
  const appUrl = process.env.APP_URL ?? process.env.BETTER_AUTH_URL ?? 'http://localhost:3000'
  return betterAuth({
    baseURL: process.env.BETTER_AUTH_URL ?? appUrl,
    secret: resolveAuthSecret(),
    trustedOrigins: [appUrl],
    database: drizzleAdapter(db as never, { provider: 'pg', schema: { user, session, account, verification } }),
    emailAndPassword: { enabled: true, autoSignIn: true, minPasswordLength: 8 },
    // Invite-only sign-up (see signup-policy.ts). Accounts are never linked to an org here: invitations are
    // redeemed only through /invite/<token>, after sign-up.
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.path !== '/sign-up/email') return
        const token = ctx.headers?.get(INVITE_HEADER)?.trim() || null
        if (!(await signupAllowed(db as never, token))) throw new APIError('FORBIDDEN', { message: INVITE_ONLY_MESSAGE })
      }),
    },
    plugins: [nextCookies()],
  })
}

type Auth = ReturnType<typeof build>
const g = globalThis as unknown as { __movaraAuth?: Promise<Auth> }

/** The Better Auth instance (created lazily once the database is ready). */
export function getAuth(): Promise<Auth> {
  return (g.__movaraAuth ??= getDb().then(build).catch((e) => {
    g.__movaraAuth = undefined
    throw e
  }))
}
