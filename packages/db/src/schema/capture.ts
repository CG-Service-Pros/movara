import { index, jsonb, pgEnum, pgTable, text, uuid } from 'drizzle-orm/pg-core'
import { commonCols, ts } from './_common'
import { meetings } from './meetings'
import { orgs } from './org'
import type { ActorJson } from '../types'

export const captureKind = pgEnum('capture_kind', ['todo', 'issue', 'headline', 'decision'])
export const captureStatus = pgEnum('capture_status', ['proposed', 'accepted', 'rejected', 'edited'])

/** Organized notes (and optionally the transcript) pushed into a meeting by a person, a notes agent (Granola, Plaud, …) or Coach. */
export const meetingNotes = pgTable(
  'meeting_notes',
  {
    ...commonCols(),
    orgId: uuid('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
    meetingId: uuid('meeting_id').notNull().references(() => meetings.id, { onDelete: 'cascade' }),
    /** 'granola' | 'plaud' | 'manual' | 'coach' | any short app name. */
    sourceApp: text('source_app').notNull().default('manual'),
    sourceUrl: text('source_url'),
    title: text('title'),
    notesMarkdown: text('notes_markdown').notNull().default(''),
    transcript: text('transcript'),
    capturedByActor: jsonb('captured_by_actor').$type<ActorJson>(),
  },
  (t) => [index('meeting_notes_org_meeting_idx').on(t.orgId, t.meetingId, t.createdAt)],
)

export type CapturePayload = {
  /** to-do / issue title, headline text or decision text. */
  title: string
  /** The owner as written by the source ("me", "Maya", "maya@acme.com"). */
  ownerRef?: string | null
  resolvedOwnerId?: string | null
  dueDate?: string | null
  description?: string | null
  /** The meeting's team. */
  teamId?: string | null
  /** Issues: put on the long-term list. */
  longTerm?: boolean
  /** Headlines: customer | employee | general. */
  headlineKind?: 'customer' | 'employee' | 'general'
}

/** An action item extracted from meeting notes, waiting for (or past) a human decision. */
export const captureItems = pgTable(
  'capture_items',
  {
    ...commonCols(),
    orgId: uuid('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
    meetingId: uuid('meeting_id').notNull().references(() => meetings.id, { onDelete: 'cascade' }),
    notesId: uuid('notes_id').notNull().references(() => meetingNotes.id, { onDelete: 'cascade' }),
    kind: captureKind('kind').notNull(),
    payload: jsonb('payload').$type<CapturePayload>().notNull(),
    status: captureStatus('status').notNull().default('proposed'),
    /** The to-do / issue / headline created on accept. */
    createdEntityId: uuid('created_entity_id'),
    decidedBy: jsonb('decided_by').$type<ActorJson | null>(),
    decidedAt: ts('decided_at'),
  },
  (t) => [index('capture_items_org_status_idx').on(t.orgId, t.status), index('capture_items_meeting_idx').on(t.orgId, t.meetingId)],
)
