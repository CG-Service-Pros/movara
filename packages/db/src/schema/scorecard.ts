import { boolean, date, index, integer, jsonb, numeric, pgEnum, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { commonCols } from './_common'
import { orgs } from './org'
import { teams } from './teams'
import type { ActorJson } from '../types'

export const scorecardInterval = pgEnum('scorecard_interval', ['day', 'week', 'month', 'quarter'])
export const metricComparison = pgEnum('metric_comparison', ['gte', 'lte', 'gt', 'lt', 'eq', 'between'])
export const metricUnit = pgEnum('metric_unit', ['number', 'percent', 'currency', 'duration', 'boolean'])

export const scorecards = pgTable(
  'scorecards',
  {
    ...commonCols(),
    orgId: uuid('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
    teamId: uuid('team_id').notNull().references(() => teams.id, { onDelete: 'cascade' }),
    interval: scorecardInterval('interval').notNull().default('week'),
    weekStartDay: integer('week_start_day').notNull().default(1),
    periodsShown: integer('periods_shown').notNull().default(13),
  },
  (t) => [index('scorecards_org_team_idx').on(t.orgId, t.teamId)],
)

export const metrics = pgTable(
  'metrics',
  {
    ...commonCols(),
    orgId: uuid('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
    scorecardId: uuid('scorecard_id').notNull().references(() => scorecards.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    description: text('description'),
    ownerIds: uuid('owner_ids').array().notNull().default([]),
    comparison: metricComparison('comparison').notNull().default('gte'),
    goal: numeric('goal', { mode: 'number' }),
    goalUpper: numeric('goal_upper', { mode: 'number' }),
    unit: metricUnit('unit').notNull().default('number'),
    /** Display scale divisor/multiplier hint (e.g. 1000 for "$40k"). */
    scale: numeric('scale', { mode: 'number' }).notNull().default(1),
    decimals: integer('decimals').notNull().default(0),
    /** Whether quarter totals add up (true) or average (false). */
    additive: boolean('additive').notNull().default(false),
    sort: integer('sort').notNull().default(0),
    /** External source, e.g. { type: 'hubspot', ... }. */
    source: jsonb('source').$type<Record<string, unknown> | null>(),
  },
  (t) => [index('metrics_org_scorecard_idx').on(t.orgId, t.scorecardId, t.sort)],
)

export const metricValues = pgTable(
  'metric_values',
  {
    ...commonCols(),
    orgId: uuid('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
    metricId: uuid('metric_id').notNull().references(() => metrics.id, { onDelete: 'cascade' }),
    periodStart: date('period_start', { mode: 'string' }).notNull(),
    value: numeric('value', { mode: 'number' }),
    note: text('note'),
    enteredByActor: jsonb('entered_by_actor').$type<ActorJson>(),
  },
  (t) => [uniqueIndex('metric_values_metric_period_uq').on(t.metricId, t.periodStart), index('metric_values_org_metric_idx').on(t.orgId, t.metricId, t.periodStart)],
)
