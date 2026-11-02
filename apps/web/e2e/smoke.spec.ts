import { expect, test } from '@playwright/test'

test('demo login lands in the Vindex shell', async ({ page }) => {
  await page.goto('/sign-in')
  await page.getByLabel('Email').fill('demo@motion.local')
  await page.getByLabel('Password').fill('motion-demo')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForURL('**/vindex**')
  await expect(page.getByText('Priorities').first()).toBeVisible()
})
