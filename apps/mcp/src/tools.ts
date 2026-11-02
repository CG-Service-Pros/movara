import { z } from 'zod'
import {
  SEARCH_TYPES, chartProposeChange, endMeeting, execute, getApproval, getChart, getIssue, getMeeting, getPriority,
  getVision, headlineCascade, headlinePost, idsFocus, idsResolve, idsStart, issueCreate, issueMove, issueReopen, issueSolve, listApprovals,
  listIssues, listMeetings, listPriorities, listScorecards, listTodos, meetingCapture, meetingNextSection, meetingRate, meetingStart,
  metricCreate, metricRecordValues, milestoneAdd, milestoneToggle, myWeek, orgSetTerminologyPack, prepareMeeting, priorityCreate,
  prioritySetStatus, search, todoComplete, todoCreate, visionProposeChange, getScorecard, MotionError,
  type Command, type Ctx, type Scope, type Terms,
} from '@motion/core'
import { previewImport } from '@motion/terminology'
import { compact, paginate, writeResult } from './format'
import { orgOverview, termsInUse } from './overview'

export type ToolDef = {
  name: string
  scope: Scope | Scope[]
  description: string
  shape: z.ZodRawShape
  readOnly?: boolean
  run: (ctx: Ctx, args: any) => Promise<unknown>
}

const common = {
  requestId: z.string().min(1).max(200).optional().describe('Idempotency key. Repeating the same requestId replays the first result instead of writing twice.'),
  expectedVersion: z.number().int().optional().describe('Optimistic concurrency: the `version` you last read. Fails with `conflict` if the record changed.'),
}
const paging = {
  limit: z.number().int().min(1).max(200).default(50).describe('Page size'),
  cursor: z.string().optional().describe('`nextCursor` from the previous page'),
}
const id = (what: string) => z.uuid().describe(`${what} id`)

const shapeOf = (cmd: Command<any, any>): z.ZodRawShape => {
  const s = (cmd.input as unknown as { shape?: z.ZodRawShape }).shape
  if (!s) throw new Error(`command ${cmd.name} has no object shape`)
  return s
}

