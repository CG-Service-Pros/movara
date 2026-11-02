import { sql } from 'drizzle-orm'
import { integer, jsonb, timestamp, uuid } from 'drizzle-orm/pg-core'
import type { ActorJson } from '../types'

/** `id` is generated in core (uuid v7); the DB default is only a safety net. */
export const idCol = () => uuid('id').primaryKey().default(sql`gen_random_uuid()`)

export const ts = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' })

/** Columns on every tenant table (docs/architecture.md "Common columns"). `org_id` FK is added per table. */
export const commonCols = () => ({
  id: idCol(),
  createdAt: ts('created_at').notNull().defaultNow(),
  createdByActor: jsonb('created_by_actor').$type<ActorJson>(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
  updatedByActor: jsonb('updated_by_actor').$type<ActorJson>(),
  version: integer('version').notNull().default(1),
  deletedAt: ts('deleted_at'),
})
