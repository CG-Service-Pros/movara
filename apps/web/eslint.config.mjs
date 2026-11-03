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
      // React Compiler readiness rules (react-hooks v7). The flagged effects sync props into local state on purpose
      // (dialogs resetting on open, polling, scroll restore); rewriting them changes behavior, so they stay visible as
      // warnings until each is refactored deliberately.
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/refs': 'warn',
    },
  },
  globalIgnores(['.next/**', '.next-*/**', 'out/**', 'build/**', 'next-env.d.ts', 'playwright-report/**', 'test-results/**', '.data/**']),
])
