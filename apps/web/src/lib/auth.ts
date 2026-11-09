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
import { after } from 'next/server'
import { sendPasswordResetEmail } from './password-recovery-email'

function build(db: Awaited<ReturnType<typeof getDb>>) {
  const appUrl = process.env.APP_URL ?? process.env.BETTER_AUTH_URL ?? 'http://localhost:3000'
  return betterAuth({
    baseURL: process.env.BETTER_AUTH_URL ?? appUrl,
    secret: resolveAuthSecret(),
    trustedOrigins: [appUrl],
    advanced: { disableOriginCheck: false, disableCSRFCheck: false },
    database: drizzleAdapter(db as never, { provider: 'pg', schema: { user, session, account, verification } }),
    emailAndPassword: {
      enabled: true,
      autoSignIn: true,
      minPasswordLength: 8,
      resetPasswordTokenExpiresIn: 30 * 60,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => {
        // Keep delivery alive on Vercel without exposing account existence through SMTP latency.
        after(async () => {
          try {
            await sendPasswordResetEmail(user.email, url)
          } catch {
            // Transport errors can contain credentials, recipient addresses or reset links.
            console.error('[movara] Password recovery email delivery failed')
          }
        })
      },
    },
    // Invite-only sign-up (see signup-policy.ts). Accounts are never linked to an org here: invitations are
    // redeemed only through /invite/<token>, after sign-up.
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.path === '/request-password-reset' && !process.env.SMTP_HOST) {
          throw new APIError('SERVICE_UNAVAILABLE', { message: 'Password recovery email is not configured. Please contact your administrator.' })
        }
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
