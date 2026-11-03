import {
  actingPersonId, coachCtxFor, ctxForPerson, getAiClientConfig, isMovaraError, recordUsage, type AiClientConfig, type Ctx, type ExtractedItems, type NotesExtractor, type NotesExtractorInput,
} from '@movara/core'
import { createModel, estimateCostUsd } from './model'
import { isMockMode, mockExtract, MockModel } from './mock'
import type { CoachModel } from './types'

const nullable = (t: Record<string, unknown>) => ({ anyOf: [t, { type: 'null' }] })
const str = { type: 'string' }
const obj = (properties: Record<string, unknown>) => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false })

/** Strict JSON schema for the structured output. */
export const EXTRACTION_SCHEMA = obj({
  todos: { type: 'array', items: obj({ title: str, owner: nullable(str), dueDate: nullable(str), description: nullable(str) }) },
  issues: { type: 'array', items: obj({ title: str, owner: nullable(str), description: nullable(str), longTerm: { type: 'boolean' } }) },
  headlines: { type: 'array', items: obj({ title: str, owner: nullable(str), kind: { type: 'string', enum: ['customer', 'employee', 'general'] } }) },
  decisions: { type: 'array', items: obj({ text: str }) },
})

const INSTRUCTIONS = `You turn meeting notes into structured action items for a team operating system.
Extract only what is clearly in the notes; never invent items, owners or dates. If nothing qualifies, return empty arrays.
- todos: concrete commitments someone will do ("Maya to send the deck by Friday"). title is a short imperative sentence. owner is the name or email exactly as written in the notes, or null. dueDate is YYYY-MM-DD only when a specific date can be derived from the meeting date, else null.
- issues: unresolved problems or questions that need the team to discuss and solve (not tasks). longTerm is true only for strategic, not-this-quarter matters.
- headlines: good news or notable updates worth sharing (customer wins, employee news, general). kind says which.
- decisions: choices the group made.
Keep each title under 120 characters. Do not duplicate the same item across lists.`

type Raw = { todos?: any[]; issues?: any[]; headlines?: any[]; decisions?: any[] }
const clean = (v: any) => (v === null || v === undefined || v === '' ? undefined : v)

/** Drop nulls the structured output uses for "absent" so the result matches `CaptureItemsInput`. */
export function normalizeExtraction(raw: Raw): ExtractedItems {
  const strip = <T extends Record<string, any>>(o: T): T => Object.fromEntries(Object.entries(o).filter(([, v]) => clean(v) !== undefined)) as T
  return {
    todos: (raw.todos ?? []).filter((t) => t?.title).map(strip),
    issues: (raw.issues ?? []).filter((t) => t?.title).map(strip),
    headlines: (raw.headlines ?? []).filter((t) => t?.title).map(strip),
    decisions: (raw.decisions ?? []).filter((t) => t?.text).map(strip),
  }
}

export type ExtractorOptions = {
  /** Override the model (tests). */
  model?: (cfg: AiClientConfig) => CoachModel
}

/**
 * The `NotesExtractor` the app registers at startup. It is process-wide, so it resolves the org's AI configuration on every call
 * and returns `null` (extraction unavailable) when AI is not set up. Usage is recorded under feature 'extract'.
 */
export function createNotesExtractor(opts: ExtractorOptions = {}): NotesExtractor {
  return async (input: NotesExtractorInput, ctx: Ctx) => {
    const personId = actingPersonId(ctx)
    if (!personId) return null
    const person = await ctxForPerson(ctx.db, ctx.orgId, personId)
    const coach = await coachCtxFor(person)
    const mock = isMockMode()
    let cfg: AiClientConfig | null = null
    try {
      cfg = await getAiClientConfig(coach)
    } catch (e) {
      if (!(isMovaraError(e) && e.code === 'validation')) throw e // over the monthly limit: let capture report it
      if (!mock) return null // AI not configured for this org
    }
    if (mock && !opts.model) {
      const tokens = Math.ceil((input.notes.length + (input.transcript?.length ?? 0)) / 4)
      await recordUsage(person, { feature: 'extract', model: 'mock-coach', inputTokens: tokens, outputTokens: 10 })
      return mockExtract(input.notes, input.transcript)
    }

    const model = (opts.model ?? createModel)(cfg!)
    const people = input.people.map((p) => `- ${p.name} <${p.email}>`).join('\n')
    const text = [
      `Meeting: ${input.meeting.title} (${input.meeting.team}), ${input.meeting.date}`,
      `People in the organization:\n${people}`,
      `Notes:\n${input.notes.slice(0, 120_000)}`,
      input.transcript ? `Transcript:\n${input.transcript.slice(0, 200_000)}` : '',
    ].filter(Boolean).join('\n\n')
    const r = await model.json({ instructions: INSTRUCTIONS, input: text, schemaName: 'meeting_items', schema: EXTRACTION_SCHEMA })
    await recordUsage(person, { feature: 'extract', model: model.modelName, inputTokens: r.usage.inputTokens, outputTokens: r.usage.outputTokens, costEstimateUsd: estimateCostUsd(model.modelName, r.usage) })
    return normalizeExtraction(r.value as Raw)
  }
}
