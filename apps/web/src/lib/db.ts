import 'server-only'
import { createDb, migrate, seedIfEmpty, type DbHandle } from '@movara/db'

type State = { db: DbHandle; ready: Promise<void> }
const g = globalThis as unknown as { __movaraDb?: State }

function init(): State {
  const db = createDb(process.env.DATABASE_URL)
  const seed = process.env.MOVARA_SEED_DEMO ? process.env.MOVARA_SEED_DEMO !== '0' : db.$driver === 'pglite'
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
 * DATABASE_URL is blank), applies migrations and, for PGlite, seeds the demo org if empty.
 * Created lazily so `next build` never opens the database.
 */
export async function getDb(): Promise<DbHandle> {
  const s = (g.__movaraDb ??= init())
  await s.ready
  return s.db
}
