import 'server-only'
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { nextCookies } from 'better-auth/next-js'
import { account, session, user, verification } from '@motion/db'
import { linkUserByEmail } from '@motion/core'
import { getDb } from './db'

function build(db: Awaited<ReturnType<typeof getDb>>) {
  const appUrl = process.env.APP_URL ?? process.env.BETTER_AUTH_URL ?? 'http://localhost:3000'
  return betterAuth({
    baseURL: process.env.BETTER_AUTH_URL ?? appUrl,
    secret: process.env.BETTER_AUTH_SECRET ?? 'motion-dev-secret-change-me-in-production-0000',
    trustedOrigins: [appUrl],
    database: drizzleAdapter(db as never, { provider: 'pg', schema: { user, session, account, verification } }),
    emailAndPassword: { enabled: true, autoSignIn: true, minPasswordLength: 8 },
    databaseHooks: {
      user: {
        create: {
          // Account linking: pending people invited by email attach to the new account.
          after: async (u) => {
            await linkUserByEmail(db, { id: u.id, email: u.email })
          },
        },
      },
    },
    plugins: [nextCookies()],
  })
}

type Auth = ReturnType<typeof build>
const g = globalThis as unknown as { __motionAuth?: Promise<Auth> }

/** The Better Auth instance (created lazily once the database is ready). */
export function getAuth(): Promise<Auth> {
  return (g.__motionAuth ??= getDb().then(build).catch((e) => {
    g.__motionAuth = undefined
    throw e
  }))
}
