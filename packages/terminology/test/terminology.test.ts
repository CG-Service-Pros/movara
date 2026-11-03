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

const KEYS = ['weekly', 'quarterly', 'annual', 'alignment', 'custom']
const minutes = (a: { minutes: number }[]) => a.reduce((n, x) => n + x.minutes, 0)

describe('meeting templates', () => {
  const eosPack = TerminologyPack.parse(eos)
  it('Standard and EOS ship the same five templates with neutral and EOS names', () => {
    expect(STANDARD_PACK.meetingTemplates!.map((t) => t.key)).toEqual(KEYS)
    expect(eosPack.meetingTemplates!.map((t) => t.key)).toEqual(KEYS)
    expect(STANDARD_PACK.meetingTemplates!.map((t) => t.name)).toEqual(['Weekly meeting', 'Quarterly planning', 'Annual planning', 'Alignment check-in', 'Custom meeting'])
    expect(eosPack.meetingTemplates!.map((t) => t.name)).toEqual(['Level 10 Meeting', 'Quarterly Session', 'Annual Planning', 'Same Page Meeting', 'Custom Meeting'])
    expect(eosPack.attribution).toMatch(/EOS Worldwide/)
  })
  it('has the default agendas and minutes', () => {
    for (const pack of [STANDARD_PACK, eosPack]) {
      const t = Object.fromEntries(pack.meetingTemplates!.map((x) => [x.key, x.agenda]))
      expect(t.weekly!.map((a) => a.minutes)).toEqual([5, 5, 5, 5, 5, 60, 5])
      expect(t.quarterly!.map((a) => [a.term, a.minutes])).toEqual([['check_in', 15], ['quarter_review', 30], ['vision_review', 60], ['priority_setting', 120], ['issue_solving', 105], ['next_steps', 10], ['wrap_up', 15]])
      expect(t.alignment!.map((a) => [a.term, a.minutes])).toEqual([['check_in', 10], ['issues_list_build', 20], ['issue_solving', 80], ['wrap_up', 10]])
      expect(t.annual!.filter((a) => a.day === 1).map((a) => a.minutes)).toEqual([30, 60, 90, 120, 30, 15])
      expect(t.annual!.filter((a) => a.day === 2).map((a) => a.minutes)).toEqual([15, 120, 120, 120, 15, 15])
      expect(t.annual!.every((a) => a.day === 1 || a.day === 2)).toBe(true)
      expect(minutes(t.alignment!)).toBe(120)
      expect(t.custom).toEqual([])
    }
  })
  it('only uses known term keys and rejects a bad day', () => {
    const bad = { ...eos, meetingTemplates: [{ key: 'x', name: 'X', agenda: [{ term: 'check_in', minutes: 5, day: 3 }] }] }
    expect(TerminologyPack.safeParse(bad).success).toBe(false)
  })
  it('renames the new section terms in EOS', () => {
    expect(resolveTerm('quarterly_planning', eosPack).singular).toBe('Quarterly Session')
    expect(resolveTerm('alignment_meeting', eosPack).singular).toBe('Same Page Meeting')
    expect(resolveTerm('quarterly_planning').singular).toBe('Quarterly planning')
    expect(resolveTerm('day_two').singular).toBe('Day 2')
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
