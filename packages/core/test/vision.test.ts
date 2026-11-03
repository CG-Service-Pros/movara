import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { approvals, newId, people, seedDemo, type DbHandle } from '@movara/db'
import {
  approveApproval, ctxForPerson, declineApproval, execute, getVision, getVisionRevision, listApprovals, listVisionRevisions, sectionsOf,
  visionCreateDraft, visionDiscardDraft, visionProposeChange, visionPublish, visionUpdateDraft,
} from '../src'
import { createTestDb, seedTestOrg } from '../src/testing'

let db: DbHandle
beforeAll(async () => { db = await createTestDb() })
afterAll(async () => { await db.$close() })

const ok = <T>(r: { ok: boolean; data?: T }) => {
  if (!r.ok) throw new Error('unexpected approval')
  return r.data as T
}

const SECTIONS = {
  coreValues: ['Own it', 'Clients first'],
  coreFocus: { purpose: 'Clarity', niche: 'Small firms' },
  longRangeTarget: { text: '1,000 companies', date: '2036-12-31' },
  marketing: { targetMarket: 'Founders', uniques: ['Agent-first'], provenProcess: 'Pilot', guarantee: 'Money back' },
  threeYear: { date: '2029-12-31', revenue: '$12M', profit: '20%', measurables: [{ name: 'Clients', value: '240' }], goals: [{ text: 'Open UK office' }] },
  oneYear: { date: '2027-12-31', revenue: '$4M', profit: '10%', measurables: [], goals: [{ text: 'Launch cloud' }] },
  quarterly: { quarter: '2026-Q4', revenue: '$1M', profit: '10%', priorityIds: [newId()] },
  longTermIssueIds: [newId()],
}

async function published(t: Awaited<ReturnType<typeof seedTestOrg>>) {
  const { revision } = ok(await execute(t.ctx, visionCreateDraft, {}))
  await execute(t.ctx, visionUpdateDraft, { revisionId: revision.id, sections: SECTIONS })
  return ok(await execute(t.ctx, visionPublish, { revisionId: revision.id }))
}

