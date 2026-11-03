import { sql } from 'drizzle-orm'
import { index, jsonb, pgEnum, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { commonCols, ts } from './_common'
import { orgs } from './org'
import { people } from './people'

export const agentStatus = pgEnum('agent_status', ['active', 'paused', 'revoked'])

export const agents = pgTable(
  'agents',
  {
    ...commonCols(),
    orgId: uuid('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    ownerPersonId: uuid('owner_person_id').notNull().references(() => people.id),
    /** Free text: "Claude Code", "HubSpot workflow". */
    client: text('client'),
    /** Set when the agent authenticates through OAuth (MCP clients). */
    oauthClientId: text('oauth_client_id'),
    scopes: text('scopes').array().notNull().default([]),
    /** 'standard' (connected by a person) | 'builtin_coach' (the org's built-in Coach; not revocable). */
    kind: text('kind').notNull().default('standard'),
    /** Scope preset the agent was created from (see SCOPE_PRESETS in core); null = custom. */
    preset: text('preset'),
    status: agentStatus('status').notNull().default('active'),
    lastSeenAt: ts('last_seen_at'),
  },
  (t) => [
    index('agents_org_idx').on(t.orgId, t.status),
    index('agents_org_owner_idx').on(t.orgId, t.ownerPersonId),
    uniqueIndex('agents_one_coach_uq').on(t.orgId).where(sql`${t.kind} = 'builtin_coach'`),
  ],
)

/** Static API keys for server-to-server agents. Only the sha256 hash is stored. */
export const apiKeys = pgTable(
  'api_keys',
  {
    ...commonCols(),
    orgId: uuid('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
    agentId: uuid('agent_id').notNull().references(() => agents.id, { onDelete: 'cascade' }),
    name: text('name'),
    /** First characters of the key (e.g. mk_live_ab12) for display. */
    prefix: text('prefix').notNull(),
    keyHash: text('key_hash').notNull(),
    scopes: text('scopes').array(),
    expiresAt: ts('expires_at'),
    revokedAt: ts('revoked_at'),
    lastUsedAt: ts('last_used_at'),
  },
  (t) => [uniqueIndex('api_keys_hash_uq').on(t.keyHash), index('api_keys_org_agent_idx').on(t.orgId, t.agentId)],
)

export const oauthClients = pgTable(
  'oauth_clients',
  {
    ...commonCols(),
    /** Null for clients registered dynamically (RFC 7591): the org is only chosen at consent time. */
    orgId: uuid('org_id').references(() => orgs.id, { onDelete: 'cascade' }),
    agentId: uuid('agent_id').references(() => agents.id, { onDelete: 'cascade' }),
    clientId: text('client_id').notNull(),
    clientSecretHash: text('client_secret_hash'),
    name: text('name').notNull(),
    redirectUris: text('redirect_uris').array().notNull().default([]),
    scopes: text('scopes').array().notNull().default([]),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  },
  (t) => [uniqueIndex('oauth_clients_client_id_uq').on(t.clientId), index('oauth_clients_org_idx').on(t.orgId)],
)

export const oauthTokens = pgTable(
  'oauth_tokens',
  {
    ...commonCols(),
    orgId: uuid('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
    clientId: text('client_id').notNull(),
    agentId: uuid('agent_id').references(() => agents.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    kind: text('kind').notNull().default('access'),
    scopes: text('scopes').array().notNull().default([]),
    expiresAt: ts('expires_at'),
    revokedAt: ts('revoked_at'),
  },
  (t) => [uniqueIndex('oauth_tokens_hash_uq').on(t.tokenHash), index('oauth_tokens_org_client_idx').on(t.orgId, t.clientId)],
)

/** Single-use OAuth authorization codes (PKCE S256). Only the sha256 hash of the code is stored. */
export const oauthCodes = pgTable(
  'oauth_codes',
  {
    ...commonCols(),
    orgId: uuid('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
    agentId: uuid('agent_id').notNull().references(() => agents.id, { onDelete: 'cascade' }),
    clientId: text('client_id').notNull(),
    codeHash: text('code_hash').notNull(),
    redirectUri: text('redirect_uri').notNull(),
    codeChallenge: text('code_challenge').notNull(),
    scopes: text('scopes').array().notNull().default([]),
    expiresAt: ts('expires_at').notNull(),
    usedAt: ts('used_at'),
  },
  (t) => [uniqueIndex('oauth_codes_hash_uq').on(t.codeHash)],
)
