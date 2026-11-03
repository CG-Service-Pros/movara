import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { people, user, newId, type DbHandle } from '@movara/db'
import { STANDARD_PACK } from '@movara/terminology'
import {
  createOrg, execute, getOrg, getOrgBySlug, getTerms, createTerms, acceptInvite, getInvite, peopleCreateInvite, listMembershipsForUser, listPeople, listTeams, listTeamsForPerson, listAudit,
  orgSetTerminologyOverrides, orgSetTerminologyPack, orgUpdateBranding, orgUpdateCalendar, orgUpdateModules, orgUpdateSettings, orgUpdateGeneral,
  peopleAdd, peopleRemove, peopleUpdate, peopleUpdateRole, teamsAddMember, teamsCreate, teamsDelete, teamsRemoveMember, teamsUpdate, ctxForUser, getPerson,
} from '../src'
import { createTestDb, createTestUser, seedTestOrg } from '../src/testing'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

let db: DbHandle
beforeAll(async () => {
  db = await createTestDb()
})
afterAll(async () => {
  await db.$close()
})
const eosPack = JSON.parse(readFileSync(join(__dirname, '..', '..', '..', 'packs', 'eos', 'pack.json'), 'utf8'))

describe('org', () => {
  it('creates an org with an owner person and a leadership team', async () => {
    const u = await createTestUser(db, 'Olive Owner')
    const { org, ctx } = await createOrg(db, { name: 'Acme', slug: 'acme-co', ownerUserId: u.id })
    expect(org.slug).toBe('acme-co')
    expect(ctx.role).toBe('owner')
    expect((await listPeople(ctx))[0]).toMatchObject({ name: 'Olive Owner', userId: u.id, role: 'owner' })
    expect((await listTeams(ctx))[0]).toMatchObject({ name: 'Leadership team', isLeadership: true })
    expect((await getOrgBySlug(db, 'acme-co'))!.id).toBe(org.id)
    expect((await listMembershipsForUser(db, u.id)).map((m) => m.slug)).toEqual(['acme-co'])
    expect((await ctxForUser(db, { slug: 'acme-co' }, u.id))!.actor.id).toBe(ctx.actor.id)
    expect(await ctxForUser(db, { slug: 'acme-co' }, 'someone-else')).toBeNull()
    expect((await listAudit(ctx)).items[0]!.command).toBe('org.create')
  })

  it('rejects duplicate or invalid slugs', async () => {
    const u = await createTestUser(db)
    await createOrg(db, { name: 'One', slug: 'dup-slug', ownerUserId: u.id })
    await expect(createOrg(db, { name: 'Two', slug: 'dup-slug', ownerUserId: u.id })).rejects.toMatchObject({ code: 'conflict' })
    await expect(createOrg(db, { name: 'Bad', slug: 'Bad Slug!', ownerUserId: u.id })).rejects.toMatchObject({ code: 'validation' })
    await expect(createOrg(db, { name: 'Bad', slug: 'api', ownerUserId: u.id })).rejects.toMatchObject({ code: 'validation' })
  })

  it('updates general, branding, settings, modules and calendar (admin only)', async () => {
    const { ctx, addPerson } = await seedTestOrg(db)
    await execute(ctx, orgUpdateGeneral, { name: 'Renamed', timezone: 'America/New_York' })
    await execute(ctx, orgUpdateBranding, { wordmark: 'Ren', accent: '#d9480f' })
    await execute(ctx, orgUpdateBranding, { emailSenderName: 'Ren Team' })
    await execute(ctx, orgUpdateSettings, { settings: { a: 1 } })
    await execute(ctx, orgUpdateModules, { modules: { chart: false } })
    await execute(ctx, orgUpdateCalendar, { fiscalYearStartMonth: 4, weekStartDay: 0, quarterCalendar: { mode: 'standard' } })
    const o = await getOrg(ctx)
    expect(o).toMatchObject({ name: 'Renamed', timezone: 'America/New_York', fiscalYearStartMonth: 4, weekStartDay: 0 })
    expect(o.branding).toMatchObject({ wordmark: 'Ren', accent: '#d9480f', emailSenderName: 'Ren Team' })
    expect(o.modules).toEqual({ chart: false })
    expect(o.settings).toEqual({ a: 1 })
    expect(o.version).toBe(7)

    await expect(execute(ctx, orgUpdateBranding, { accent: 'red' })).rejects.toMatchObject({ code: 'validation' })
    await expect(execute(ctx, orgUpdateCalendar, { quarterCalendar: { mode: 'custom' } })).rejects.toMatchObject({ code: 'validation' })
    await expect(execute(ctx, orgUpdateGeneral, { timezone: 'Nope/Zone' })).rejects.toMatchObject({ code: 'validation' })
    const member = await addPerson('Mem Ber')
    await expect(execute(member.ctx, orgUpdateBranding, { wordmark: 'x' })).rejects.toMatchObject({ code: 'forbidden' })
    await expect(execute(ctx, orgUpdateBranding, { wordmark: 'x' }, { expectedVersion: 1 })).rejects.toMatchObject({ code: 'conflict' })
  })

  it('sets a validated terminology pack, overrides, and reverts', async () => {
    const { ctx, addAgent } = await seedTestOrg(db)
    expect((await getTerms(ctx)).t('priority', 'plural')).toBe('Priorities')

    await expect(execute(ctx, orgSetTerminologyPack, { pack: { id: 'x', terms: { nope: {} } } })).rejects.toMatchObject({ code: 'validation' })
    await execute(ctx, orgSetTerminologyPack, { pack: eosPack })
    let terms = await getTerms(ctx)
    expect(terms.t('priority', 'plural')).toBe('Rocks')
    expect(terms.t('vision_plan', 'short')).toBe('V/TO')
    expect(terms.t('milestone')).toBe(STANDARD_PACK.terms.milestone!.singular) // falls back to Standard
    expect(terms.attribution).toContain('EOS')

    await execute(ctx, orgSetTerminologyOverrides, { overrides: { priority: { plural: 'Bets' } } })
    terms = await getTerms(ctx)
    expect(terms.t('priority', 'plural')).toBe('Bets')
    expect(terms.t('priority')).toBe('Rock')
    await expect(execute(ctx, orgSetTerminologyOverrides, { overrides: { bogus: { plural: 'x' } } as never })).rejects.toMatchObject({ code: 'validation' })

    await execute(ctx, orgSetTerminologyPack, { pack: null })
    expect((await getTerms(ctx)).t('priority', 'plural')).toBe('Bets') // overrides survive
    await execute(ctx, orgSetTerminologyPack, { pack: null, revert: true })
    expect((await getOrg(ctx)).terminologyPack?.id).toBe('community.eos') // revert restores the previous pack
  })

  it('terminology apply by an agent needs approval', async () => {
    const { ctx, addAgent } = await seedTestOrg(db)
    const agent = await addAgent('Admin bot', ['read', 'admin'])
    const r = await execute(agent.ctx, orgSetTerminologyPack, { pack: eosPack })
    expect(r.ok).toBe(false)
    expect((await getTerms(ctx)).t('priority', 'plural')).toBe('Priorities')
  })

  it('createTerms works from plain JSON', () => {
    const t = createTerms(eosPack, {})
    expect(t.t('weekly_meeting', 'short')).toBe('Level 10')
    expect(t.status('on_track')).toBe('On track')
  })
})

