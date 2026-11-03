import { z } from 'zod'
import { MovaraError, type Ctx, type Terms } from '@movara/core'
import { allowed } from './scopes'
import { buildTools } from './tools'

export type RegistryTool = {
  /** Canonical tool name. Never changes. */
  name: string
  /** Rendered with the org's terminology. */
  description: string
  inputSchema: z.ZodObject<z.ZodRawShape>
  annotations: {
    readOnly: boolean
    /** Writes to the workspace. A UI/engine should confirm these with the person unless the request was explicit. */
    consequential: boolean
  }
  /** Validates `input` against `inputSchema` (throws MovaraError `validation`), then runs as `ctx`. Returns plain JSON. */
  run(input: unknown): Promise<unknown>
}

/**
 * The tools `ctx` may call, independent of any transport. The MCP server is built from this list, and the AI engine
 * (Coach) feeds the very same list to the model, so both doors expose identical tools, schemas and permissions.
 */
export function getToolRegistry(ctx: Ctx, terms: Terms): RegistryTool[] {
  return buildTools(terms)
    .filter((t) => allowed(ctx, t.scope))
    .map((t) => {
      const inputSchema = z.object(t.shape)
      return {
        name: t.name,
        description: t.description,
        inputSchema,
        annotations: { readOnly: !!t.readOnly, consequential: !t.readOnly },
        run: async (input: unknown) => {
          const parsed = inputSchema.safeParse(input ?? {})
          if (!parsed.success) {
            throw new MovaraError('validation', parsed.error.issues.map((i) => `${i.path.join('.') || 'input'}: ${i.message}`).join('; '), { issues: parsed.error.issues })
          }
          return t.run(ctx, parsed.data)
        },
      }
    })
}
