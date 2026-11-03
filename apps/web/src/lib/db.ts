import 'server-only'
import { createDb, migrate, seedIfEmpty, type DbHandle } from '@movara/db'
import { shouldSeedDemo } from './demo'

type State = { db: DbHandle; ready: Promise<void> }
const g = globalThis as unknown as { __movaraDb?: State }

function init(): State {
  const db = createDb(process.env.DATABASE_URL)
  const seed = shouldSeedDemo(process.env, db.$driver)
  if (seed && process.env.NODE_ENV === 'production') {
    console.warn('[movara] MOVARA_SEED_DEMO is set: the demo org (known login and API key) will be seeded if this production database is empty')
  }
  const ready = (async () => {
    await migrate(db)
    if (seed) await seedIfEmpty(db)
  })()
  // Do not poison the singleton on failure: allow a retry on the next request.
  ready.catch((e) => {
    console.error('[movara] database initialization failed', e)
    g.__movaraDb = undefined
  })
  return { db, ready }
}

/**
 * The shared database handle. On first use it creates the DB (PGlite at ./.data/pglite when
 * DATABASE_URL is blank), applies migrations and seeds the demo org if empty (development PGlite by
 * default, or wherever MOVARA_SEED_DEMO=1; never a production server by default, see ./demo.ts).
 * Created lazily so `next build` never opens the database.
 */
export async function getDb(): Promise<DbHandle> {
  const s = (g.__movaraDb ??= init())
  await s.ready
  return s.db
}
