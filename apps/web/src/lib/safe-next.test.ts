import { describe, expect, it } from 'vitest'
import { safeNext } from './safe-next'

describe('safeNext', () => {
  it('allows same-origin relative paths', () => {
    for (const ok of ['/', '/vindex', '/vindex/issues?x=1#a', '/invite/abc_DEF-123', '/a%20b']) expect(safeNext(ok)).toBe(ok)
  })
  it('rejects open-redirect shapes', () => {
    const bad = [
      '//evil.com', '/\\evil.com', '/\\/evil.com', 'https://evil.com', 'http://evil.com', 'javascript:alert(1)', 'evil.com', '',
      '%2f%2fevil.com', '/%2fevil.com', '/%5cevil.com', '/%252fevil.com', '/%255cevil.com', '/%09/evil.com', '/\t/evil.com', '/\n/evil.com',
      ' //evil.com', '///evil.com', '/foo\\bar',
    ]
    for (const b of bad) expect(safeNext(b), b).toBe('/')
    expect(safeNext(undefined)).toBe('/')
    expect(safeNext(null, '/x')).toBe('/x')
  })
})
