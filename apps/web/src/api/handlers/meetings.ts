import {
  endMeeting, execute, getLiveState, getMeeting, getMeetingSeries, idsFocus, idsResolve, idsStart, listMeetingHistory, listMeetings, listMeetingSeries, listMeetingTemplates,
  meetingCapture, meetingDropToIssue, meetingEndDay, meetingSetQuarterGrade, meetingSetTeamHealth, meetingStartDay, meetingHeartbeat, meetingJoin, meetingLeave, meetingNextSection, meetingPause, meetingRate, meetingResume, meetingReviewHeadline,
  meetingScheduleNext, meetingSeriesCreate, meetingSeriesUpdate, meetingSetSection, meetingSetSettings, meetingStart, prepareMeeting,
  captureMeetingNotes, listMeetingCaptures, meetingsFind,
  type Command, type Ctx,
} from '@movara/core'
import { fromExecute, json } from '../respond'
import type { ApiRequest, HandlerMap } from '../types'

const body = async (req: ApiRequest) => ((await req.json()) ?? {}) as Record<string, unknown>
const opts = (req: ApiRequest) => ({ requestId: req.requestId, expectedVersion: req.expectedVersion })
const num = (v: string | null) => (v === null || v === '' ? undefined : Number(v))

/** POST /meetings/:id/<action>: body merged with { meetingId }. */
const live = (cmd: Command<any, any>) => async (req: ApiRequest) =>
  fromExecute(await execute(req.ctx as Ctx, cmd, { ...(await body(req)), meetingId: req.params.id! }, opts(req)))

/** REST handlers for the meetings area. Static paths are listed before parameterized ones. */
export const handlers: HandlerMap = {
  // series + templates + history + prep
  /** GET /meetings/find?title=&teamId=&date=&near=latest|today|upcoming&windowDays=: meetings (past included) that notes may belong to. */
  'GET /meetings/find': async ({ ctx, query }) => {
    const near = query.get('near')
    return {
      meetings: await meetingsFind(ctx, {
        teamId: query.get('teamId') ?? undefined, title: query.get('title') ?? undefined, date: query.get('date') ?? undefined,
        near: near === 'latest' || near === 'today' || near === 'upcoming' ? near : undefined,
        windowDays: num(query.get('windowDays')), limit: num(query.get('limit')),
      }),
    }
  },
  'GET /meetings/templates': async ({ ctx }) => listMeetingTemplates(ctx),
  'GET /meetings/series': async ({ ctx, query }) => listMeetingSeries(ctx, { teamId: query.get('teamId') ?? undefined }),
  'POST /meetings/series': async (req) => fromExecute(await execute(req.ctx, meetingSeriesCreate, (await body(req)) as never, opts(req)), 201),
  'GET /meetings/series/:id': async ({ ctx, params }) => getMeetingSeries(ctx, params.id!),
  'PATCH /meetings/series/:id': async (req) => fromExecute(await execute(req.ctx, meetingSeriesUpdate, { ...(await body(req)), seriesId: req.params.id! } as never, opts(req))),
  'POST /meetings/series/:id/schedule': async (req) => fromExecute(await execute(req.ctx, meetingScheduleNext, { ...(await body(req)), seriesId: req.params.id! } as never, opts(req)), 201),
  'GET /meetings/history': async ({ ctx, query }) =>
    listMeetingHistory(ctx, { seriesId: query.get('seriesId') ?? undefined, teamId: query.get('teamId') ?? undefined, limit: num(query.get('limit')) }),
  'GET /meetings/prepare': async ({ ctx, query }) =>
    prepareMeeting(ctx, { meetingId: query.get('meetingId') ?? undefined, seriesId: query.get('seriesId') ?? undefined, teamId: query.get('teamId') ?? undefined }),
  'GET /meetings': async ({ ctx, query }) =>
    listMeetings(ctx, {
      seriesId: query.get('seriesId') ?? undefined,
      teamId: query.get('teamId') ?? undefined,
      status: (query.get('status') as 'upcoming' | 'live' | 'past' | null) ?? undefined,
      limit: num(query.get('limit')),
    }),
  'POST /meetings/start': async (req) => fromExecute(await execute(req.ctx, meetingStart, (await body(req)) as never, opts(req)), 201),

  // one meeting
  'GET /meetings/:id': async ({ ctx, params }) => getMeeting(ctx, params.id!),
  /** Poll with ?sinceRev=N: 204 (no body) when unchanged, else { data: LiveState }. */
  'GET /meetings/:id/live': async ({ ctx, params, query }) => {
    const state = await getLiveState(ctx, params.id!, { sinceRev: num(query.get('sinceRev')) })
    return state === null ? new Response(null, { status: 204 }) : json({ data: state })
  },
  /** Notes + captured items of a meeting. */
  'GET /meetings/:id/notes': async ({ ctx, params, query }) => listMeetingCaptures(ctx, params.id!, { includeTranscript: query.get('transcript') === '1' }),
  /** Mirrors the meeting_capture_notes MCP tool. Idempotency-Key header = requestId. 201 on first write, 200 on replay. */
  'POST /meetings/:id/notes': async (req) => {
    const r = await captureMeetingNotes(req.ctx, { ...(await body(req)), meetingId: req.params.id!, requestId: req.requestId } as never)
    return json({ ok: true, data: r }, r.replayed ? 200 : 201)
  },
  'POST /meetings/:id/heartbeat': async ({ ctx, params }) => ({ present: await meetingHeartbeat(ctx, params.id!) }),
  'POST /meetings/:id/join': live(meetingJoin),
  'POST /meetings/:id/leave': live(meetingLeave),
  'POST /meetings/:id/pause': live(meetingPause),
  'POST /meetings/:id/resume': live(meetingResume),
  'POST /meetings/:id/next-section': live(meetingNextSection),
  'POST /meetings/:id/section': live(meetingSetSection),
  'POST /meetings/:id/drop-to-issue': live(meetingDropToIssue),
  'POST /meetings/:id/review-headline': live(meetingReviewHeadline),
  'POST /meetings/:id/ids/focus': live(idsFocus),
  'POST /meetings/:id/ids/start': live(idsStart),
  'POST /meetings/:id/ids/resolve': live(idsResolve),
  'POST /meetings/:id/end-day': live(meetingEndDay),
  'POST /meetings/:id/start-day': live(meetingStartDay),
  'POST /meetings/:id/quarter-grade': live(meetingSetQuarterGrade),
  'POST /meetings/:id/team-health': live(meetingSetTeamHealth),
  'POST /meetings/:id/rate': live(meetingRate),
  'POST /meetings/:id/settings': live(meetingSetSettings),
  'POST /meetings/:id/capture': live(meetingCapture),
  'POST /meetings/:id/end': async (req) => fromExecute(await endMeeting(req.ctx, { meetingId: req.params.id! }, opts(req))),
}
