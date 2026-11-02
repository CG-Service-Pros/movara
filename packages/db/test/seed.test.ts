import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { count, eq } from 'drizzle-orm'
import { createDb, migrate, seedDemo, seedIfEmpty, orgs, people, metricValues, priorities, milestones, agents, approvals, auditEvents, account, type DbHandle } from '../src'

let db: DbHandle
beforeAll(async () => {
  db = createDb('memory')
  await migrate(db)
})
afterAll(async () => {
  await db.$close()
})

describe('migrate + seed', () => {
  it('migrate is idempotent', async () => {
    await migrate(db)
  })
  it('seeds the demo org once', async () => {
    const first = await seedDemo(db)
    expect(first.created).toBe(true)
    const second = await seedDemo(db)
    expect(second).toEqual({ created: false, orgId: first.orgId })
    expect((await seedIfEmpty(db)).created).toBe(false)
    const [o] = await db.select().from(orgs).where(eq(orgs.slug, 'vindex'))
    expect(o!.name).toBe('Vindex Consulting')
    expect((await db.select({ n: count() }).from(people))[0]!.n).toBe(5)
    expect((await db.select({ n: count() }).from(priorities))[0]!.n).toBe(8)
    expect((await db.select({ n: count() }).from(milestones))[0]!.n).toBeGreaterThan(20)
    expect((await db.select({ n: count() }).from(metricValues))[0]!.n).toBe(5 * 13 - 1)
    expect((await db.select({ n: count() }).from(agents))[0]!.n).toBe(3)
    expect((await db.select({ n: count() }).from(approvals).where(eq(approvals.status, 'pending')))[0]!.n).toBe(1)
    expect((await db.select({ n: count() }).from(auditEvents))[0]!.n).toBeGreaterThan(5)
    const [acc] = await db.select().from(account)
    expect(acc!.providerId).toBe('credential')
    expect(acc!.password).toBeTruthy()
  })
})
