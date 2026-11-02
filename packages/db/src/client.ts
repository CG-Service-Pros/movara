import { existsSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite'
import { drizzle as drizzlePostgres } from 'drizzle-orm/postgres-js'
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core'
import postgres from 'postgres'
import * as schema from './schema'
import { MIGRATIONS } from './migrations.generated'

export type Schema = typeof schema
/** Works for both drivers and for transactions (a transaction extends PgDatabase). */
export type Db = PgDatabase<PgQueryResultHKT, Schema>
export type Driver = 'pglite' | 'postgres'
export type DbHandle = Db & { $driver: Driver; $close(): Promise<void> }

export const DEFAULT_PGLITE_DIR = './.data/pglite'

/** Resolve a DATABASE_URL value into a driver + location. */
export function parseDatabaseUrl(url?: string | null): { driver: Driver; location: string } {
  const u = (url ?? '').trim()
  if (!u) return { driver: 'pglite', location: resolve(/*turbopackIgnore: true*/ process.cwd(), findRepoRoot(), DEFAULT_PGLITE_DIR) }
  if (u === 'memory' || u === 'pglite://memory' || u === 'memory://') return { driver: 'pglite', location: 'memory://' }
  if (u.startsWith('pglite://')) {
    const rest = u.slice('pglite://'.length)
    return { driver: 'pglite', location: rest === '' ? resolve(/*turbopackIgnore: true*/ process.cwd(), findRepoRoot(), DEFAULT_PGLITE_DIR) : resolve(/*turbopackIgnore: true*/ process.cwd(), rest) }
  }
  return { driver: 'postgres', location: u }
}

/** The default PGlite dir is anchored at the monorepo root (the dir holding pnpm-workspace.yaml), not the cwd. */
function findRepoRoot(): string {
  let dir = process.cwd()
  for (let i = 0; i < 6; i++) {
    if (existsSync(resolve(/*turbopackIgnore: true*/ dir, 'pnpm-workspace.yaml'))) return resolve(/*turbopackIgnore: true*/ dir)
    const up = resolve(/*turbopackIgnore: true*/ dir, '..')
    if (up === dir) break
    dir = up
  }
  return process.cwd()
}

/**
 * Create a Drizzle instance.
 *  - `postgres://…`  -> postgres-js
 *  - unset / `pglite://<dir>` -> PGlite persisted at <dir> (default <repo>/.data/pglite)
 *  - `memory` -> in-memory PGlite (tests)
 * Run `await migrate(db)` before first use.
 */
export function createDb(url?: string | null): DbHandle {
  const { driver, location } = parseDatabaseUrl(url ?? process.env.DATABASE_URL)
  if (driver === 'postgres') {
    const client = postgres(location, { max: 10, onnotice: () => {} })
    const db = drizzlePostgres(client, { schema }) as unknown as DbHandle
    db.$driver = 'postgres'
    db.$close = async () => {
      await client.end()
    }
    return db
  }
  if (location !== 'memory://') mkdirSync(location, { recursive: true })
  const client = new PGlite(location === 'memory://' ? undefined : location)
  const db = drizzlePglite(client, { schema }) as unknown as DbHandle
  db.$driver = 'pglite'
  db.$close = async () => {
    await client.close()
  }
  return db
}

/** Apply embedded SQL migrations (idempotent). */
export async function migrate(db: Db): Promise<void> {
  // drizzle's migrators accept MigrationMeta[]; both drivers share the same dialect.migrate.
  const anyDb = db as unknown as {
    dialect: { migrate(m: unknown[], session: unknown, config: unknown): Promise<void> }
    session: unknown
  }
  const migrations = MIGRATIONS.map((m) => ({ sql: m.sql, folderMillis: m.folderMillis, hash: m.hash, bps: true }))
  await anyDb.dialect.migrate(migrations, anyDb.session, { migrationsTable: '__drizzle_migrations' })
}
