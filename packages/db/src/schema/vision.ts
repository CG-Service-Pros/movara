import { index, integer, jsonb, pgEnum, pgTable, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { commonCols, ts } from './_common'
import { orgs } from './org'
import { teams } from './teams'
import type { ActorJson, VisionContent } from '../types'

export const visionScope = pgEnum('vision_scope', ['company', 'team'])
export const revisionStatus = pgEnum('revision_status', ['draft', 'published', 'archived'])

export const visionPlans = pgTable(
  'vision_plans',
  {
    ...commonCols(),
    orgId: uuid('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
    scope: visionScope('scope').notNull().default('company'),
    teamId: uuid('team_id').references(() => teams.id, { onDelete: 'cascade' }),
  },
  (t) => [index('vision_plans_org_idx').on(t.orgId, t.scope, t.teamId)],
)

export const visionRevisions = pgTable(
  'vision_revisions',
  {
    ...commonCols(),
    orgId: uuid('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
    planId: uuid('plan_id').notNull().references(() => visionPlans.id, { onDelete: 'cascade' }),
    number: integer('number').notNull(),
    status: revisionStatus('status').notNull().default('draft'),
    content: jsonb('content').$type<VisionContent>().notNull().default({ sections: {} }),
    publishedAt: ts('published_at'),
    publishedBy: jsonb('published_by').$type<ActorJson>(),
  },
  (t) => [uniqueIndex('vision_revisions_plan_number_uq').on(t.planId, t.number), index('vision_revisions_org_plan_idx').on(t.orgId, t.planId, t.status)],
)
