import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  use: { baseURL: process.env.APP_URL ?? 'http://localhost:3000' },
  webServer: { command: 'pnpm dev', url: 'http://localhost:3000/sign-in', reuseExistingServer: true, timeout: 120_000 },
})