export function buildTools(terms: Terms): ToolDef[] {
  const one = (k: Parameters<Terms['t']>[0]) => terms.t(k)
  const many = (k: Parameters<Terms['t']>[0]) => terms.t(k, 'plural')
  const P = one('priority'), Ps = many('priority'), M = one('metric'), Ms = many('metric'), I = one('issue'), Is = many('issue')
  const T = one('todo'), Ts = many('todo'), H = one('headline'), Hs = many('headline'), SC = one('scorecard')
  const WM = one('weekly_meeting'), V = one('vision_plan'), AC = one('accountability_chart'), MS = one('milestone')
  const tools: ToolDef[] = []

  const read = (name: string, description: string, shape: z.ZodRawShape, run: ToolDef['run'], scope: Scope | Scope[] = 'read') =>
    tools.push({ name, scope, description, shape, readOnly: true, run })

  /** Wrap a core command as a write tool. */
  const write = (
    name: string, cmd: Command<any, any>, description: string,
    o: { shape?: z.ZodRawShape; map?: (ctx: Ctx, a: any) => any; drop?: string[]; scope?: Scope | Scope[] } = {},
  ) =>
    tools.push({
      name, scope: o.scope ?? cmd.scope, description, shape: { ...(o.shape ?? shapeOf(cmd)), ...common },
      run: async (ctx, args) => {
        const { requestId, expectedVersion, ...rest } = args
        const input = o.map ? await o.map(ctx, rest) : rest
        return writeResult(await execute(ctx, cmd, input, { requestId, expectedVersion }), o.drop)
      },
    })

  // ------------------------------------------------------------------ Context
  read('org_overview', `Start here. The organization, the vocabulary it uses (e.g. "${P}" for 90-day priorities, "${M}", "${WM}"), current quarter and week, teams with ids, and your own role and scopes.`, {}, (ctx) => orgOverview(ctx, terms))
  read('search', `Search across ${Ps}, ${Ms}, ${Is}, ${Ts}, ${Hs}, people and meetings by text. Returns typed hits with ids.`, {
    query: z.string().min(1).describe('Text to search for'),
    types: z.array(z.enum(SEARCH_TYPES)).optional(),
    limit: z.number().int().min(1).max(100).default(20),
  }, async (ctx, a) => compact(await search(ctx, a.query, { types: a.types, limit: a.limit })))
  read('my_week', `The acting person's week: their ${Ps}, ${Ms} due, ${Ts}, and the next ${WM}. An agent sees its owner's week.`, {}, async (ctx) => compact(await myWeek(ctx)))

  // ------------------------------------------------------------------ Vision / chart
  read('vision_get', `The current published ${V} as structured sections (core values, core focus, targets, one-year plan, quarterly plan, long-term ${Is}), plus any draft.`, { teamId: z.uuid().optional().describe('Team vision instead of the company one') }, async (ctx, a) => compact(await getVision(ctx, a)))
  write('vision_propose_change', visionProposeChange, `Propose a change to the ${V}. Creates a pending approval: nothing changes until a person approves, then it is applied and published with provenance. Poll with approval_status.`)
  read('chart_get', `The ${AC}: seats, who sits in them, and their responsibilities.`, {}, async (ctx) => compact(await getChart(ctx)))
  write('chart_propose_change', chartProposeChange, `Propose changes to the ${AC} (add/update/move/delete seats, assign people). Creates a pending approval; nothing changes until a person approves.`)

  // ------------------------------------------------------------------ Priorities
  const pLabel = (p: any) => ({ ...p, statusLabel: terms.status(p.status) })
  read('priorities_list', `List ${Ps} (90-day priorities) for a quarter, compact rows. Filter by team, owner, status. Use priority_get for milestones and detail.`, {
    quarter: z.string().regex(/^\d{4}-Q[1-4]$/).optional().describe('YYYY-Qn, default current quarter'),
    teamId: z.uuid().optional(), ownerId: z.uuid().optional(),
    status: z.enum(['on_track', 'off_track', 'done', 'not_done', 'dropped']).optional(),
    level: z.enum(['company', 'team', 'individual']).optional(),
    ...paging,
  }, async (ctx, a) => {
    const { limit, cursor, ...f } = a
    const rows = await listPriorities(ctx, f)
    const page = paginate(rows.map((p) => pLabel({ ...p })), limit, cursor)
    return compact(page, ['description', 'sort', 'parentPriorityId'])
  })
  read('priority_get', `One ${P} with its ${many('milestone')}, parent/children cascade and recent activity.`, { priorityId: id(P) }, async (ctx, a) => compact(pLabel(await getPriority(ctx, a.priorityId))))
  write('priority_create', priorityCreate, `Create a ${P} (90-day priority) with optional ${many('milestone')}. Owner defaults to the acting person, quarter to the current one.`)
  write('priority_set_status', prioritySetStatus, `Set the status of a ${P} (90-day priority): on_track, off_track, done or not_done. Shown to people as "${terms.status('on_track')}", "${terms.status('off_track')}"…`)
  write('milestone_toggle', milestoneToggle, `Mark a ${MS} of a ${P} done or not done (flips when \`done\` is omitted).`)
  write('milestone_add', milestoneAdd, `Add a ${MS} to a ${P}.`)

  // ------------------------------------------------------------------ Scorecard
  read('scorecard_get', `The ${SC}: ${Ms} by recent periods with on/off-track computed from goals. Give scorecardId or teamId; with neither, lists the scorecards.`, {
    scorecardId: z.uuid().optional(), teamId: z.uuid().optional(),
    periods: z.number().int().min(1).max(52).optional().describe('How many periods (default: the scorecard setting)'),
    asOf: z.string().optional().describe('ISO date'),
  }, async (ctx, a) => {
    if (!a.scorecardId && !a.teamId) return compact({ scorecards: await listScorecards(ctx) })
    return compact(await getScorecard(ctx, a))
  })
  write('metric_record_values', metricRecordValues, `Record ${M} values in one atomic batch: [{ metricId | metricTitle, periodStart, value, note? }]. Titles are matched exactly within the ${SC} (pass scorecardId/teamId; optional when the org has one ${SC}). periodStart can be any date in the period.`, {
    map: async (ctx, a) => {
      if (a.scorecardId || a.teamId || a.values.every((v: any) => v.metricId)) return a
      const cards = await listScorecards(ctx)
      if (cards.length === 1) return { ...a, scorecardId: cards[0]!.id }
      throw new MotionError('validation', `Give scorecardId or teamId (metricTitle needs to know which ${SC})`, { scorecards: cards.map((c) => ({ id: c.id, teamId: c.teamId, teamName: c.teamName })) })
    },
  })
  write('metric_create', metricCreate, `Create a ${M} on a ${SC} with a goal and comparison (gte, lte, between…).`)

  // ------------------------------------------------------------------ Issues
  read('issues_list', `List ${Is} (open by rank by default). Filter by team, short/long-term horizon, owner, status.`, {
    teamId: z.uuid().optional(), horizon: z.enum(['short', 'long']).optional(), ownerId: z.uuid().optional(),
    status: z.enum(['open', 'solved', 'dropped', 'all']).optional(), ...paging,
  }, async (ctx, a) => {
    const { limit, cursor, ...f } = a
    return compact(paginate((await listIssues(ctx, f)).map((i) => ({ ...i, statusLabel: terms.status(i.status) })), limit, cursor), ['description'])
  })
  read('issue_get', `One ${I} in full.`, { issueId: id(I) }, async (ctx, a) => compact(await getIssue(ctx, a.issueId)))
  write('issue_create', issueCreate, `Create an ${I}. \`ownerIds[]\` fans out: one ${I} per owner. Use \`source\` to link where it came from.`)
  write('issue_solve', issueSolve, `Mark an ${I} solved.`)
  write('issue_reopen', issueReopen, `Reopen a solved or dropped ${I} (goes to the bottom of the list).`)
  write('issue_move', issueMove, `Move an ${I} to another team and/or to the long-term list.`)

  // ------------------------------------------------------------------ To-dos
  read('todos_list', `List ${Ts}, soonest due first. Filter by owner, team, status, overdue.`, {
    ownerId: z.uuid().optional(), teamId: z.uuid().optional(), personal: z.boolean().optional(),
    status: z.enum(['open', 'pending', 'done']).optional(), overdue: z.boolean().optional(), ...paging,
  }, async (ctx, a) => {
    const { limit, cursor, ...f } = a
    return compact(paginate(await listTodos(ctx, f), limit, cursor), ['description'])
  })
  write('todo_create', todoCreate, `Create a ${T}. \`ownerIds[]\` fans out one ${T} per owner. Due date defaults to 7 days from today.`)
  write('todo_complete', todoComplete, `Complete a ${T}. While the team's ${WM} is live it goes to \`pending\` and is confirmed when the meeting ends.`)

  // ------------------------------------------------------------------ Headlines
  write('headline_post', headlinePost, `Post a ${H} (customer, employee or general news) for a team.`)
  write('headline_cascade', headlineCascade, `Cascade a ${H} to other teams (copies it; teams that already have a copy are skipped).`)

  // ------------------------------------------------------------------ Meetings
  read('meetings_list', `List ${many('weekly_meeting')} (upcoming, live or past) to find meeting ids.`, {
    seriesId: z.uuid().optional(), teamId: z.uuid().optional(), status: z.enum(['upcoming', 'live', 'past']).optional(), limit: z.number().int().min(1).max(100).default(20),
  }, async (ctx, a) => compact(await listMeetings(ctx, a)))
  read('meeting_get', `A ${WM}: agenda, state, attendees (and live state when it is running).`, { meetingId: id('Meeting') }, async (ctx, a) => compact(await getMeeting(ctx, a.meetingId)))
  read('meeting_prepare', `Pre-read for a ${WM}: off-track ${Ms} and ${Ps}, open ${Is} ranked, overdue ${Ts}, ${Hs} to review. Give meetingId, seriesId or teamId.`, {
    meetingId: z.uuid().optional(), seriesId: z.uuid().optional(), teamId: z.uuid().optional(),
  }, async (ctx, a) => compact(await prepareMeeting(ctx, a)))
  write('meeting_start', meetingStart, `Start a ${WM} (by meetingId, or seriesId to pick the nearest scheduled one). Facilitator or delegated agent.`, { scope: 'write:meetings' })
  const mid = { meetingId: id('Meeting') }
  write('meeting_next_section', meetingNextSection, `Advance the live ${WM} to the next agenda section.`, { shape: mid })
  write('ids_focus_issue', idsFocus, `Pick the ${Is} to discuss next in the live ${WM} (up to the meeting's focus count). With \`start: true\` also begins discussing the first one.`, {
    shape: { ...mid, issueIds: z.array(z.uuid()).max(20).optional(), issueId: z.uuid().optional().describe('Shortcut for a single issue'), start: z.boolean().default(false) },
    map: (_c, a) => ({ meetingId: a.meetingId, issueIds: a.issueIds ?? (a.issueId ? [a.issueId] : []) }),
  })
  // ids_focus_issue's optional `start` is handled by wrapping below.
  const focus = tools.find((t) => t.name === 'ids_focus_issue')!
  const focusRun = focus.run
  focus.run = async (ctx, args) => {
    const out = (await focusRun(ctx, args)) as { ok?: boolean }
    if (args.start && out.ok) {
      const r = await execute(ctx, idsStart, { meetingId: args.meetingId, issueId: args.issueId ?? args.issueIds?.[0] }, { requestId: args.requestId ? `${args.requestId}:start` : undefined })
      return { ...out, started: writeResult(r) }
    }
    return out
  }
  write('ids_resolve', idsResolve, `Resolve the ${I} being discussed in the live ${WM}: { issueId, solved, todos?: [{ title, ownerId, dueDate? }] } creates the ${Ts}, solves the ${I} when \`solved\`, and moves on to the next focus ${I}.`)
  write('meeting_capture', meetingCapture, `Notes agent: add ${Ts}, ${Is} and ${Hs} tied to the live ${WM}.`)
  tools.push({
    name: 'meeting_end', scope: 'write:meetings',
    description: `End the live ${WM}: pending ${Ts} are confirmed, stats and a summary are stored and the recap goes out.`,
    shape: { ...mid, ...common },
    run: async (ctx, a) => writeResult(await endMeeting(ctx, { meetingId: a.meetingId }, { requestId: a.requestId, expectedVersion: a.expectedVersion }), ['recap']),
  })
  write('meeting_rate', meetingRate, `Rate a ${WM} 1-10. People only: an agent call fails with \`forbidden\`.`)

  // ------------------------------------------------------------------ Terminology
  read('terminology_get', 'The org vocabulary: every term (singular/plural/short) with the active pack and overrides. Descriptions of these tools already use these words.', {}, async () => compact({
    pack: terms.pack ? { id: terms.pack.id, name: terms.pack.name, version: terms.pack.version } : null,
    attribution: terms.attribution, overrides: terms.overrides, terms: termsInUse(terms),
    statuses: Object.fromEntries(['on_track', 'off_track', 'done', 'not_done'].map((s) => [s, terms.status(s)])),
  }))
  read('terminology_preview_import', 'Validate a terminology pack (JSON object) and list what would change. Changes nothing.', { pack: z.record(z.string(), z.unknown()).describe('Pack JSON, see docs/terminology-packs.md') }, async (_c, a) => {
    const r = previewImport(a.pack, terms.pack ?? undefined)
    return r.ok ? compact({ ok: true, id: r.pack.id, name: r.pack.name, version: r.pack.version, attribution: r.pack.attribution, changes: r.changes, meetingTemplates: (r.pack.meetingTemplates ?? []).map((m) => m.name) })
      : { ok: false, errors: r.errors.map((e) => `${e.path.join('.')}: ${e.message}`) }
  }, 'admin')
  write('terminology_apply', orgSetTerminologyPack, 'Apply a terminology pack (or revert to the previous one). Always needs human approval.', {
    shape: { pack: z.record(z.string(), z.unknown()).nullable().describe('Pack JSON, or null to clear'), revert: z.boolean().optional() },
  })

  // ------------------------------------------------------------------ Approvals
  read('approvals_list', 'List approvals. An agent sees (and defaults to) its own requests; filter by status.', {
    status: z.enum(['pending', 'approved', 'declined']).optional(), limit: z.number().int().min(1).max(100).default(20), cursor: z.string().optional(),
  }, async (ctx, a) => compact(await listApprovals(ctx, { ...a, requestedBy: ctx.actor.type === 'agent' ? ctx.actor.id : undefined })))
  read('approval_status', 'Status of one approval request (poll after a `needsApproval` response).', { approvalId: id('Approval') }, async (ctx, a) => compact(await getApproval(ctx, a.approvalId)))

  return tools
}
