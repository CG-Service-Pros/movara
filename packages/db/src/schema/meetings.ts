import { index, integer, jsonb, pgTable, text, uuid } from 'drizzle-orm/pg-core'
import { commonCols, ts } from './_common'
import { orgs } from './org'
import { people } from './people'
import { teams } from './teams'
import type { ActorJson, AgendaItemJson, MeetingState } from '../types'

export const meetingSeries = pgTable(
  'meeting_series',
  {
    ...commonCols(),
    orgId: uuid('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
    teamId: uuid('team_id').notNull().references(() => teams.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    templateKey: text('template_key').notNull().default('weekly'),
    agenda: jsonb('agenda').$type<AgendaItemJson[]>().notNull().default([]),
    /** iCalendar RRULE, e.g. FREQ=WEEKLY;BYDAY=TU. */
    rrule: text('rrule'),
    /** Time of day (HH:MM, org timezone) and length for scheduling. */
    startTime: text('start_time'),
    durationMinutes: integer('duration_minutes').notNull().default(90),
    attendeeIds: uuid('attendee_ids').array().notNull().default([]),
    facilitatorId: uuid('facilitator_id').references(() => people.id, { onDelete: 'set null' }),
    /** The actor (person or agent) that takes notes. */
    scribeActor: jsonb('scribe_actor').$type<ActorJson | null>(),
  },
  (t) => [index('meeting_series_org_team_idx').on(t.orgId, t.teamId)],
)

export const meetings = pgTable(
  'meetings',
  {
    ...commonCols(),
    orgId: uuid('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
    seriesId: uuid('series_id').notNull().references(() => meetingSeries.id, { onDelete: 'cascade' }),
    scheduledAt: ts('scheduled_at').notNull(),
    startedAt: ts('started_at'),
    endedAt: ts('ended_at'),
    /** Server-authoritative live state: section index, timers, ids_state, focus_issue_ids. */
    state: jsonb('state').$type<MeetingState>().notNull().default({}),
    /** { [personId]: 1-10 } */
    ratings: jsonb('ratings').$type<Record<string, number>>().notNull().default({}),
    summary: text('summary'),
    recapSentAt: ts('recap_sent_at'),
  },
  (t) => [index('meetings_org_series_idx').on(t.orgId, t.seriesId, t.scheduledAt)],
)
