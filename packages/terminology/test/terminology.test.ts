import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { resolveTerm, previewImport, TerminologyPack, TERM_KEYS, STANDARD_PACK } from '../src'

const root = join(__dirname, '..', '..', '..')
const eos = JSON.parse(readFileSync(join(root, 'packs', 'eos', 'pack.json'), 'utf8'))

describe('standard pack', () => {
  it('covers every term key', () => {
    for (const k of TERM_KEYS) expect(STANDARD_PACK.terms[k], k).toBeDefined()
  })
})

describe('resolveTerm', () => {
  const pack = TerminologyPack.parse(eos)
  it('falls back to Standard', () => {
    expect(resolveTerm('priority').plural).toBe('Priorities')
  })
  it('uses the active pack', () => {
    expect(resolveTerm('priority', pack).plural).toBe('Rocks')
  })
  it('prefers org overrides over the pack, per field', () => {
    const t = resolveTerm('priority', pack, { priority: { plural: 'Bets' } })
    expect(t.plural).toBe('Bets')
    expect(t.singular).toBe('Rock')
  })
  it('keeps Standard terms the pack omits', () => {
    expect(resolveTerm('milestone', pack).singular).toBe(STANDARD_PACK.terms.milestone!.singular)
  })
})

describe('previewImport', () => {
  it('validates the EOS pack and lists changes', () => {
    const r = previewImport(eos)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.changes.some((c) => c.key === 'priority' && c.to === 'Rocks')).toBe(true)
  })
  it('rejects invalid packs', () => {
    const r = previewImport({ id: 'x', terms: { nope: {} } })
    expect(r.ok).toBe(false)
  })
  it('reports no change when importing the active pack', () => {
    const pack = TerminologyPack.parse(eos)
    const r = previewImport(eos, pack)
    expect(r.ok && r.changes).toEqual([])
  })
})
