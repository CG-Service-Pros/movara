import { sql } from 'drizzle-orm'
import { getDb } from '@/lib/db'

export const dynamic = 'force-dynamic'

/**
 * Liveness + readiness for load balancers, Docker and uptime checks. Public (see proxy.ts) and deliberately
 * terse: it reports only whether the app can reach its database, never versions, config or error details.
 */
export async function GET() {
  const headers = { 'cache-control': 'no-store' }
  try {
    const db = await getDb()
    await db.execute(sql`select 1`)
    return Response.json({ status: 'ok' }, { headers })
  } catch (e) {
    console.error('[movara] health check failed', e)
    return Response.json({ status: 'unavailable' }, { status: 503, headers })
  }
}
