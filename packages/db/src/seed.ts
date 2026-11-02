import { hashPassword } from 'better-auth/crypto'
import { eq } from 'drizzle-orm'
import type { Db } from './client'
import { hashApiKey, newId } from './ids'
import * as s from './schema'
import type { ActorJson } from './types'

export const DEMO_LOGIN = { email: 'demo@motion.local', password: 'motion-demo', name: 'Oscar Hidalgo' } as const
/** Demo-only API key for the seeded "Ops Agent". Never seed a production database. */
export const DEMO_API_KEY = 'mk_live_demo_ops_agent_0000000000000000'

const ANCHOR_MONDAY = '2026-11-02' // the week "now" in the demo data
const at = (iso: string) => new Date(iso)
const addDays = (d: string, n: number) => {
  const t = new Date(d + 'T00:00:00Z')
  t.setUTCDate(t.getUTCDate() + n)
  return t.toISOString().slice(0, 10)
}

/** Deterministic pseudo-random so seeds are reproducible. */
function rng(seed: number) {
  let x = seed
  return () => {
    x = (x * 1664525 + 1013904223) % 4294967296
    return x / 4294967296
  }
}

/** Seed only when there is no org yet (used by the web app on first run). */
export async function seedIfEmpty(db: Db) {
  const any = await db.select({ id: s.orgs.id }).from(s.orgs).limit(1)
  if (any.length) return { created: false as const }
  return seedDemo(db)
}

