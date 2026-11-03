import { index, integer, jsonb, numeric, pgEnum, pgTable, text, uniqueIndex, uuid, boolean } from 'drizzle-orm/pg-core'
import { commonCols, idCol, ts } from './_common'
import { orgs } from './org'
import { people } from './people'
import type { ActorJson } from '../types'

export const aiFeature = pgEnum('ai_feature', ['coach', 'extract'])
export const coachRole = pgEnum('coach_role', ['user', 'assistant', 'tool'])

/** Per-org AI provider configuration. The API key is stored AES-256-GCM encrypted (ciphertext + iv + tag, base64). */
export const orgAiSettings = pgTable(
  'org_ai_settings',
  {
    ...commonCols(),
    orgId: uuid('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
    enabled: boolean('enabled').notNull().default(false),
    /** 'openai' | 'openai_compatible' */
    provider: text('provider').notNull().default('openai'),
    baseUrl: text('base_url'),
    apiKeyCiphertext: text('api_key_ciphertext'),
    apiKeyIv: text('api_key_iv'),
    apiKeyTag: text('api_key_tag'),
    /** Last 4 characters of the key, for display only. */
    apiKeyLast4: text('api_key_last4'),
    model: text('model').notNull().default('gpt-5.6-luna'),
    reasoningEffort: text('reasoning_effort').notNull().default('low'),
    monthlyTokenLimit: integer('monthly_token_limit'),
    coachName: text('coach_name').notNull().default('Coach'),
    coachPersonality: text('coach_personality').notNull().default('Warm, direct and practical. Coaches on accountability and clarity.'),
    updatedBy: jsonb('updated_by').$type<ActorJson | null>(),
  },
  (t) => [uniqueIndex('org_ai_settings_org_uq').on(t.orgId)],
)

export const coachThreads = pgTable(
  'coach_threads',
  {
    ...commonCols(),
    orgId: uuid('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
    personId: uuid('person_id').notNull().references(() => people.id, { onDelete: 'cascade' }),
    title: text('title').notNull().default('New conversation'),
    /** Where the chat was opened from, e.g. { page: 'issues', teamId, meetingId }. */
    context: jsonb('context').$type<Record<string, unknown>>().notNull().default({}),
  },
  (t) => [index('coach_threads_org_person_idx').on(t.orgId, t.personId, t.updatedAt)],
)

export const coachMessages = pgTable(
  'coach_messages',
  {
    id: idCol(),
    orgId: uuid('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
    threadId: uuid('thread_id').notNull().references(() => coachThreads.id, { onDelete: 'cascade' }),
    role: coachRole('role').notNull(),
    content: jsonb('content').$type<unknown>(),
    toolCalls: jsonb('tool_calls').$type<unknown>(),
    usage: jsonb('usage').$type<Record<string, unknown> | null>(),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [index('coach_messages_thread_idx').on(t.threadId, t.createdAt)],
)

export const aiUsage = pgTable(
  'ai_usage',
  {
    id: idCol(),
    orgId: uuid('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
    personId: uuid('person_id').references(() => people.id, { onDelete: 'set null' }),
    feature: aiFeature('feature').notNull(),
    model: text('model').notNull(),
    inputTokens: integer('input_tokens').notNull().default(0),
    outputTokens: integer('output_tokens').notNull().default(0),
    costEstimateUsd: numeric('cost_estimate_usd', { precision: 12, scale: 6, mode: 'number' }),
    at: ts('at').notNull().defaultNow(),
  },
  (t) => [index('ai_usage_org_at_idx').on(t.orgId, t.at)],
)
