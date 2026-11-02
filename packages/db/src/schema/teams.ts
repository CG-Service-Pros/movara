import { boolean, index, pgEnum, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { commonCols } from './_common'
import { orgs } from './org'
import { people } from './people'

export const teamMemberRole = pgEnum('team_member_role', ['lead', 'member'])

export const teams = pgTable(
  'teams',
  {
    ...commonCols(),
    orgId: uuid('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    parentTeamId: uuid('parent_team_id'),
    leaderId: uuid('leader_id').references(() => people.id, { onDelete: 'set null' }),
    isLeadership: boolean('is_leadership').notNull().default(false),
  },
  (t) => [index('teams_org_idx').on(t.orgId, t.deletedAt), index('teams_org_parent_idx').on(t.orgId, t.parentTeamId)],
)

export const teamMembers = pgTable(
  'team_members',
  {
    ...commonCols(),
    orgId: uuid('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
    teamId: uuid('team_id').notNull().references(() => teams.id, { onDelete: 'cascade' }),
    personId: uuid('person_id').notNull().references(() => people.id, { onDelete: 'cascade' }),
    role: teamMemberRole('role').notNull().default('member'),
  },
  (t) => [
    uniqueIndex('team_members_team_person_uq').on(t.teamId, t.personId),
    index('team_members_org_team_idx').on(t.orgId, t.teamId),
    index('team_members_org_person_idx').on(t.orgId, t.personId),
  ],
)
