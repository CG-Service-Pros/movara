import { rmSync } from 'node:fs'
import { sql } from 'drizzle-orm'
import { createDb, migrate, parseDatabaseUrl } from './client'
import { seedDemo } from './seed'

/** Drop everything, re-run migrations and seed the demo org. */
export async function resetDatabase(url?: string | null, opts: { seed?: boolean } = {}) {
  const { driver, location } = parseDatabaseUrl(url ?? process.env.DATABASE_URL)
  if (driver === 'pglite') {
    if (location !== 'memory://') rmSync(location, { recursive: true, force: true })
  } else {
    const admin = createDb(location)
    await admin.execute(sql`drop schema if exists public cascade`)
    await admin.execute(sql`drop schema if exists drizzle cascade`)
    await admin.execute(sql`create schema public`)
    await admin.$close()
  }
  const db = createDb(url)
  await migrate(db)
  const seeded = opts.seed === false ? null : await seedDemo(db)
  return { db, seeded }
}
