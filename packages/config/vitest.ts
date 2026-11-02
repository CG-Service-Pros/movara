import { defineConfig } from 'vitest/config'

/** Shared Vitest config. PGlite migrations can take a few seconds on first run. */
export const baseVitestConfig = defineConfig({
  test: {
    environment: 'node',
    testTimeout: 30_000,
    hookTimeout: 60_000,
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'test/**/*.test.ts'],
  },
})

export default baseVitestConfig
