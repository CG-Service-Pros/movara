import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'

// Next.js + React + hooks + jsx-a11y (via eslint-config-next) and typescript-eslint.
export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // `_`-prefixed names are intentionally unused (rest-destructuring to drop a key, placeholder args).
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', destructuredArrayIgnorePattern: '^_', ignoreRestSiblings: true }],
      // React Compiler rules (react-hooks v7) stay at their default (error). To reset state when a prop changes,
      // use `useOnChange` (src/lib/use-on-change.ts) rather than an effect.
    },
  },
  globalIgnores(['.next/**', '.next-*/**', 'out/**', 'build/**', 'next-env.d.ts', 'playwright-report/**', 'test-results/**', '.data/**']),
])