describe('people', () => {
  it('adds, updates, removes and links accounts by email', async () => {
    const { ctx, org, addPerson } = await seedTestOrg(db)
    const added = await execute(ctx, peopleAdd, { name: 'Pat Invitee', email: 'Pat@Example.com', role: 'member' })
    if (!added.ok) throw new Error('x')
    expect(added.data).toMatchObject({ email: 'pat@example.com', userId: null })
    await expect(execute(ctx, peopleAdd, { name: 'Pat Again', email: 'pat@example.com' })).rejects.toMatchObject({ code: 'conflict' })

    // The token is shown once; only its hash is stored and it never leaks through reads.
    const token = added.data.inviteToken
    expect(token.length).toBeGreaterThan(30)
    expect(JSON.stringify(await listPeople(ctx))).not.toContain(token)
    expect(Object.keys(await getPerson(ctx, added.data.id))).not.toContain('inviteTokenHash')

    // Signing up with the invited address does NOT grant access.
    const uid = newId()
    await db.insert(user).values({ id: uid, name: 'Pat', email: 'pat@example.com', emailVerified: true })
    expect((await getPerson(ctx, added.data.id)).userId).toBeNull()
    expect(await ctxForUser(db, { id: org.id }, uid)).toBeNull()

    // Only the token links the account; it is single use.
    expect(await getInvite(db, token)).toMatchObject({ orgSlug: org.slug, email: 'pat@example.com' })
    expect(await getInvite(db, 'nope')).toBeNull()
    await expect(acceptInvite(db, 'nope', uid)).rejects.toMatchObject({ code: 'not_found' })
    expect(await acceptInvite(db, token, uid)).toMatchObject({ orgId: org.id, personId: added.data.id })
    expect((await getPerson(ctx, added.data.id)).userId).toBe(uid)
    expect((await ctxForUser(db, { id: org.id }, uid))!.role).toBe('member')
    const other = newId()
    await db.insert(user).values({ id: other, name: 'Eve', email: 'eve@example.com', emailVerified: true })
    await expect(acceptInvite(db, token, other)).rejects.toMatchObject({ code: 'not_found' })
    await expect(execute(ctx, peopleCreateInvite, { personId: added.data.id })).rejects.toMatchObject({ code: 'conflict' })

    // Adding someone who already has an account does not link them either.
    const again = await execute(ctx, peopleAdd, { name: 'Pat Two', email: 'pat@example.com' }).catch((e) => e)
    expect(again.code).toBe('conflict')

    await execute(ctx, peopleUpdateRole, { personId: added.data.id, role: 'admin' })
    expect((await getPerson(ctx, added.data.id)).role).toBe('admin')
    const self = await addPerson('Self Edit')
    await execute(self.ctx, peopleUpdate, { personId: self.personId, name: 'Self Edited' })
    await expect(execute(self.ctx, peopleUpdate, { personId: added.data.id, name: 'Hax' })).rejects.toMatchObject({ code: 'forbidden' })

    await execute(ctx, peopleRemove, { personId: added.data.id })
    expect((await listPeople(ctx)).map((p) => p.id)).not.toContain(added.data.id)
    // Re-adding a removed person restores them.
    const back = await execute(ctx, peopleAdd, { name: 'Pat Back', email: 'pat@example.com' })
    expect(back.ok && back.data.id === added.data.id && back.data.deletedAt === null && back.data.userId === null).toBe(true)
    expect((await db.select().from(people).where(eq(people.id, added.data.id)))[0]!.name).toBe('Pat Back')
  })

  it('invite links expire, can be reissued and are bound to a pending person', async () => {
    const { ctx, org } = await seedTestOrg(db)
    const added = await execute(ctx, peopleAdd, { name: 'Dana', email: 'dana@example.com' })
    if (!added.ok) throw new Error('x')
    const uid = newId()
    await db.insert(user).values({ id: uid, name: 'Dana', email: 'dana@example.com', emailVerified: false })
    await db.update(people).set({ inviteExpiresAt: new Date(Date.now() - 1000) }).where(eq(people.id, added.data.id))
    await expect(acceptInvite(db, added.data.inviteToken, uid)).rejects.toMatchObject({ code: 'not_found' })
    const re = await execute(ctx, peopleCreateInvite, { personId: added.data.id })
    if (!re.ok) throw new Error('x')
    await expect(acceptInvite(db, added.data.inviteToken, uid)).rejects.toMatchObject({ code: 'not_found' })
    expect((await acceptInvite(db, re.data.inviteToken, uid)).orgId).toBe(org.id)
    // A different org's admin cannot reissue links for this org's people.
    const { ctx: ctx2 } = await seedTestOrg(db)
    await expect(execute(ctx2, peopleCreateInvite, { personId: added.data.id })).rejects.toMatchObject({ code: 'not_found' })
  })

  it('protects the last owner and owner promotions', async () => {
    const { ctx, addPerson } = await seedTestOrg(db)
    await expect(execute(ctx, peopleUpdateRole, { personId: ctx.actor.id, role: 'admin' })).rejects.toMatchObject({ code: 'conflict' })
    await expect(execute(ctx, peopleRemove, { personId: ctx.actor.id })).rejects.toMatchObject({ code: 'conflict' })
    const admin = await addPerson('Ad Min', 'admin')
    await expect(execute(admin.ctx, peopleUpdateRole, { personId: admin.personId, role: 'owner' })).rejects.toMatchObject({ code: 'forbidden' })
    await execute(ctx, peopleUpdateRole, { personId: admin.personId, role: 'owner' })
    await execute(ctx, peopleUpdateRole, { personId: ctx.actor.id, role: 'admin' }) // now allowed: another owner exists
  })

  it('keeps people isolated per org', async () => {
    const a = await seedTestOrg(db)
    const b = await seedTestOrg(db)
    const p = await a.addPerson('Only In A')
    await expect(getPerson(b.ctx, p.personId)).rejects.toMatchObject({ code: 'not_found' })
    await expect(execute(b.ctx, peopleUpdateRole, { personId: p.personId, role: 'viewer' })).rejects.toMatchObject({ code: 'not_found' })
    await expect(execute(b.ctx, peopleRemove, { personId: p.personId })).rejects.toMatchObject({ code: 'not_found' })
  })
})

