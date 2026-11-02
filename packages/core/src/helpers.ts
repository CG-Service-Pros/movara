import { and, eq, isNull, sql, type SQL } from 'drizzle-orm'
import type { AnyPgColumn, AnyPgTable } from 'drizzle-orm/pg-core'
import { newId } from '@motion/db'
import type { Ctx } from './ctx'
import { MotionError } from './errors'

export { newId }

/** Columns every insert needs: `{ ...base(ctx), title, ... }`. */
export const base = (ctx: Ctx) => ({
  id: newId(),
  orgId: ctx.orgId,
  createdByActor: ctx.actor,
  updatedByActor: ctx.actor,
})

type Tenant = AnyPgTable & { orgId: AnyPgColumn; deletedAt: AnyPgColumn; id: AnyPgColumn }

/** `WHERE org_id = ctx.orgId AND deleted_at IS NULL [AND ...extra]`. Use in EVERY query. */
export const scoped = (table: Tenant, ctx: Ctx, ...extra: (SQL | undefined)[]): SQL =>
  and(eq(table.orgId, ctx.orgId), isNull(table.deletedAt), ...extra) as SQL

/** Fields to merge into every update: bumps `version`, `updated_at`, `updated_by_actor`. */
export const touch = (table: { version: AnyPgColumn }, ctx: Ctx) => ({
  updatedAt: new Date(),
  updatedByActor: ctx.actor,
  version: sql`${table.version} + 1`,
})

/** Soft-delete fields (recycle bin). */
export const softDelete = (table: { version: AnyPgColumn }, ctx: Ctx) => ({ ...touch(table, ctx), deletedAt: new Date() })

/** Optimistic concurrency: throw `conflict` (with the current state) when the caller's expectedVersion is stale. */
export function assertVersion(current: { version: number }, expectedVersion: number | undefined): void {
  if (expectedVersion !== undefined && current.version !== expectedVersion) {
    throw new MotionError('conflict', `Stale write: expected version ${expectedVersion}, current is ${current.version}`, { current })
  }
}

/** Return only the keys whose values differ, for compact audit diffs. */
export function changedFields(before: Record<string, unknown>, after: Record<string, unknown>) {
  const b: Record<string, unknown> = {}
  const a: Record<string, unknown> = {}
  for (const k of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (JSON.stringify(before[k]) !== JSON.stringify(after[k])) {
      b[k] = before[k]
      a[k] = after[k]
    }
  }
  return { before: b, after: a }
}

/** Keyset cursor helpers for list queries: cursor = base64url("<iso>|<id>"). */
export const encodeCursor = (at: Date, id: string) => Buffer.from(`${at.toISOString()}|${id}`).toString('base64url')
export function decodeCursor(cursor: string): { at: Date; id: string } {
  try {
    const [iso, id] = Buffer.from(cursor, 'base64url').toString().split('|')
    const at = new Date(iso!)
    if (!id || Number.isNaN(at.getTime())) throw new Error()
    return { at, id }
  } catch {
    throw new MotionError('validation', 'Invalid cursor')
  }
}

/** Get a single row or throw not_found. */
export function found<T>(row: T | undefined | null, what = 'Record'): T {
  if (!row) throw new MotionError('not_found', `${what} not found`)
  return row
}
