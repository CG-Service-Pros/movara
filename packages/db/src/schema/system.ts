import { index, integer, jsonb, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { idCol, ts } from './_common'
import { orgs } from './org'

/** Idempotency log: one row per (org, request_id). Stores the response to replay. */
export const requestLog = pgTable(
  'request_log',
  {
    id: idCol(),
    orgId: uuid('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
    requestId: text('request_id').notNull(),
    command: text('command').notNull(),
    actorId: text('actor_id').notNull(),
    status: text('status').notNull().default('done'),
    response: jsonb('response').$type<unknown>(),
    httpStatus: integer('http_status'),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [uniqueIndex('request_log_org_request_uq').on(t.orgId, t.requestId), index('request_log_org_created_idx').on(t.orgId, t.createdAt)],
)
