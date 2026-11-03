/** Throws unless the secret is a real one (>= 32 chars, not a placeholder). Shared by auth.ts and instrumentation.ts. */
export function assertProductionSecret(secret: string | undefined): string {
  if (!secret || secret.length < 32 || /change-me|movara-dev-secret/i.test(secret)) {
    throw new Error('BETTER_AUTH_SECRET must be set to a random string of at least 32 characters in production (e.g. `openssl rand -base64 32`).')
  }
  return secret
}

/** Production requires BETTER_AUTH_SECRET (no fallback). Only outside production a clearly-labelled development secret is used. */
export function resolveAuthSecret(env: Record<string, string | undefined> = process.env): string {
  if (env.NODE_ENV === 'production') return assertProductionSecret(env.BETTER_AUTH_SECRET)
  return env.BETTER_AUTH_SECRET || 'movara-dev-secret-change-me-in-production-0000'
}
