import { index, jsonb, pgEnum, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { commonCols } from './_common'
import { orgs } from './org'
import { user } from './auth'
import type { ReminderSchedule } from '../types'

export const personRole = pgEnum('person_role', ['owner', 'admin', 'member', 'viewer'])

export const people = pgTable(
  'people',
  {
    ...commonCols(),
    orgId: uuid('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
    /** Better Auth user id. Null until the invited person signs up (linked by email). */
    userId: text('user_id').references(() => user.id, { onDelete: 'set null' }),
    name: text('name').notNull(),
    email: text('email').notNull(),
    avatarUrl: text('avatar_url'),
    role: personRole('role').notNull().default('member'),
    timezone: text('timezone'),
    reminderSchedule: jsonb('reminder_schedule').$type<ReminderSchedule>().notNull().default({}),
  },
  (t) => [
    index('people_org_idx').on(t.orgId, t.deletedAt),
    uniqueIndex('people_org_email_uq').on(t.orgId, t.email),
    index('people_org_user_idx').on(t.orgId, t.userId),
    index('people_user_idx').on(t.userId),
  ],
)
