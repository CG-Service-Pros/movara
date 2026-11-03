import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { DbHandle } from '@motion/db'
import {
  agentsCreate, execute, getCommand, headlinePost, issueCreate, listCommands, listTeams, metricCreate, milestoneAdd, orgSetTerminologyOverrides, orgSetTerminologyPack,
  orgUpdateBranding, orgUpdateCalendar, orgUpdateGeneral, orgUpdateModules, peopleAdd, peopleCreateInvite, peopleRemove, peopleUpdate, peopleUpdateRole, priorityCreate, scorecardCreate,
  teamsCreate, todoCreate, todoUpdate, issueUpdate, priorityUpdate, headlineDelete, metricUpdate, milestoneToggle, milestoneDelete, priorityDelete, todoDelete,
} from '../src'
import { createTestDb, seedTestOrg } from '../src/testing'

let db: DbHandle
beforeAll(async () => { db = await createTestDb() })
afterAll(async () => { await db.$close() })

const ok = <T>(r: { ok: boolean; data?: T }) => {
  if (!r.ok) throw new Error('unexpected approval')
  return r.data as T
}

describe('role enforcement lives in the runner', () => {
  it('viewers cannot run any member-level command; members cannot run admin commands', async () => {
    const t = await seedTestOrg(db)
    const viewer = await t.addPerson('Vi Ewer', 'viewer')
    const member = await t.addPerson('Mem Ber', 'member')
    const team = (await listTeams(t.ctx))[0]!

    await expect(execute(viewer.ctx, todoCreate, { title: 'nope' })).rejects.toMatchObject({ code: 'forbidden' })
    await expect(execute(viewer.ctx, issueCreate, { title: 'nope', teamId: team.id })).rejects.toMatchObject({ code: 'forbidden' })
    await expect(execute(viewer.ctx, teamsCreate, { name: 'nope' })).rejects.toMatchObject({ code: 'forbidden' })

    const adminCalls: [string, () => Promise<unknown>][] = [
      ['org.update_general', () => execute(member.ctx, orgUpdateGeneral, { name: 'Hijack' })],
      ['org.update_branding', () => execute(member.ctx, orgUpdateBranding, { wordmark: 'Hijack' })],
      ['org.update_modules', () => execute(member.ctx, orgUpdateModules, { modules: { vision: false } })],
      ['org.update_calendar', () => execute(member.ctx, orgUpdateCalendar, { weekStartDay: 3 })],
      ['org.set_terminology_pack', () => execute(member.ctx, orgSetTerminologyPack, { pack: null })],
      ['org.set_terminology_overrides', () => execute(member.ctx, orgSetTerminologyOverrides, { overrides: {} })],
      ['people.add', () => execute(member.ctx, peopleAdd, { name: 'X', email: 'x@example.com', role: 'member' })],
      ['people.create_invite', () => execute(member.ctx, peopleCreateInvite, { personId: viewer.personId })],
      ['people.update_role', () => execute(member.ctx, peopleUpdateRole, { personId: member.personId, role: 'owner' })],
      ['people.remove', () => execute(member.ctx, peopleRemove, { personId: viewer.personId })],
      ['teams.create', () => execute(member.ctx, teamsCreate, { name: 'Nope' })],
      ['people.update(other)', () => execute(member.ctx, peopleUpdate, { personId: viewer.personId, name: 'Hax' })],
    ]
    for (const [name, call] of adminCalls) await expect(call(), name).rejects.toMatchObject({ code: 'forbidden' })
    // Viewers cannot even create agents.
    await expect(execute(viewer.ctx, agentsCreate, { name: 'A' })).rejects.toMatchObject({ code: 'forbidden' })
  })

  it('every org/people-admin/teams command declares minRole admin', () => {
    const must = listCommands().filter((n) => n.startsWith('org.') || n.startsWith('teams.') || ['people.add', 'people.update_role', 'people.remove'].includes(n))
    expect(must.length).toBeGreaterThan(8)
    for (const n of must) expect(getCommand(n)!.minRole, n).toBe('admin')
    // Nothing is writable by viewers.
    for (const n of listCommands()) expect(getCommand(n)!.minRole ?? 'member', n).not.toBe('viewer')
  })
})

