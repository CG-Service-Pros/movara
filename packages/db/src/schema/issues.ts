import { index, integer, jsonb, pgEnum, pgTable, text, uuid } from 'drizzle-orm/pg-core'
import { commonCols, ts } from './_common'
import { orgs } from './org'
import { people } from './people'
import { teams } from './teams'
import type { Source } from '../types'

export const issueHorizon = pgEnum('issue_horizon', ['short', 'long'])
export const issueStatus = pgEnum('issue_status', ['open', 'solved', 'dropped'])

export const issues = pgTable(
  'issues',
  {
    ...commonCols(),
    orgId: uuid('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    description: text('description'),
    ownerId: uuid('owner_id').references(() => people.id, { onDelete: 'set null' }),
    teamId: uuid('team_id').references(() => teams.id, { onDelete: 'set null' }),
    horizon: issueHorizon('horizon').notNull().default('short'),
    rank: integer('rank').notNull().default(0),
    status: issueStatus('status').notNull().default('open'),
    solvedAt: ts('solved_at'),
    source: jsonb('source').$type<Source>(),
  },
  (t) => [
    index('issues_org_team_status_idx').on(t.orgId, t.teamId, t.status, t.horizon, t.rank),
    index('issues_org_owner_idx').on(t.orgId, t.ownerId),
  ],
)
