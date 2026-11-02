import { index, jsonb, pgEnum, pgTable, text, uuid } from 'drizzle-orm/pg-core'
import { commonCols, ts } from './_common'
import { orgs } from './org'
import type { ActorJson } from '../types'

export const approvalStatus = pgEnum('approval_status', ['pending', 'approved', 'declined'])

export const approvals = pgTable(
  'approvals',
  {
    ...commonCols(),
    orgId: uuid('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
    requestedByActor: jsonb('requested_by_actor').$type<ActorJson>().notNull(),
    /** Command name, e.g. "vision.propose_change". Re-executed on approve. */
    action: text('action').notNull(),
    /** Validated command input. */
    payload: jsonb('payload').$type<unknown>().notNull(),
    /** Human-readable one-liner for the approvals UI. */
    summary: text('summary'),
    /** Idempotency key of the original request, reused when re-executing. */
    requestId: text('request_id'),
    status: approvalStatus('status').notNull().default('pending'),
    decidedBy: jsonb('decided_by').$type<ActorJson>(),
    decidedAt: ts('decided_at'),
    decisionNote: text('decision_note'),
    /** Result of the re-executed command, or the error message. */
    result: jsonb('result').$type<unknown>(),
  },
  (t) => [index('approvals_org_status_idx').on(t.orgId, t.status, t.createdAt)],
)