describe('teams', () => {
  it('supports CRUD and membership', async () => {
    const { ctx, addPerson } = await seedTestOrg(db)
    const p = await addPerson('Tess Team')
    const t = await execute(ctx, teamsCreate, { name: 'Delivery team', leaderId: p.personId, memberIds: [ctx.actor.id] })
    if (!t.ok) throw new Error('x')
    let team = (await listTeams(ctx)).find((x) => x.id === t.data.id)!
    expect(team.members.map((m) => m.name).sort()).toEqual(['Owner', 'Tess Team'])
    expect(team.members.find((m) => m.personId === p.personId)!.role).toBe('lead')

    await execute(ctx, teamsUpdate, { teamId: team.id, name: 'Delivery' })
    const q = await addPerson('Quinn Q')
    await execute(ctx, teamsAddMember, { teamId: team.id, personId: q.personId })
    await execute(ctx, teamsAddMember, { teamId: team.id, personId: q.personId, role: 'lead' })
    team = (await listTeams(ctx)).find((x) => x.id === t.data.id)!
    expect(team.members.find((m) => m.personId === q.personId)!.role).toBe('lead')
    expect((await listTeamsForPerson(ctx, q.personId)).map((x) => x.name)).toEqual(['Delivery'])

    await execute(ctx, teamsRemoveMember, { teamId: team.id, personId: q.personId })
    await execute(ctx, teamsAddMember, { teamId: team.id, personId: q.personId }) // re-add after removal
    expect((await listTeamsForPerson(ctx, q.personId)).map((x) => x.name)).toEqual(['Delivery'])

    await execute(ctx, teamsDelete, { teamId: team.id })
    expect((await listTeams(ctx)).map((x) => x.name)).toEqual(['Leadership team'])
    const lead = (await listTeams(ctx))[0]!
    await expect(execute(ctx, teamsDelete, { teamId: lead.id })).rejects.toMatchObject({ code: 'conflict' })
    await expect(execute(ctx, teamsUpdate, { teamId: lead.id, parentTeamId: lead.id })).rejects.toMatchObject({ code: 'validation' })
  })

  it('refuses people or parents from another org', async () => {
    const a = await seedTestOrg(db)
    const b = await seedTestOrg(db)
    const outsider = await b.addPerson('Out Sider')
    await expect(execute(a.ctx, teamsCreate, { name: 'X', memberIds: [outsider.personId] })).rejects.toMatchObject({ code: 'not_found' })
    const bt = (await listTeams(b.ctx))[0]!
    await expect(execute(a.ctx, teamsCreate, { name: 'Y', parentTeamId: bt.id })).rejects.toMatchObject({ code: 'not_found' })
  })
})

