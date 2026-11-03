/** Test helpers: `import { createTestDb, seedTestOrg } from '@movara/core/testing'`. */
import { createDb, migrate, newId, user, type DbHandle } from '@movara/db'
import { createOrg, type OrgRow } from './org'
import { execute } from './runner'
import { agentsCreate, issueApiKey } from './agents'
import { peopleAdd } from './people'
import type { Ctx } from './ctx'
import { ctxForAgent, ctxForPerson } from './ctx'

/** In-memory PGlite with all migrations applied. Call `db.$close()` in afterAll. */
export async function createTestDb(): Promise<DbHandle> {
  const db = createDb('memory')
  await migrate(db)
  return db
}

let n = 0
/** Insert a Better Auth user row (no password). */
export async function createTestUser(db: DbHandle, name = 'Test User') {
  const id = newId()
  n++
  const email = `user${n}-${id.slice(-6)}@test.local`
  await db.insert(user).values({ id, name, email, emailVerified: true })
  return { id, name, email }
}

/** A fresh org with an owner. Returns the owner ctx plus helpers to add members/agents. */
export async function seedTestOrg(db: DbHandle, slug = `org-${newId().slice(-8)}`) {
  const u = await createTestUser(db, 'Owner')
  const { org, ctx } = await createOrg(db, { name: `Org ${slug}`, slug, ownerUserId: u.id })
  const addPerson = async (name: string, role: 'admin' | 'member' | 'viewer' = 'member'): Promise<{ ctx: Ctx; personId: string }> => {
    const r = await execute(ctx, peopleAdd, { name, email: `${name.toLowerCase().replace(/\W+/g, '.')}-${newId().slice(-5)}@test.local`, role })
    if (!r.ok) throw new Error('unexpected approval')
    return { ctx: await ctxForPerson(db, org.id, r.data.id), personId: r.data.id }
  }
  const addAgent = async (name: string, scopes: Parameters<typeof agentsCreate.run>[1]['scopes'] = ['read'], ownerPersonId?: string) => {
    const r = await execute(ctx, agentsCreate, { name, scopes, ownerPersonId })
    if (!r.ok) throw new Error('unexpected approval')
    const k = await issueApiKey(ctx, { agentId: r.data.id })
    return { agentId: r.data.id, ctx: await ctxForAgent(db, org.id, r.data.id), apiKey: k.ok ? k.data.key : '' }
  }
  return { org: org as OrgRow, ctx, addPerson, addAgent }
}
