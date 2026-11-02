import { z } from 'zod'

const actor = z.object({ type: z.enum(['person', 'agent']), id: z.string(), onBehalfOf: z.string().optional() })

/** Who proposed/approved a piece of content. `approvedBy` is stored at approval time; legacy goals without it are backfilled from the approval when reading. */
export const Provenance = z.object({
  proposedBy: actor,
  approvalId: z.string().optional(),
  approvedBy: actor.optional(),
  source: z.string().max(500).optional(),
  at: z.string().optional(),
})
export type Provenance = z.infer<typeof Provenance>

export const Goal = z.object({ text: z.string().trim().min(1).max(500), provenance: Provenance.optional() })
export type Goal = z.infer<typeof Goal>

const Measurable = z.object({ name: z.string().trim().min(1).max(120), value: z.string().max(120) })
const dateOrNull = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable()

const Picture = z.object({
  date: dateOrNull.default(null),
  revenue: z.string().max(60).default(''),
  profit: z.string().max(60).default(''),
  measurables: z.array(Measurable).max(30).default([]),
  goals: z.array(Goal).max(30).default([]),
})

/** Typed content of a vision revision (stored under `content.sections`). Every section is optional. */
export const VisionSectionsSchema = z.object({
  coreValues: z.array(z.string().trim().min(1).max(200)).max(20),
  coreFocus: z.object({ purpose: z.string().max(500).default(''), niche: z.string().max(500).default('') }),
  longRangeTarget: z.object({ text: z.string().max(500).default(''), date: dateOrNull.default(null) }),
  marketing: z.object({
    targetMarket: z.string().max(1000).default(''),
    uniques: z.array(z.string().trim().min(1).max(300)).max(10).default([]),
    provenProcess: z.string().max(1000).default(''),
    guarantee: z.string().max(1000).default(''),
  }),
  threeYear: Picture,
  oneYear: Picture,
  quarterly: z.object({
    quarter: z.string().regex(/^\d{4}-Q[1-4]$/),
    revenue: z.string().max(60).default(''),
    profit: z.string().max(60).default(''),
    priorityIds: z.array(z.uuid()).max(30).default([]),
  }),
  longTermIssueIds: z.array(z.uuid()).max(50),
})
export type VisionSections = Partial<{ [K in keyof typeof VisionSectionsSchema.shape]: z.output<(typeof VisionSectionsSchema.shape)[K]> }>
export const VisionSectionsPatch = VisionSectionsSchema.partial()
export type VisionSectionKey = keyof typeof VisionSectionsSchema.shape
export const VISION_SECTION_KEYS = Object.keys(VisionSectionsSchema.shape) as VisionSectionKey[]

/** Legacy / terminology-key aliases accepted by `vision.propose_change` (the seeded approval uses `one_year_plan`). */
export const SECTION_ALIASES: Record<string, VisionSectionKey> = {
  core_values: 'coreValues',
  core_focus: 'coreFocus',
  long_range_target: 'longRangeTarget',
  marketing_strategy: 'marketing',
  three_year_picture: 'threeYear',
  one_year_plan: 'oneYear',
  quarterly_plan: 'quarterly',
  long_term_issues: 'longTermIssueIds',
}

export const SECTION_LABELS: Record<VisionSectionKey, string> = {
  coreValues: 'core values',
  coreFocus: 'core focus',
  longRangeTarget: 'long-range target',
  marketing: 'marketing strategy',
  threeYear: '3-year picture',
  oneYear: '1-year plan',
  quarterly: 'quarterly plan',
  longTermIssueIds: 'long-term issues',
}

export const sectionKeySchema = z
  .enum([...VISION_SECTION_KEYS, ...(Object.keys(SECTION_ALIASES) as [string, ...string[]])] as [string, ...string[]])
  .transform((k) => (SECTION_ALIASES[k] ?? k) as VisionSectionKey)
