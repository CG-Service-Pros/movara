import 'server-only'
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { nextCookies } from 'better-auth/next-js'
import { account, session, user, verification } from '@movara/db'
import { resolveAuthSecret } from './auth-secret'
import { getDb } from './db'

function build(db: Awaited<ReturnType<typeof getDb>>) {
  const appUrl = process.env.APP_URL ?? process.env.BETTER_AUTH_URL ?? 'http://localhost:3000'
  return betterAuth({
    baseURL: process.env.BETTER_AUTH_URL ?? appUrl,
    secret: resolveAuthSecret(),
    trustedOrigins: [appUrl],
    database: drizzleAdapter(db as never, { provider: 'pg', schema: { user, session, account, verification } }),
    emailAndPassword: { enabled: true, autoSignIn: true, minPasswordLength: 8 },
    // No sign-up hook that links invited people by email: invitations are redeemed only through /invite/<token>.
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