describe('vision', () => {
  it('starts empty, drafts, edits typed sections, publishes and keeps history', async () => {
    const t = await seedTestOrg(db)
    expect(await getVision(t.ctx)).toEqual({ plan: null, published: null, draft: null })
    const d = ok(await execute(t.ctx, visionCreateDraft, {}))
    expect(d).toMatchObject({ created: true, revision: { number: 1, status: 'draft' } })
    expect(ok(await execute(t.ctx, visionCreateDraft, {})).created).toBe(false)
    await execute(t.ctx, visionUpdateDraft, { revisionId: d.revision.id, sections: SECTIONS })
    expect(sectionsOf((await getVision(t.ctx)).draft!)).toMatchObject({ coreValues: ['Own it', 'Clients first'], oneYear: { goals: [{ text: 'Launch cloud' }] } })
    const pub = ok(await execute(t.ctx, visionPublish, { revisionId: d.revision.id }))
    expect(pub).toMatchObject({ status: 'published', publishedBy: t.ctx.actor })
    // v2: copy of published, edit one section, publish; v1 is archived
    const d2 = ok(await execute(t.ctx, visionCreateDraft, {}))
    expect(d2.revision.number).toBe(2)
    expect(sectionsOf(d2.revision).coreFocus).toEqual(SECTIONS.coreFocus)
    await execute(t.ctx, visionUpdateDraft, { revisionId: d2.revision.id, sections: { coreValues: ['Only one'] } })
    ok(await execute(t.ctx, visionPublish, { revisionId: d2.revision.id }))
    const hist = await listVisionRevisions(t.ctx)
    expect(hist.map((r) => [r.number, r.status])).toEqual([[2, 'published'], [1, 'archived']])
    const v = await getVision(t.ctx)
    expect(v.published!.number).toBe(2)
    expect(sectionsOf(v.published!).coreFocus).toEqual(SECTIONS.coreFocus)
    // published revisions are immutable
    await expect(execute(t.ctx, visionUpdateDraft, { revisionId: d2.revision.id, sections: { coreValues: ['x'] } })).rejects.toMatchObject({ code: 'conflict' })
    await expect(execute(t.ctx, visionPublish, { revisionId: d2.revision.id })).rejects.toMatchObject({ code: 'conflict' })
    expect((await getVisionRevision(t.ctx, d.revision.id)).status).toBe('archived')
  })

  it('validates section content and can discard drafts', async () => {
    const t = await seedTestOrg(db)
    const d = ok(await execute(t.ctx, visionCreateDraft, {}))
    await expect(execute(t.ctx, visionUpdateDraft, { revisionId: d.revision.id, sections: { quarterly: { quarter: '2026-4' } } as never })).rejects.toMatchObject({ code: 'validation' })
    await expect(execute(t.ctx, visionUpdateDraft, { revisionId: d.revision.id, sections: { coreValues: [''] } })).rejects.toMatchObject({ code: 'validation' })
    await expect(execute(t.ctx, visionUpdateDraft, { revisionId: d.revision.id, sections: { oneYear: { date: 'soon' } } as never })).rejects.toMatchObject({ code: 'validation' })
    await execute(t.ctx, visionDiscardDraft, { revisionId: d.revision.id })
    expect((await getVision(t.ctx)).draft).toBeNull()
    expect(ok(await execute(t.ctx, visionCreateDraft, {})).revision.number).toBe(2)
  })

  it('supports team plans separately from the company plan', async () => {
    const t = await seedTestOrg(db)
    const { listTeams } = await import('../src')
    const team = (await listTeams(t.ctx))[0]!
    await published(t)
    expect((await getVision(t.ctx, { teamId: team.id })).plan).toBeNull()
    const d = ok(await execute(t.ctx, visionCreateDraft, { teamId: team.id }))
    expect(sectionsOf(d.revision)).toEqual({})
    expect((await getVision(t.ctx, { teamId: team.id })).plan).toMatchObject({ scope: 'team', teamId: team.id })
    expect((await getVision(t.ctx)).plan).toMatchObject({ scope: 'company' })
    await expect(execute(t.ctx, visionCreateDraft, { teamId: newId() })).rejects.toMatchObject({ code: 'not_found' })
  })

  it('publish requires admin; agents need approval', async () => {
    const t = await seedTestOrg(db)
    const member = await t.addPerson('Mia', 'member')
    const d = ok(await execute(member.ctx, visionCreateDraft, {}))
    await expect(execute(member.ctx, visionPublish, { revisionId: d.revision.id })).rejects.toMatchObject({ code: 'forbidden' })
    const agent = await t.addAgent('Proposer', ['read', 'propose:vision'])
    const r = await execute(agent.ctx, visionPublish, { revisionId: d.revision.id })
    expect(r.ok).toBe(false)
    expect((await getVision(t.ctx)).published).toBeNull()
    if (!r.ok) await approveApproval(t.ctx, r.approvalId)
    expect((await getVision(t.ctx)).published!.number).toBe(1)
  })

  it('propose_change from an agent: approval, then applied to a new draft and published with provenance', async () => {
    const t = await seedTestOrg(db)
    await published(t)
    const agent = await t.addAgent('Notes', ['read', 'propose:vision'])
    // payload shaped like the seeded pending approval (legacy section key)
    const r = await execute(agent.ctx, visionProposeChange, { section: 'one_year_plan', op: 'add_goal', text: 'Win three partner referrals a quarter', source: 'Nov 2 weekly meeting' })
    expect(r.ok).toBe(false)
    expect((await getVision(t.ctx)).published!.number).toBe(1)
    const pending = (await listApprovals(t.ctx, { status: 'pending' })).items[0]!
    expect(pending).toMatchObject({ action: 'vision.propose_change' })
    expect(pending.summary).toContain('1-year plan')
    await approveApproval(t.ctx, pending.id, 'ok')
    const v = await getVision(t.ctx)
    expect(v.published!.number).toBe(2)
    const goals = sectionsOf(v.published!).oneYear!.goals
    expect(goals.map((g) => g.text)).toEqual(['Launch cloud', 'Win three partner referrals a quarter'])
    expect(goals[1]!.provenance).toMatchObject({ proposedBy: { type: 'agent', id: agent.agentId }, approvalId: pending.id, source: 'Nov 2 weekly meeting', approvedBy: { type: 'person', id: t.ctx.actor.id } })
    expect(goals[0]!.provenance).toBeUndefined()
    expect((await listVisionRevisions(t.ctx)).map((x) => x.status)).toEqual(['published', 'archived'])
  })

  it('a declined proposal changes nothing', async () => {
    const t = await seedTestOrg(db)
    await published(t)
    const agent = await t.addAgent('Notes', ['read', 'propose:vision'])
    const r = await execute(agent.ctx, visionProposeChange, { section: 'coreValues', op: 'add_core_value', text: 'Move fast' })
    if (!r.ok) await declineApproval(t.ctx, r.approvalId)
    expect(sectionsOf((await getVision(t.ctx)).published!).coreValues).toEqual(['Own it', 'Clients first'])
    expect((await listVisionRevisions(t.ctx))).toHaveLength(1)
    const [a] = await db.select().from(approvals).where(eq(approvals.id, (r as { approvalId: string }).approvalId))
    expect(a!.status).toBe('declined')
  })

  it('people can propose into the draft (not published) or publish when admin; all ops work', async () => {
    const t = await seedTestOrg(db)
    await published(t)
    const draft = ok(await execute(t.ctx, visionProposeChange, { section: 'coreValues', op: 'add_core_value', text: 'Move fast' }))
    expect(draft).toMatchObject({ published: false, revision: { status: 'draft', number: 2 } })
    expect(sectionsOf((await getVision(t.ctx)).published!).coreValues).toHaveLength(2)
    ok(await execute(t.ctx, visionProposeChange, { section: 'threeYear', op: 'add_goal', text: 'Profit 20%' }))
    ok(await execute(t.ctx, visionProposeChange, { section: 'coreFocus', op: 'set', value: { purpose: 'New purpose', niche: 'New niche' } }))
    const [issueId] = SECTIONS.longTermIssueIds
    // long-term issue must exist
    await expect(execute(t.ctx, visionProposeChange, { section: 'longTermIssueIds', op: 'add_long_term_issue', issueId: issueId! })).rejects.toMatchObject({ code: 'not_found' })
    const dr = (await getVision(t.ctx)).draft!
    expect(sectionsOf(dr)).toMatchObject({ coreValues: ['Own it', 'Clients first', 'Move fast'], coreFocus: { purpose: 'New purpose' } })
    expect(sectionsOf(dr).threeYear!.goals.map((g) => g.text)).toEqual(['Open UK office', 'Profit 20%'])
    expect(sectionsOf(dr).threeYear!.goals[1]!.provenance!.proposedBy).toEqual(t.ctx.actor)
    // admin publish in the same call builds on the published content
    const pub = ok(await execute(t.ctx, visionProposeChange, { section: 'coreValues', op: 'add_core_value', text: 'Ship', publish: true }))
    expect(pub).toMatchObject({ published: true, revision: { status: 'published' } })
    const member = await t.addPerson('Mia', 'member')
    await expect(execute(member.ctx, visionProposeChange, { section: 'coreValues', op: 'add_core_value', text: 'x', publish: true })).rejects.toMatchObject({ code: 'forbidden' })
  })

  it('validates propose_change input', async () => {
    const t = await seedTestOrg(db)
    await expect(execute(t.ctx, visionProposeChange, { section: 'oneYear', op: 'add_goal' })).rejects.toMatchObject({ code: 'validation' })
    await expect(execute(t.ctx, visionProposeChange, { section: 'coreValues', op: 'add_goal', text: 'x' })).rejects.toMatchObject({ code: 'validation' })
    await expect(execute(t.ctx, visionProposeChange, { section: 'bogus', op: 'set', value: 1 } as never)).rejects.toMatchObject({ code: 'validation' })
    await expect(execute(t.ctx, visionProposeChange, { section: 'quarterly', op: 'set', value: { quarter: 'x' } })).rejects.toMatchObject({ code: 'validation' })
  })

  it('enforces scopes and org isolation', async () => {
    const a = await seedTestOrg(db)
    const b = await seedTestOrg(db)
    const rev = await published(a)
    const reader = await a.addAgent('Reader', ['read'])
    await expect(execute(reader.ctx, visionCreateDraft, {})).rejects.toMatchObject({ code: 'forbidden_scope' })
    await expect(execute(reader.ctx, visionProposeChange, { section: 'coreValues', op: 'add_core_value', text: 'x' })).rejects.toMatchObject({ code: 'forbidden_scope' })
    expect((await getVision(reader.ctx)).published!.id).toBe(rev.id)
    const blind = await a.addAgent('Blind', ['propose:vision'])
    await expect(getVision(blind.ctx)).rejects.toMatchObject({ code: 'forbidden_scope' })
    await expect(getVisionRevision(b.ctx, rev.id)).rejects.toMatchObject({ code: 'not_found' })
    await expect(execute(b.ctx, visionUpdateDraft, { revisionId: rev.id, sections: {} })).rejects.toMatchObject({ code: 'not_found' })
    expect(await getVision(b.ctx)).toEqual({ plan: null, published: null, draft: null })
    expect(await listVisionRevisions(b.ctx)).toEqual([])
  })
})

describe('seeded demo approval', () => {
  it('approving the seeded vision.propose_change publishes v5 with provenance', async () => {
    const d = await createTestDb()
    try {
      const { orgId } = await seedDemo(d)
      const owner = (await d.select().from(people).where(eq(people.orgId, orgId))).find((p) => p.role === 'owner')!
      const ctx = await ctxForPerson(d, orgId, owner.id)
      const before = await getVision(ctx)
      expect(before.published!.number).toBe(4)
      expect(sectionsOf(before.published!).oneYear!.goals).toHaveLength(3)
      const pending = (await listApprovals(ctx, { status: 'pending' })).items.find((a) => a.action === 'vision.propose_change')!
      await approveApproval(ctx, pending.id)
      const after = await getVision(ctx)
      expect(after.published!.number).toBe(5)
      const goals = sectionsOf(after.published!).oneYear!.goals
      expect(goals.at(-1)).toMatchObject({ text: 'Win three partner referrals a quarter', provenance: { proposedBy: { type: 'agent' }, source: 'Nov 2 weekly meeting', approvedBy: { id: owner.id } } })
    } finally {
      await d.$close()
    }
  })
})
