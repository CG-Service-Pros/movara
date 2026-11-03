import { readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { ORG_HANDLER_ROUTES, ORG_PAGE_ROUTES, classifyOrgPath } from './org-routes'

const orgDir = fileURLToPath(new URL('../../app/(app)/[org]', import.meta.url))
function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? walk(join(dir, f)) : [join(dir, f)]))
}
const toPattern = (file: string) =>
  relative(orgDir, file).split('/').slice(0, -1).filter((s) => !/^\(.*\)$/.test(s)).map((s) => (/^\[[a-z]+\]$/.test(s) ? ':id' : s)).join('/')

describe('org route table', () => {
  it('matches the pages and route handlers on disk (update org-routes.ts when adding a page)', () => {
    const files = walk(orgDir)
    const pages = files.filter((f) => f.endsWith('/page.tsx')).map(toPattern).filter((p) => !p.includes('[...'))
    const handlers = files.filter((f) => f.endsWith('/route.ts')).map(toPattern)
    expect(new Set(pages)).toEqual(new Set(ORG_PAGE_ROUTES.map((r) => r.path)))
    expect(new Set(handlers)).toEqual(new Set(ORG_HANDLER_ROUTES))
  })

  it('classifies org paths', () => {
    const id = '01a1a1a6-e30d-7102-b744-f8823918ddff'
    expect(classifyOrgPath('/')).toEqual({ kind: 'skip' })
    expect(classifyOrgPath('/sign-in')).toEqual({ kind: 'skip' })
    expect(classifyOrgPath('/api/health')).toEqual({ kind: 'skip' })
    expect(classifyOrgPath(`/vindex/meetings/${id}/state`)).toEqual({ kind: 'skip' })
    expect(classifyOrgPath('/vindex')).toEqual({ kind: 'page', slug: 'vindex', module: undefined })
    expect(classifyOrgPath('/vindex/chart')).toEqual({ kind: 'page', slug: 'vindex', module: 'chart' })
    expect(classifyOrgPath(`/vindex/meetings/${id}`)).toEqual({ kind: 'page', slug: 'vindex', module: 'meetings', id: { kind: 'meeting', value: id } })
    expect(classifyOrgPath('/vindex/does-not-exist')).toEqual({ kind: 'not_found' })
    expect(classifyOrgPath('/vindex/meetings/not-a-uuid')).toEqual({ kind: 'not_found' })
    expect(classifyOrgPath('/vindex/settings/agents/123')).toEqual({ kind: 'not_found' })
    expect(classifyOrgPath('/vindex/priorities/extra')).toEqual({ kind: 'not_found' })
  })
})
