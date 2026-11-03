import { z } from 'zod'
import type { ToolSpec } from './types'

type Json = Record<string, any>

const KEEP = new Set(['type', 'properties', 'required', 'additionalProperties', 'items', 'enum', 'const', 'anyOf', 'description'])

/**
 * Convert a JSON Schema into OpenAI strict mode: every property required (optional ones become nullable), no extra
 * properties, unsupported keywords dropped. Returns null when the schema cannot be expressed (records, $ref, oneOf...).
 */
function strictify(node: Json, required: boolean): Json | null {
  if (!node || typeof node !== 'object') return null
  if (node.$ref || node.oneOf || node.allOf || node.not || node.patternProperties || node.propertyNames) return null
  const out: Json = {}
  for (const [k, v] of Object.entries(node)) if (KEEP.has(k)) out[k] = v
  if (node.anyOf) {
    const opts = (node.anyOf as Json[]).map((o) => strictify(o, true))
    if (opts.some((o) => !o)) return null
    out.anyOf = opts
    delete out.type
  }
  if (node.type === 'object' || node.properties) {
    if (node.additionalProperties && typeof node.additionalProperties === 'object') return null // record
    const props: Json = {}
    const req = new Set<string>(node.required ?? [])
    for (const [k, v] of Object.entries<Json>(node.properties ?? {})) {
      const s = strictify(v, req.has(k))
      if (!s) return null
      props[k] = s
    }
    out.type = 'object'
    out.properties = props
    out.required = Object.keys(props)
    out.additionalProperties = false
  } else if (node.type === 'array') {
    const items = strictify(node.items ?? {}, true)
    if (!items) return null
    out.items = items
  } else if (!node.anyOf && !node.enum && !node.const && !['string', 'number', 'integer', 'boolean', 'null'].includes(node.type)) {
    return null
  }
  if (!required) return { anyOf: [out, { type: 'null' }], ...(out.description ? { description: out.description } : {}) }
  return out
}

/** Drop the nulls the model sent for properties that were optional in the original schema. */
export function restoreArgs(original: Json, value: unknown): unknown {
  if (Array.isArray(value)) return value.map((v) => restoreArgs(original.items ?? {}, v))
  if (value && typeof value === 'object') {
    const req = new Set<string>(original.required ?? [])
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const sub = original.properties?.[k] ?? {}
      if (v === null && !req.has(k)) continue
      out[k] = restoreArgs(sub, v)
    }
    return out
  }
  return value
}

export type PreparedTool = { spec: ToolSpec; original: Json }

/** zod -> function-tool parameters. Strict when the schema allows it, else the plain JSON Schema (zod re-validates anyway). */
export function prepareTool(name: string, description: string, schema: z.ZodType, omit: string[] = []): PreparedTool {
  const raw = z.toJSONSchema(schema, { io: 'input', unrepresentable: 'any' }) as Json
  delete raw.$schema
  for (const k of omit) delete raw.properties?.[k]
  if (raw.required) raw.required = (raw.required as string[]).filter((k) => !omit.includes(k))
  const strict = strictify(raw, true)
  return {
    original: raw,
    spec: strict ? { name, description, parameters: strict, strict: true } : { name, description, parameters: raw, strict: false },
  }
}
