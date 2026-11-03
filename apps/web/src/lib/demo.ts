/**
 * Demo-data policy. The demo org ships a known owner login and a write-scoped API key,
 * so it must never appear in production unless an operator asks for it explicitly.
 */
type Env = Record<string, string | undefined>

/** `MOVARA_SEED_DEMO`: '1' (or any non-'0' value) forces seeding, '0' disables it, unset/blank means "default". */
function explicitFlag(env: Env): boolean | null {
  const v = env.MOVARA_SEED_DEMO?.trim()
  if (!v) return null
  return v !== '0'
}

/**
 * Seed the demo org into an empty database?
 * Explicit `MOVARA_SEED_DEMO` wins. Otherwise only embedded PGlite outside production is seeded
 * (zero-setup development), never a production server, even when it falls back to PGlite.
 */
export function shouldSeedDemo(env: Env, driver: 'pglite' | 'postgres'): boolean {
  const flag = explicitFlag(env)
  if (flag !== null) return flag
  return driver === 'pglite' && env.NODE_ENV !== 'production'
}

/** Show the demo login hint on /sign-in only where the demo org can exist. */
export function showDemoLoginHint(env: Env): boolean {
  const flag = explicitFlag(env)
  if (flag !== null) return flag
  return env.NODE_ENV !== 'production'
}
