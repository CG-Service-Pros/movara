'use server'

import { execute, metricArchive, metricCreate, metricRecordValues, metricReorder, metricUpdate, scorecardCreate, scorecardUpdateSettings } from '@movara/core'
import { runAction, type ActionResult } from '@/components/issues/action'

const paths = ['scorecard', 'issues']

export type MetricInput = {
  title: string
  description: string | null
  ownerIds: string[]
  comparison: 'gte' | 'lte' | 'gt' | 'lt' | 'eq' | 'between'
  goal: number
  goalUpper: number | null
  unit: 'number' | 'percent' | 'currency' | 'duration' | 'boolean'
  scale: number
  decimals: number
  additive: boolean
}

export async function recordValueAction(slug: string, scorecardId: string, metricId: string, periodStart: string, value: number | null): Promise<ActionResult> {
  return runAction(slug, ['scorecard', 'meetings'], (ctx) => execute(ctx, metricRecordValues, { scorecardId, values: [{ metricId, periodStart, value }] }))
}

export async function createMetricAction(slug: string, scorecardId: string, input: MetricInput): Promise<ActionResult> {
  return runAction(slug, paths, (ctx) => execute(ctx, metricCreate, { scorecardId, ...input, goalUpper: input.comparison === 'between' ? input.goalUpper : null }))
}

export async function updateMetricAction(slug: string, metricId: string, input: MetricInput): Promise<ActionResult> {
  return runAction(slug, paths, (ctx) => execute(ctx, metricUpdate, { metricId, ...input, goalUpper: input.comparison === 'between' ? input.goalUpper : null }))
}

export async function reorderMetricsAction(slug: string, scorecardId: string, metricIds: string[]): Promise<ActionResult> {
  return runAction(slug, paths, (ctx) => execute(ctx, metricReorder, { scorecardId, metricIds }))
}

export async function archiveMetricAction(slug: string, metricId: string): Promise<ActionResult> {
  return runAction(slug, paths, (ctx) => execute(ctx, metricArchive, { metricId }))
}

export async function updateSettingsAction(slug: string, scorecardId: string, input: { interval: 'day' | 'week' | 'month' | 'quarter'; weekStartDay: number; periodsShown: number }): Promise<ActionResult> {
  return runAction(slug, paths, (ctx) => execute(ctx, scorecardUpdateSettings, { scorecardId, ...input }))
}

export async function createScorecardAction(slug: string, teamId: string): Promise<ActionResult> {
  return runAction(slug, paths, (ctx) => execute(ctx, scorecardCreate, { teamId }))
}
