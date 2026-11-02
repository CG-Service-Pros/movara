import { z } from 'zod'

/**
 * Canonical concept keys. The app, emails, exports and MCP tool descriptions
 * never hard-code a label; they ask the active terminology for one of these.
 * Adding a key is a minor version bump of this package; packs that omit a
 * key fall back to the Standard pack.
 */
export const TERM_KEYS = [
  // Vision
  'vision_plan', 'core_values', 'core_focus', 'long_range_target', 'marketing_strategy',
  'three_year_picture', 'one_year_plan', 'quarterly_plan', 'long_term_issues',
  // People and structure
  'accountability_chart', 'seat', 'leadership_team', 'people_review',
  // Execution
  'priority', 'milestone', 'scorecard', 'metric', 'issue', 'issues_list', 'todo', 'headline',
  // Meetings
  'weekly_meeting', 'check_in', 'metric_review', 'priority_review', 'headline_review',
  'todo_review', 'issue_solving', 'wrap_up', 'planning_session', 'alignment_meeting',
  // Issue-solving steps
  'identify', 'discuss', 'solve',
  // Processes
  'core_process',
] as const
export type TermKey = (typeof TERM_KEYS)[number]

/** One term. `short` is for tight UI (sidebar, chips); falls back to `singular`/`plural`. */
export const Term = z.object({
  singular: z.string().min(1).max(60),
  plural: z.string().min(1).max(60),
  short: z.string().min(1).max(24).optional(),
  /** One line shown in tooltips, empty states and MCP tool descriptions. */
  description: z.string().max(280).optional(),
})
export type Term = z.infer<typeof Term>

const AgendaItem = z.object({ term: z.enum(TERM_KEYS), minutes: z.number().int().min(1).max(480) })

export const TerminologyPack = z.object({
  $schema: z.string().optional(),
  /** Reverse-DNS or npm-style id, unique per pack: "motion.standard", "community.eos". */
  id: z.string().regex(/^[a-z0-9][a-z0-9._-]{2,63}$/),
  name: z.string().min(1).max(60),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  locale: z.string().default('en'),
  description: z.string().max(500).optional(),
  author: z.string().max(120).optional(),
  license: z.string().max(60).optional(),
  /** Shown in settings and on exports when the pack is active (e.g. trademark notices). */
  attribution: z.string().max(500).optional(),
  /** Pack format version this file targets. */
  format: z.literal(1),
  terms: z.partialRecord(z.enum(TERM_KEYS), Term),
  /** Optional meeting templates using the pack's names and default lengths. */
  meetingTemplates: z.array(z.object({
    key: z.string().regex(/^[a-z0-9_-]+$/),
    name: z.string(),
    agenda: z.array(AgendaItem).min(1),
  })).optional(),
  /** Optional status label overrides. Status *values* never change, only labels. */
  statuses: z.record(z.string(), z.string()).optional(),
})
export type TerminologyPack = z.infer<typeof TerminologyPack>

/** Org-level overrides applied on top of the active pack (Settings → Terminology → Custom). */
export const TermOverrides = z.partialRecord(z.enum(TERM_KEYS), Term.partial())
export type TermOverrides = z.infer<typeof TermOverrides>
