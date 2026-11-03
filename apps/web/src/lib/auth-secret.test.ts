import { describe, expect, it } from 'vitest'
import { resolveAuthSecret } from './auth-secret'

const good = 'x'.repeat(40)

describe('resolveAuthSecret', () => {
  it('has no fallback in production', () => {
    expect(() => resolveAuthSecret({ NODE_ENV: 'production' })).toThrow(/BETTER_AUTH_SECRET/)
    expect(() => resolveAuthSecret({ NODE_ENV: 'production', BETTER_AUTH_SECRET: 'short' })).toThrow()
    expect(() => resolveAuthSecret({ NODE_ENV: 'production', BETTER_AUTH_SECRET: 'movara-dev-secret-change-me-in-production-0000' })).toThrow()
    expect(resolveAuthSecret({ NODE_ENV: 'production', BETTER_AUTH_SECRET: good })).toBe(good)
  })
  it('uses a labelled dev secret only outside production', () => {
    expect(resolveAuthSecret({ NODE_ENV: 'development' })).toContain('movara-dev-secret')
    expect(resolveAuthSecret({ NODE_ENV: 'development', BETTER_AUTH_SECRET: good })).toBe(good)
  })
})
