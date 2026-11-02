import { index, jsonb, pgTable, text, uuid } from 'drizzle-orm/pg-core'
import { idCol, ts } from './_common'
import { orgs } from './org'
import type { ActorJson } from '../types'

/** Append-only. No updated_at/version/deleted_at. */
export const auditEvents = pgTable(
  'audit_events',
  {
    id: idCol(),
    orgId: uuid('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
    actor: jsonb('actor').$type<ActorJson>().notNull(),
    /** Person id the actor acts for (agents). */
    onBehalfOf: uuid('on_behalf_of'),
    command: text('command').notNull(),
    entityType: text('entity_type'),
    entityId: uuid('entity_id'),
    diff: jsonb('diff').$type<{ before?: unknown; after?: unknown; [k: string]: unknown } | null>(),
    requestId: text('request_id'),
    at: ts('at').notNull().defaultNow(),
  },
  (t) => [
    index('audit_org_at_idx').on(t.orgId, t.at),
    index('audit_org_entity_idx').on(t.orgId, t.entityType, t.entityId),
    index('audit_org_command_idx').on(t.orgId, t.command),
  ],
)
