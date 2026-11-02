import { date, index, jsonb, pgEnum, pgTable, text, uuid } from 'drizzle-orm/pg-core'
import { commonCols, ts } from './_common'
import { orgs } from './org'
import { people } from './people'
import { teams } from './teams'
import type { Source } from '../types'

export const todoStatus = pgEnum('todo_status', ['open', 'pending', 'done'])

export const todos = pgTable(
  'todos',
  {
    ...commonCols(),
    orgId: uuid('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    description: text('description'),
    ownerId: uuid('owner_id').references(() => people.id, { onDelete: 'set null' }),
    /** Null = personal to-do. */
    teamId: uuid('team_id').references(() => teams.id, { onDelete: 'set null' }),
    dueDate: date('due_date', { mode: 'string' }),
    status: todoStatus('status').notNull().default('open'),
    doneAt: ts('done_at'),
    source: jsonb('source').$type<Source>(),
  },
  (t) => [index('todos_org_owner_status_idx').on(t.orgId, t.ownerId, t.status), index('todos_org_team_idx').on(t.orgId, t.teamId, t.status)],
)
