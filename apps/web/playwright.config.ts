import { defineConfig, devices } from '@playwright/test'

// Isolated dev server: own port, own build dir, fresh embedded database on every run.
const PORT = Number(process.env.E2E_PORT ?? 3301)
const BASE = `http://localhost:${PORT}`
const IN_CI = !!process.env.CI

export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  forbidOnly: IN_CI,
  retries: IN_CI ? 1 : 0,
  reporter: IN_CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: BASE,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    // Real Chrome locally; the bundled Chromium in CI (`playwright install chromium`).
    // Override with E2E_BROWSER_CHANNEL=chromium|msedge|...
    ...devices['Desktop Chrome'],
    channel: process.env.E2E_BROWSER_CHANNEL ?? (IN_CI ? undefined : 'chrome'),
  },
  webServer: {
    command: `rm -rf .data/e2e .next-e2e && pnpm exec next dev -p ${PORT}`,
    url: `${BASE}/sign-in`,
    reuseExistingServer: false,
    timeout: 180_000,
    stdout: 'ignore',
    env: {
      NEXT_DIST_DIR: '.next-e2e',
      DATABASE_URL: 'pglite://./.data/e2e',
      BETTER_AUTH_SECRET: 'e2e-secret-not-for-production-0123456789',
      BETTER_AUTH_URL: BASE,
      APP_URL: BASE,
      MOTION_SEED_DEMO: '1',
      NEXT_TELEMETRY_DISABLED: '1',
    },
  },
})
