import { date, index, integer, pgEnum, pgTable, text, uuid } from 'drizzle-orm/pg-core'
import { commonCols, ts } from './_common'
import { orgs } from './org'
import { people } from './people'
import { teams } from './teams'

export const priorityLevel = pgEnum('priority_level', ['company', 'team', 'individual'])
export const priorityStatus = pgEnum('priority_status', ['on_track', 'off_track', 'done', 'not_done', 'dropped'])

export const priorities = pgTable(
  'priorities',
  {
    ...commonCols(),
    orgId: uuid('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    description: text('description'),
    ownerId: uuid('owner_id').references(() => people.id, { onDelete: 'set null' }),
    teamId: uuid('team_id').references(() => teams.id, { onDelete: 'set null' }),
    /** "YYYY-Qn", e.g. 2026-Q4. */
    quarter: text('quarter').notNull(),
    dueDate: date('due_date', { mode: 'string' }),
    level: priorityLevel('level').notNull().default('company'),
    status: priorityStatus('status').notNull().default('on_track'),
    parentPriorityId: uuid('parent_priority_id'),
    sort: integer('sort').notNull().default(0),
  },
  (t) => [
    index('priorities_org_quarter_idx').on(t.orgId, t.quarter, t.status),
    index('priorities_org_owner_idx').on(t.orgId, t.ownerId),
    index('priorities_org_team_idx').on(t.orgId, t.teamId),
  ],
)

export const milestones = pgTable(
  'milestones',
  {
    ...commonCols(),
    orgId: uuid('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
    priorityId: uuid('priority_id').notNull().references(() => priorities.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    dueDate: date('due_date', { mode: 'string' }),
    doneAt: ts('done_at'),
    sort: integer('sort').notNull().default(0),
  },
  (t) => [index('milestones_org_priority_idx').on(t.orgId, t.priorityId, t.sort)],
)