describe('branding images', () => {
  it('accepts https URLs and png/jpeg/webp/svg data URLs only', async () => {
    const t = await seedTestOrg(db)
    const png = 'data:image/png;base64,iVBORw0KGgo='
    ok(await execute(t.ctx, orgUpdateBranding, { logoLight: png, logoDark: 'https://example.com/logo.svg', favicon: 'data:image/svg+xml;base64,PHN2Zy8+' }))
    for (const bad of ['javascript:alert(1)', 'http://example.com/a.png', 'data:text/html;base64,PHNjcmlwdD4=', 'data:image/gif;base64,R0lGOD==', 'data:image/svg+xml,<svg onload=alert(1)>', 'ftp://x/y.png', '//evil/x.png']) {
      await expect(execute(t.ctx, orgUpdateBranding, { logoLight: bad }), bad).rejects.toMatchObject({ code: 'validation' })
    }
    const huge = 'data:image/png;base64,' + 'A'.repeat(300_000)
    await expect(execute(t.ctx, orgUpdateBranding, { logoLight: huge })).rejects.toMatchObject({ code: 'validation' })
  })
})

describe('entity ids from the client are resolved inside the org', () => {
  it('rejects writes against another org\'s records (not_found) and leaves them untouched', async () => {
    const a = await seedTestOrg(db)
    const b = await seedTestOrg(db)
    const team = (await listTeams(a.ctx))[0]!
    const [todo] = ok(await execute(a.ctx, todoCreate, { title: 'A todo' }))
    const [issue] = ok(await execute(a.ctx, issueCreate, { title: 'A issue', teamId: team.id }))
    const [headline] = ok(await execute(a.ctx, headlinePost, { text: 'A headline', kind: 'general', teamId: team.id }))
    const pr = ok(await execute(a.ctx, priorityCreate, { title: 'A priority', quarter: '2026-Q4', level: 'individual' }))
    const ms = ok(await execute(a.ctx, milestoneAdd, { priorityId: pr.id, title: 'A milestone' }))
    const sc = ok(await execute(a.ctx, scorecardCreate, { teamId: team.id }))
    const metric = ok(await execute(a.ctx, metricCreate, { scorecardId: sc.id, title: 'A metric', comparison: 'gte', goal: 1 }))

    const attempts: [string, () => Promise<unknown>][] = [
      ['todo.update', () => execute(b.ctx, todoUpdate, { todoId: todo!.id, title: 'x' })],
      ['todo.delete', () => execute(b.ctx, todoDelete, { todoId: todo!.id })],
      ['issue.update', () => execute(b.ctx, issueUpdate, { issueId: issue!.id, title: 'x' })],
      ['headline.delete', () => execute(b.ctx, headlineDelete, { headlineId: headline!.id })],
      ['priority.update', () => execute(b.ctx, priorityUpdate, { priorityId: pr.id, title: 'x' })],
      ['priority.delete', () => execute(b.ctx, priorityDelete, { priorityId: pr.id })],
      ['milestone.toggle', () => execute(b.ctx, milestoneToggle, { milestoneId: ms.id, done: true })],
      ['milestone.delete', () => execute(b.ctx, milestoneDelete, { milestoneId: ms.id })],
      ['metric.update', () => execute(b.ctx, metricUpdate, { metricId: metric.id, title: 'x' })],
      ['todo.create(foreign owner)', () => execute(b.ctx, todoCreate, { title: 'x', ownerIds: [a.ctx.actor.id] })],
      ['issue.create(foreign team)', () => execute(b.ctx, issueCreate, { title: 'x', teamId: team.id })],
    ]
    for (const [name, call] of attempts) await expect(call(), name).rejects.toMatchObject({ code: expect.stringMatching(/not_found|validation/) })
  })
})
