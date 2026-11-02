import { index, integer, jsonb, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { commonCols, ts } from './_common'
import { orgs } from './org'
import { teams } from './teams'
import { revisionStatus } from './vision'
import type { ActorJson } from '../types'

export const charts = pgTable(
  'charts',
  {
    ...commonCols(),
    orgId: uuid('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
    name: text('name').notNull().default('Accountability chart'),
  },
  (t) => [index('charts_org_idx').on(t.orgId)],
)

export const chartRevisions = pgTable(
  'chart_revisions',
  {
    ...commonCols(),
    orgId: uuid('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
    chartId: uuid('chart_id').notNull().references(() => charts.id, { onDelete: 'cascade' }),
    number: integer('number').notNull(),
    status: revisionStatus('status').notNull().default('draft'),
    publishedAt: ts('published_at'),
    publishedBy: jsonb('published_by').$type<ActorJson>(),
  },
  (t) => [uniqueIndex('chart_revisions_chart_number_uq').on(t.chartId, t.number), index('chart_revisions_org_chart_idx').on(t.orgId, t.chartId, t.status)],
)

export const seats = pgTable(
  'seats',
  {
    ...commonCols(),
    orgId: uuid('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
    chartRevisionId: uuid('chart_revision_id').notNull().references(() => chartRevisions.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    parentSeatId: uuid('parent_seat_id'),
    sort: integer('sort').notNull().default(0),
    responsibilities: text('responsibilities').array().notNull().default([]),
    personIds: uuid('person_ids').array().notNull().default([]),
    assistingAgentIds: uuid('assisting_agent_ids').array().notNull().default([]),
    teamId: uuid('team_id').references(() => teams.id, { onDelete: 'set null' }),
    /** Open seat linked to the priority that will fill it (no FK to avoid import cycles; validated in core). */
    linkedPriorityId: uuid('linked_priority_id'),
  },
  (t) => [index('seats_org_revision_idx').on(t.orgId, t.chartRevisionId, t.sort), index('seats_org_parent_idx').on(t.orgId, t.parentSeatId)],
)
