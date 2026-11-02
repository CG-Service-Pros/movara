import standard from '../packs/standard.json'
import { TerminologyPack, type TermKey, type TermOverrides, type Term } from './schema'

const STANDARD = TerminologyPack.parse(standard)

/** Resolve a term: org override → active pack → Standard. Never throws for a known key. */
export function resolveTerm(key: TermKey, pack?: TerminologyPack, overrides?: TermOverrides): Term {
  const base = STANDARD.terms[key]!
  const fromPack = pack?.terms[key] ?? {}
  const fromOrg = overrides?.[key] ?? {}
  return { ...base, ...fromPack, ...fromOrg } as Term
}

/** Validate an imported pack (file upload, URL or npm package) and report what it changes. */
export function previewImport(input: unknown, current?: TerminologyPack) {
  const parsed = TerminologyPack.safeParse(input)
  if (!parsed.success) return { ok: false as const, errors: parsed.error.issues }
  const changes = Object.entries(parsed.data.terms).flatMap(([key, term]) => {
    const before = resolveTerm(key as TermKey, current)
    return before.plural === term.plural && before.singular === term.singular ? [] : [{ key, from: before.plural, to: term.plural }]
  })
  return { ok: true as const, pack: parsed.data, changes }
}
