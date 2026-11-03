import { expect, test } from '@playwright/test'

test('Coach: ask, see a streamed answer, confirm a to-do', async ({ page }) => {
  const title = `call Sam ${Date.now().toString(36)}`

  await page.goto('/sign-in')
  await page.getByLabel('Email').fill('demo@movara.local')
  await page.getByLabel('Password').fill('movara-demo')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForURL('**/vindex**')

  // Open with the sidebar button; ⌘J toggles it.
  const panel = page.getByTestId('coach-panel')
  await expect(panel).toBeHidden()
  await page.getByTestId('coach-toggle').click()
  await expect(panel).toBeVisible()
  await page.keyboard.press('Control+j')
  await expect(panel).toBeHidden()
  await page.keyboard.press('Control+j')
  await expect(panel).toBeVisible()

  // Suggestions are page specific; ask one. A read tool runs by itself.
  await expect(panel.getByRole('button', { name: "What's off track this week?" })).toBeVisible()
  await panel.getByRole('button', { name: "What's off track this week?" }).click()
  await expect(panel.getByTestId('coach-user-message').first()).toContainText("off track this week")
  await expect(panel.getByTestId('coach-tool-chip').first()).toContainText(/Looked at \d+/)
  await expect(panel.getByTestId('coach-assistant-message').last()).toContainText(/I looked at \d+/)

  // A write is proposed on a confirm card; nothing exists until it is approved.
  const box = panel.getByLabel(/^Message /)
  await box.fill(`Please add a to-do to ${title}`)
  await box.press('Enter')
  const card = panel.getByTestId('coach-confirm')
  await expect(card).toBeVisible()
  await expect(card).toContainText(title)
  await expect(card.getByTestId('coach-approve')).toBeVisible()
  await card.getByTestId('coach-approve').click()
  await expect(card).toHaveAttribute('data-status', 'approved')
  await expect(panel.getByTestId('coach-assistant-message').last()).toContainText(/Done/)

  // The to-do exists, created by Coach on behalf of the person.
  await page.goto('/vindex/todos')
  await expect(page.getByText(title).first()).toBeVisible()

  // The conversation is kept in history.
  await page.getByTestId('coach-toggle').click()
  await panel.getByRole('button', { name: 'History' }).click()
  await expect(panel.getByText("What's off track this week?")).toBeVisible()
})
