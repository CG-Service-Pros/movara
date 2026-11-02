import { index, integer, jsonb, pgTable, text, uniqueIndex } from 'drizzle-orm/pg-core'
import { commonCols } from './_common'
import type { Branding, Modules, OrgSettings, QuarterCalendar, StoredOverrides, StoredPack } from '../types'

export const orgs = pgTable(
  'orgs',
  {
    ...commonCols(),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    timezone: text('timezone').notNull().default('UTC'),
    /** 1-12. Quarter 1 starts in this month. */
    fiscalYearStartMonth: integer('fiscal_year_start_month').notNull().default(1),
    quarterCalendar: jsonb('quarter_calendar').$type<QuarterCalendar>().notNull().default({ mode: 'standard' }),
    /** 0 = Sunday ... 6 = Saturday. Default Monday. */
    weekStartDay: integer('week_start_day').notNull().default(1),
    branding: jsonb('branding').$type<Branding>().notNull().default({}),
    settings: jsonb('settings').$type<OrgSettings>().notNull().default({}),
    /** Active imported pack JSON (null = Standard). */
    terminologyPack: jsonb('terminology_pack').$type<StoredPack | null>(),
    /** The pack that was active before the last change, for one-click revert. */
    terminologyPreviousPack: jsonb('terminology_previous_pack').$type<StoredPack | null>(),
    terminologyOverrides: jsonb('terminology_overrides').$type<StoredOverrides>().notNull().default({}),
    modules: jsonb('modules').$type<Modules>().notNull().default({}),
  },
  (t) => [uniqueIndex('orgs_slug_uq').on(t.slug), index('orgs_id_idx').on(t.id)],
)

export type OrgRow = typeof orgs.$inferSelect
