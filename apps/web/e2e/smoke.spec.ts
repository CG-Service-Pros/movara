import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { expect, test, type Page } from '@playwright/test'

const here = dirname(fileURLToPath(import.meta.url))
const EOS_PACK = resolve(here, '../../../packs/eos/pack.json')


test('demo flow: priorities, scorecard, issues, terminology pack', async ({ page }) => {
  const stamp = Date.now().toString(36)

  // --- Sign in as the seeded demo user -------------------------------------------------
  await page.goto('/sign-in')
  await page.getByLabel('Email').fill('demo@movara.local')
  await page.getByLabel('Password').fill('movara-demo')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForURL('**/vindex**')

  // --- Home ----------------------------------------------------------------------------
  await expect(page.getByText('My week').first()).toBeVisible()

  // --- Priorities: create one ----------------------------------------------------------
  await page.getByRole('link', { name: 'Priorities' }).first().click()
  await page.waitForURL('**/vindex/priorities**')
  const title = `E2E priority ${stamp}`
  await page.getByRole('button', { name: /^New priority$/i }).first().click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Title').fill(title)
  await dialog.getByRole('button', { name: /^Create/ }).click()
  await expect(dialog).toBeHidden()
  await expect(page.getByText(title).first()).toBeVisible()

  // --- Scorecard renders ---------------------------------------------------------------
  await page.getByRole('link', { name: 'Scorecard' }).first().click()
  await page.waitForURL('**/vindex/scorecard**')
  await expect(page.getByRole('button', { name: /^Add metric$/i }).first()).toBeVisible()

  // --- Issues: create one --------------------------------------------------------------
  await page.getByRole('link', { name: 'Issues' }).first().click()
  await page.waitForURL('**/vindex/issues**')
  const issue = `E2E issue ${stamp}`
  await page.getByRole('button', { name: /^New issue$/i }).first().click()
  const issueDialog = page.getByRole('dialog')
  await issueDialog.getByLabel('Title').fill(issue)
  await issueDialog.getByRole('button', { name: /^Create issue$/i }).click()
  await expect(issueDialog).toBeHidden()
  await expect(page.getByText(issue).first()).toBeVisible()

  // --- Settings > Terminology: import the EOS pack from file ----------------------------
  await page.goto('/vindex/settings/terminology')
  await page.getByRole('button', { name: 'Import pack' }).click()
  const importDialog = page.getByRole('dialog')
  await importDialog.getByRole('radio', { name: 'File' }).click()
  await importDialog.getByLabel('Pack file').setInputFiles(EOS_PACK)
  await expect(importDialog.getByTestId('pack-preview')).toContainText('EOS')
  await importDialog.getByRole('button', { name: 'Apply pack' }).click()
  await expect(importDialog.getByRole('button', { name: 'Applied' })).toBeVisible()
  await importDialog.getByRole('button', { name: 'Close', exact: true }).last().click()

  // The sidebar now speaks EOS.
  await expect(page.getByRole('link', { name: 'Rocks' }).first()).toBeVisible()

  // --- Revert --------------------------------------------------------------------------
  await page.getByRole('button', { name: /^Revert to / }).click()
  await expect(page.getByRole('link', { name: 'Rocks' })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Priorities' }).first()).toBeVisible()
})
