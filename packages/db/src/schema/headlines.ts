import { index, pgEnum, pgTable, text, uuid } from 'drizzle-orm/pg-core'
import { commonCols, ts } from './_common'
import { orgs } from './org'
import { people } from './people'
import { teams } from './teams'

export const headlineKind = pgEnum('headline_kind', ['customer', 'employee', 'general'])

export const headlines = pgTable(
  'headlines',
  {
    ...commonCols(),
    orgId: uuid('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
    text: text('text').notNull(),
    kind: headlineKind('kind').notNull().default('general'),
    ownerId: uuid('owner_id').references(() => people.id, { onDelete: 'set null' }),
    teamId: uuid('team_id').references(() => teams.id, { onDelete: 'set null' }),
    reviewedAt: ts('reviewed_at'),
    cascadedFromId: uuid('cascaded_from_id'),
  },
  (t) => [index('headlines_org_team_idx').on(t.orgId, t.teamId, t.reviewedAt), index('headlines_org_owner_idx').on(t.orgId, t.ownerId)],
)
