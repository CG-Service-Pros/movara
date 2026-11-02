import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  resolve: {
    alias: [
      { find: /^@\/lib\/(.*)$/, replacement: fileURLToPath(new URL('./src/lib/$1', import.meta.url)) },
      { find: /^@\/api\/(.*)$/, replacement: fileURLToPath(new URL('./src/api/$1', import.meta.url)) },
      { find: /^@\/(.*)$/, replacement: fileURLToPath(new URL('./$1', import.meta.url)) },
    ],
  },
  test: { environment: 'node', testTimeout: 30_000, include: ['src/**/*.test.ts', 'test/**/*.test.ts'] },
})
