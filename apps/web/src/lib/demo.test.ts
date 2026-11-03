import { describe, expect, it } from 'vitest'
import { shouldSeedDemo, showDemoLoginHint } from './demo'

describe('demo data policy', () => {
  it('never auto-seeds a production server, even on embedded PGlite', () => {
    expect(shouldSeedDemo({ NODE_ENV: 'production' }, 'pglite')).toBe(false)
    expect(shouldSeedDemo({ NODE_ENV: 'production', MOVARA_SEED_DEMO: '' }, 'pglite')).toBe(false)
    expect(shouldSeedDemo({ NODE_ENV: 'production' }, 'postgres')).toBe(false)
  })

  it('auto-seeds embedded PGlite in development only', () => {
    expect(shouldSeedDemo({ NODE_ENV: 'development' }, 'pglite')).toBe(true)
    expect(shouldSeedDemo({}, 'pglite')).toBe(true)
    expect(shouldSeedDemo({ NODE_ENV: 'development' }, 'postgres')).toBe(false)
  })

  it('honours an explicit MOVARA_SEED_DEMO in every environment', () => {
    expect(shouldSeedDemo({ NODE_ENV: 'production', MOVARA_SEED_DEMO: '1' }, 'pglite')).toBe(true)
    expect(shouldSeedDemo({ NODE_ENV: 'production', MOVARA_SEED_DEMO: '1' }, 'postgres')).toBe(true)
    expect(shouldSeedDemo({ NODE_ENV: 'development', MOVARA_SEED_DEMO: '0' }, 'pglite')).toBe(false)
  })

  it('shows the demo login hint only where the demo org can exist', () => {
    expect(showDemoLoginHint({ NODE_ENV: 'production' })).toBe(false)
    expect(showDemoLoginHint({ NODE_ENV: 'production', MOVARA_SEED_DEMO: '0' })).toBe(false)
    expect(showDemoLoginHint({ NODE_ENV: 'production', MOVARA_SEED_DEMO: '1' })).toBe(true)
    expect(showDemoLoginHint({ NODE_ENV: 'development' })).toBe(true)
    expect(showDemoLoginHint({ NODE_ENV: 'development', MOVARA_SEED_DEMO: '0' })).toBe(false)
  })
})