/** Idempotent: does nothing when the "vindex" org already exists. */
export async function seedDemo(db: Db): Promise<{ created: boolean; orgId: string }> {
  const existing = await db.select({ id: s.orgs.id }).from(s.orgs).where(eq(s.orgs.slug, 'vindex')).limit(1)
  if (existing[0]) return { created: false, orgId: existing[0].id }

  const orgId = newId()
  const passwordHash = await hashPassword(DEMO_LOGIN.password)

  await db.transaction(async (tx) => {
    // ---- Auth user for the owner -------------------------------------------------
    const userId = newId()
    await tx.insert(s.user).values({ id: userId, name: DEMO_LOGIN.name, email: DEMO_LOGIN.email, emailVerified: true })
    await tx.insert(s.account).values({ id: newId(), accountId: userId, providerId: 'credential', userId, password: passwordHash })

    // ---- Org --------------------------------------------------------------------
    const P = { oscar: newId(), maya: newId(), theo: newId(), ines: newId(), sam: newId() }
    const by = (id: string): ActorJson => ({ type: 'person', id })
    const oscarActor = by(P.oscar)
    await tx.insert(s.orgs).values({
      id: orgId,
      name: 'Vindex Consulting',
      slug: 'vindex',
      timezone: 'America/New_York',
      fiscalYearStartMonth: 1,
      quarterCalendar: { mode: 'standard' },
      weekStartDay: 1,
      branding: { wordmark: 'Vindex', accent: '#2f5bea', emailSenderName: 'Vindex Consulting' },
      settings: {},
      terminologyPack: null,
      terminologyOverrides: {},
      modules: {},
      createdByActor: oscarActor,
      updatedByActor: oscarActor,
    })
    const c = { orgId, createdByActor: oscarActor, updatedByActor: oscarActor }

    // ---- People -----------------------------------------------------------------
    await tx.insert(s.people).values([
      { ...c, id: P.oscar, userId, name: 'Oscar Hidalgo', email: DEMO_LOGIN.email, role: 'owner' as const, timezone: 'America/New_York' },
      { ...c, id: P.maya, name: 'Maya Reyes', email: 'maya@vindex.example', role: 'admin' as const },
      { ...c, id: P.theo, name: 'Theo Kim', email: 'theo@vindex.example', role: 'member' as const },
      { ...c, id: P.ines, name: 'Ines Park', email: 'ines@vindex.example', role: 'member' as const },
      { ...c, id: P.sam, name: 'Sam Ortiz', email: 'sam@vindex.example', role: 'member' as const },
    ])

    // ---- Teams ------------------------------------------------------------------
    const T = { lead: newId(), delivery: newId() }
    await tx.insert(s.teams).values([
      { ...c, id: T.lead, name: 'Leadership team', isLeadership: true, leaderId: P.oscar },
      { ...c, id: T.delivery, name: 'Delivery team', isLeadership: false, leaderId: P.sam },
    ])
    await tx.insert(s.teamMembers).values([
      ...[P.oscar, P.maya, P.theo, P.ines, P.sam].map((personId) => ({ ...c, id: newId(), teamId: T.lead, personId, role: personId === P.oscar ? ('lead' as const) : ('member' as const) })),
      ...[P.sam, P.theo, P.ines].map((personId) => ({ ...c, id: newId(), teamId: T.delivery, personId, role: personId === P.sam ? ('lead' as const) : ('member' as const) })),
    ])

    // ---- Agents -----------------------------------------------------------------
    const A = { ops: newId(), notes: newId(), sales: newId() }
    const agentActor = (id: string, onBehalfOf: string): ActorJson => ({ type: 'agent', id, onBehalfOf })
    await tx.insert(s.agents).values([
      { ...c, id: A.ops, name: 'Ops Agent', ownerPersonId: P.oscar, client: 'Claude Code · MCP', scopes: ['read', 'write:todos', 'write:issues', 'write:priorities', 'write:headlines'], lastSeenAt: at('2026-11-02T13:50:00Z') },
      { ...c, id: A.notes, name: 'Notes Agent', ownerPersonId: P.maya, client: 'Meeting notes · MCP', scopes: ['read', 'write:todos', 'write:issues', 'write:meetings', 'propose:vision'], lastSeenAt: at('2026-11-02T13:58:00Z') },
      { ...c, id: A.sales, name: 'Sales Agent', ownerPersonId: P.theo, client: 'HubSpot workflow · API', scopes: ['read', 'write:metrics'], lastSeenAt: at('2026-11-02T12:55:00Z') },
    ])
    await tx.insert(s.apiKeys).values({ ...c, id: newId(), agentId: A.ops, name: 'Demo key', prefix: DEMO_API_KEY.slice(0, 16), keyHash: hashApiKey(DEMO_API_KEY) })

    // ---- Priorities (Q4 2026) ---------------------------------------------------
    type PSeed = { title: string; owner: string; status: 'on_track' | 'off_track' | 'done'; due: string; team?: string; level: 'company' | 'team'; ms: string[]; done: number }
    const PR: PSeed[] = [
      { title: 'Ship the agent MCP server v1', owner: P.oscar, status: 'on_track', due: '2026-12-31', level: 'company', done: 3, ms: ['Data model approved', 'Tool schemas drafted', 'Scoped agent tokens', 'Audit log for agent writes', 'Public beta with two teams'] },
      { title: 'Launch the partner portal', owner: P.maya, status: 'on_track', due: '2026-12-15', level: 'company', done: 3, ms: ['Partner agreement template', 'Portal design signed off', 'Referral tracking live', 'Launch to first five partners'] },
      { title: 'Close four enterprise pilots', owner: P.theo, status: 'off_track', due: '2026-12-31', level: 'company', done: 1, ms: ['Pilot criteria agreed', 'Security review packet', 'Two pilots signed', 'Four pilots signed'] },
      { title: 'Hire a head of delivery', owner: P.ines, status: 'on_track', due: '2026-11-30', level: 'company', done: 2, ms: ['Role scorecard written', 'Shortlist of five interviewed', 'Offer accepted'] },
      { title: 'Cut onboarding to seven days', owner: P.sam, status: 'off_track', due: '2026-12-31', level: 'company', done: 0, ms: ['Map the current onboarding steps', 'Automate account setup', 'Run two clients through the new flow'] },
      { title: 'SOC 2 Type I readiness', owner: P.ines, status: 'done', due: '2026-10-31', level: 'company', done: 4, ms: ['Choose the audit platform', 'Policies approved', 'Evidence collection complete', 'Auditor readiness call'] },
      { title: 'Standardize the delivery playbook', owner: P.sam, status: 'on_track', due: '2026-12-15', level: 'team', team: T.delivery, done: 2, ms: ['Inventory current playbooks', 'Draft the standard kickoff', 'Pilot on two projects', 'Publish v1'] },
      { title: 'Ninety percent on-time milestones', owner: P.theo, status: 'on_track', due: '2026-12-31', level: 'team', team: T.delivery, done: 1, ms: ['Define on-time', 'Weekly milestone review', 'Hit 90% for four weeks'] },
    ]
    const priorityIds: Record<string, string> = {}
    const priorityRows: (typeof s.priorities.$inferInsert)[] = []
    const milestoneRows: (typeof s.milestones.$inferInsert)[] = []
    PR.forEach((p, i) => {
      const id = newId()
      priorityIds[p.title] = id
      priorityRows.push({ ...c, id, title: p.title, ownerId: p.owner, teamId: p.team ?? T.lead, quarter: '2026-Q4', dueDate: p.due, level: p.level, status: p.status, sort: i })
      p.ms.forEach((m, j) =>
        milestoneRows.push({ ...c, id: newId(), priorityId: id, title: m, sort: j, dueDate: addDays('2026-10-15', j * 20), doneAt: j < p.done ? at(`2026-10-${10 + j * 5}T15:00:00Z`) : null }),
      )
    })
    await tx.insert(s.priorities).values(priorityRows)
    await tx.insert(s.milestones).values(milestoneRows)

    // ---- Scorecard (Leadership team, weekly, 13 weeks) --------------------------
    const SC = newId()
    await tx.insert(s.scorecards).values({ ...c, id: SC, teamId: T.lead, interval: 'week', weekStartDay: 1, periodsShown: 13 })
    type MSeed = { title: string; owner: string; cmp: 'gte' | 'lte'; goal: number; unit: 'number' | 'percent' | 'currency'; scale: number; last5: (number | null)[]; base: number; spread: number; additive: boolean }
    const MS: MSeed[] = [
      { title: 'Qualified leads', owner: P.oscar, cmp: 'gte', goal: 10, unit: 'number', scale: 1, last5: [12, 9, 11, 14, null], base: 11, spread: 4, additive: true },
      { title: 'Revenue booked', owner: P.theo, cmp: 'gte', goal: 40000, unit: 'currency', scale: 1000, last5: [46000, 38000, 52000, 41000, 44000], base: 42000, spread: 12000, additive: true },
      { title: 'Projects on schedule', owner: P.sam, cmp: 'gte', goal: 90, unit: 'percent', scale: 1, last5: [92, 88, 95, 91, 93], base: 91, spread: 6, additive: false },
      { title: 'Client NPS', owner: P.ines, cmp: 'gte', goal: 50, unit: 'number', scale: 1, last5: [54, 61, 48, 57, 59], base: 54, spread: 10, additive: false },
      { title: 'Days to onboard', owner: P.sam, cmp: 'lte', goal: 7, unit: 'number', scale: 1, last5: [11, 9, 10, 8, 9], base: 10, spread: 3, additive: false },
    ]
    const rand = rng(42)
    const metricRows: (typeof s.metrics.$inferInsert)[] = []
    const valueRows: (typeof s.metricValues.$inferInsert)[] = []
    MS.forEach((m, i) => {
      const id = newId()
      metricRows.push({ ...c, id, scorecardId: SC, title: m.title, ownerIds: [m.owner], comparison: m.cmp, goal: m.goal, unit: m.unit, scale: m.scale, decimals: 0, additive: m.additive, sort: i })
      for (let w = 0; w < 13; w++) {
        const periodStart = addDays(ANCHOR_MONDAY, -7 * (12 - w))
        const fromEnd = 12 - w
        let value: number | null
        if (fromEnd < 5) value = m.last5[4 - fromEnd]!
        else value = Math.round(m.base + (rand() - 0.5) * 2 * m.spread)
        if (value === null) continue // missing this week
        const byAgent = m.title === 'Qualified leads' && fromEnd === 1
        valueRows.push({ ...c, id: newId(), metricId: id, periodStart, value, enteredByActor: byAgent ? agentActor(A.sales, P.theo) : by(m.owner) })
      }
    })
    await tx.insert(s.metrics).values(metricRows)
    await tx.insert(s.metricValues).values(valueRows)

    // ---- Issues -----------------------------------------------------------------
    const issueSeeds: Omit<typeof s.issues.$inferInsert, 'id' | 'orgId'>[] = [
      { title: 'Partner onboarding takes three weeks', description: 'Pilots stall in week two waiting on security review and SSO setup.', ownerId: P.theo, horizon: 'short', rank: 1, source: { type: 'priority', id: priorityIds['Close four enterprise pilots']! } },
      { title: 'Renewal pricing for legacy clients', ownerId: P.maya, horizon: 'short', rank: 2 },
      { title: 'Delivery team is short one senior PM', ownerId: P.sam, horizon: 'short', rank: 3, teamId: T.delivery, source: { type: 'priority', id: priorityIds['Hire a head of delivery']! } },
      { title: 'SSO setup blocks enterprise pilots', ownerId: P.ines, horizon: 'short', rank: 4 },
      { title: 'Scorecard data is entered by hand every Monday', ownerId: P.maya, horizon: 'short', rank: 5 },
      { title: 'No owner for partner referral follow-up', ownerId: P.theo, horizon: 'short', rank: 6 },
      { title: 'Enter the UK market in 2028 or 2029?', ownerId: P.oscar, horizon: 'long', rank: 1 },
      { title: 'Build or partner for payroll features', ownerId: P.oscar, horizon: 'long', rank: 2 },
      { title: 'Q3 invoicing backlog', ownerId: P.ines, horizon: 'short', rank: 7, status: 'solved', solvedAt: at('2026-10-26T15:30:00Z') },
    ]
    const issueRows = issueSeeds.map((i) => ({ ...c, id: newId(), teamId: T.lead, ...i }))
    await tx.insert(s.issues).values(issueRows)

    // ---- To-dos -----------------------------------------------------------------
    const todo = (title: string, ownerId: string, due: string | null, extra: Partial<typeof s.todos.$inferInsert> = {}) => ({ ...c, id: newId(), title, ownerId, teamId: T.lead as string | null, dueDate: due, ...extra })
    await tx.insert(s.todos).values([
      todo('Review the MCP tool schemas with Maya', P.oscar, '2026-11-06'),
      todo('Send the partner agreement to legal', P.oscar, '2026-11-09'),
      todo('Approve Q4 hiring budget', P.oscar, '2026-11-09'),
      todo('Record a 3-minute demo for the beta list', P.oscar, '2026-11-13'),
      todo('Draft the seven-day partner onboarding checklist', P.maya, '2026-11-10', { createdByActor: agentActor(A.notes, P.maya), source: { type: 'issue', id: issueRows[0]!.id! } }),
      todo('Book security review for pilot two', P.theo, '2026-11-05', { source: { type: 'priority', id: priorityIds['Close four enterprise pilots']! } }),
      todo('Share SOC 2 report with top five clients', P.ines, '2026-11-12'),
      todo('Interview finalist for head of delivery', P.ines, '2026-11-06'),
      todo('Write up the delivery kickoff template', P.sam, '2026-11-13', { teamId: T.delivery }),
      todo('Update the pricing sheet', P.theo, '2026-10-30', { status: 'done', doneAt: at('2026-10-29T17:00:00Z') }),
      todo('Renew the project tooling licenses', P.maya, '2026-11-20', { teamId: null }),
    ])

    // ---- Headlines --------------------------------------------------------------
    await tx.insert(s.headlines).values([
      { ...c, id: newId(), text: 'Northwind signed the pilot agreement and starts Monday', kind: 'customer' as const, ownerId: P.theo, teamId: T.lead },
      { ...c, id: newId(), text: 'SOC 2 Type I readiness complete, auditor call booked', kind: 'general' as const, ownerId: P.ines, teamId: T.lead },
      { ...c, id: newId(), text: 'Sam is back from leave and leading the delivery playbook', kind: 'employee' as const, ownerId: P.maya, teamId: T.lead },
      { ...c, id: newId(), text: 'A client asked whether agents can update their own scorecard', kind: 'customer' as const, ownerId: P.maya, teamId: T.lead, reviewedAt: at('2026-10-26T15:12:00Z') },
    ])

    // ---- Meetings ---------------------------------------------------------------
    const agenda = [
      { term: 'check_in', minutes: 5 }, { term: 'metric_review', minutes: 5 }, { term: 'priority_review', minutes: 5 },
      { term: 'headline_review', minutes: 5 }, { term: 'todo_review', minutes: 5 }, { term: 'issue_solving', minutes: 60 }, { term: 'wrap_up', minutes: 5 },
    ]
    const SER = newId()
    await tx.insert(s.meetingSeries).values({
      ...c, id: SER, teamId: T.lead, name: 'Leadership weekly', templateKey: 'weekly', agenda, rrule: 'FREQ=WEEKLY;BYDAY=MO', startTime: '09:00', durationMinutes: 90,
      attendeeIds: [P.oscar, P.maya, P.theo, P.ines, P.sam], facilitatorId: P.maya, scribeActor: { type: 'agent', id: A.notes, onBehalfOf: P.maya },
    })
    await tx.insert(s.meetings).values([
      {
        ...c, id: newId(), seriesId: SER, scheduledAt: at('2026-10-26T13:00:00Z'), startedAt: at('2026-10-26T13:02:00Z'), endedAt: at('2026-10-26T14:28:00Z'),
        state: { sectionIndex: 6, focusIssueIds: [] },
        ratings: { [P.oscar]: 9, [P.maya]: 8, [P.theo]: 8, [P.ines]: 9, [P.sam]: 7 },
        summary: 'Solved the Q3 invoicing backlog. Agreed to run security review and SSO setup in parallel for pilots. Three to-dos assigned.',
        recapSentAt: at('2026-10-26T14:35:00Z'),
      },
      { ...c, id: newId(), seriesId: SER, scheduledAt: at('2026-11-02T14:00:00Z'), state: {}, ratings: {} },
    ])

    // ---- Vision plan ------------------------------------------------------------
    const VP = newId()
    await tx.insert(s.visionPlans).values({ ...c, id: VP, scope: 'company' })
    const content = {
      sections: {
        coreValues: ['Own the outcome', 'Clients first', 'Leave it better'],
        coreFocus: { purpose: 'Help growing companies run with clarity', niche: 'Operating rhythm for 20–250 person firms' },
        longRangeTarget: { date: '2036-12-31', text: '1,000 companies running on our rhythm' },
        marketing: {
          targetMarket: 'Founder-led firms with 20–250 people',
          uniques: ['Agent-first', 'Fits your own vocabulary', 'Open source'],
          provenProcess: 'Consult, pilot, roll out',
          guarantee: '',
        },
        threeYear: {
          date: '2029-12-31',
          revenue: '$12M',
          profit: '20%',
          measurables: [{ name: 'Clients', value: '240' }],
          goals: [],
        },
        oneYear: {
          date: '2027-12-31',
          revenue: '$4.2M',
          profit: '14%',
          measurables: [],
          goals: [{ text: 'Launch Motion Cloud for 50 paying teams' }, { text: 'Two certified implementation partners' }, { text: 'Net revenue retention above 110%' }],
        },
        longTermIssueIds: issueRows.filter((i) => i.horizon === 'long').map((i) => i.id),
      },
    }
    const vr = (number: number, status: 'archived' | 'published', publishedAt: string) => ({ ...c, id: newId(), planId: VP, number, status, content, publishedAt: at(publishedAt), publishedBy: oscarActor })
    await tx.insert(s.visionRevisions).values([vr(1, 'archived', '2026-01-10T15:00:00Z'), vr(2, 'archived', '2026-04-05T15:00:00Z'), vr(3, 'archived', '2026-07-12T15:00:00Z'), vr(4, 'published', '2026-10-30T15:00:00Z')])

    // ---- Accountability chart ---------------------------------------------------
    const CH = newId()
    const CR = newId()
    await tx.insert(s.charts).values({ ...c, id: CH })
    await tx.insert(s.chartRevisions).values({ ...c, id: CR, chartId: CH, number: 3, status: 'published', publishedAt: at('2026-11-01T15:00:00Z'), publishedBy: oscarActor })
    const SEAT = { ceo: newId(), coo: newId(), sales: newId(), delivery: newId(), finance: newId() }
    const seat = (id: string, title: string, parent: string | null, sort: number, responsibilities: string[], personIds: string[], extra: Partial<typeof s.seats.$inferInsert> = {}) => ({ ...c, id, chartRevisionId: CR, title, parentSeatId: parent, sort, responsibilities, personIds, ...extra })
    await tx.insert(s.seats).values([
      seat(SEAT.ceo, 'CEO', null, 0, ['Vision and culture', 'Key relationships', 'New ideas'], [P.oscar]),
      seat(SEAT.coo, 'President & COO', SEAT.ceo, 0, ['Run the leadership team', 'Execute the plan', 'Hold people accountable'], [P.maya]),
      seat(SEAT.sales, 'Sales & marketing', SEAT.coo, 0, ['Pipeline and close rate', 'Brand and messaging'], [P.theo]),
      seat(SEAT.delivery, 'Delivery', SEAT.coo, 1, ['Client outcomes', 'Project margins'], [], { teamId: T.delivery, linkedPriorityId: priorityIds['Hire a head of delivery']! }),
      seat(SEAT.finance, 'Finance & operations', SEAT.coo, 2, ['Cash and reporting', 'Tools and vendors'], [P.ines], { assistingAgentIds: [A.ops] }),
    ])

    // ---- Approvals --------------------------------------------------------------
    const AP = newId()
    await tx.insert(s.approvals).values({
      ...c, id: AP, createdByActor: agentActor(A.notes, P.maya), requestedByActor: agentActor(A.notes, P.maya),
      action: 'vision.propose_change',
      payload: { section: 'one_year_plan', op: 'add_goal', text: 'Win three partner referrals a quarter', source: 'Nov 2 weekly meeting' },
      summary: 'Vision plan, 1-year plan: add goal "Win three partner referrals a quarter"',
      status: 'pending',
    })

    // ---- Audit events -----------------------------------------------------------
    const ev = (actor: ActorJson, onBehalfOf: string | null, command: string, entityType: string, entityId: string, diff: Record<string, unknown>, when: string, requestId?: string) => ({
      id: newId(), orgId, actor, onBehalfOf, command, entityType, entityId, diff, requestId: requestId ?? null, at: at(when),
    })
    const auditId = milestoneRows.find((m) => m.title === 'Audit log for agent writes')!.id!
    await tx.insert(s.auditEvents).values([
      ev(oscarActor, null, 'org.create', 'org', orgId, { after: { name: 'Vindex Consulting' } }, '2026-09-01T14:00:00Z'),
      ev(oscarActor, null, 'priority.set_status', 'priority', priorityIds['Ship the agent MCP server v1']!, { before: { status: 'off_track' }, after: { status: 'on_track' } }, '2026-10-26T13:40:00Z'),
      ev(agentActor(A.notes, P.maya), P.maya, 'todo.create', 'todo', newId(), { after: { title: 'Draft the seven-day partner onboarding checklist' } }, '2026-10-26T13:55:00Z', 'notes-0001'),
      ev(agentActor(A.sales, P.theo), P.theo, 'metric.record_values', 'metric', metricRows[0]!.id!, { after: { periodStart: addDays(ANCHOR_MONDAY, -7), value: 14 } }, '2026-10-26T12:30:00Z', 'hubspot-1026'),
      ev(agentActor(A.ops, P.oscar), P.oscar, 'milestone.toggle', 'milestone', auditId, { before: { doneAt: null }, after: { doneAt: '2026-10-30T16:20:00Z' }, milestoneTitle: 'Audit log for agent writes', priorityId: priorityIds['Ship the agent MCP server v1']! }, '2026-10-30T16:20:00Z', 'ops-0042'),
      ev(oscarActor, null, 'vision.publish', 'vision_revision', VP, { after: { number: 4 } }, '2026-10-30T15:00:00Z'),
      ev(oscarActor, null, 'chart.publish', 'chart_revision', CR, { after: { number: 3 } }, '2026-11-01T15:00:00Z'),
      ev(agentActor(A.notes, P.maya), P.maya, 'vision.propose_change', 'approval', AP, { after: { status: 'pending' } }, '2026-11-02T13:58:00Z', 'notes-0107'),
    ])
  })

  return { created: true, orgId }
}