describe('audit list', () => {
  it('filters and paginates', async () => {
    const { ctx, addAgent } = await seedTestOrg(db)
    const agent = await addAgent('Auditor', ['read', 'write:todos'])
    for (let i = 0; i < 5; i++) await execute(ctx, teamsCreate, { name: `T${i}` })
    const all = await listAudit(ctx, { command: 'teams.create', limit: 2 })
    expect(all.items).toHaveLength(2)
    expect(all.nextCursor).toBeTruthy()
    const next = await listAudit(ctx, { command: 'teams.create', limit: 10, cursor: all.nextCursor! })
    expect(next.items).toHaveLength(3)
    expect(next.items.map((e) => e.id)).not.toContain(all.items[0]!.id)
    expect((await listAudit(ctx, { actorType: 'agent' })).items.every((e) => (e.actor as { type: string }).type === 'agent')).toBe(true)
    expect((await listAudit(ctx, { commandPrefix: 'teams.' })).items.length).toBeGreaterThanOrEqual(5)
    expect((await listAudit(ctx, { entityType: 'agent', entityId: agent.agentId })).items[0]!.command).toBe('agents.create')
    expect((await listAudit(ctx, { actorId: ctx.actor.id, since: new Date(Date.now() + 60_000) })).items).toHaveLength(0)
  })
})
