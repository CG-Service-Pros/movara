import { expect, test } from '@playwright/test'

test('invites are claimed only through the single-use token link; next param cannot leave the origin', async ({ browser, page, baseURL }) => {
  const stamp = Date.now().toString(36)
  const email = `invitee-${stamp}@example.com`

  // Admin creates an invitation and copies the link.
  await page.goto('/sign-in')
  await page.getByLabel('Email').fill('demo@motion.local')
  await page.getByLabel('Password').fill('motion-demo')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForURL('**/vindex**')
  await page.goto('/vindex/settings/members')
  await page.getByLabel('Name', { exact: true }).fill('Ivy Invitee')
  await page.locator('#inv-email').fill(email)
  await page.getByRole('button', { name: 'Invite', exact: true }).click()
  const link = await page.getByLabel('Invite link').inputValue()
  expect(link).toMatch(/\/invite\/[A-Za-z0-9_-]{30,}$/)
  const path = new URL(link).pathname

  // Plain sign-up with the invited address gets no org access.
  const ctx = await browser.newContext({ baseURL })
  const p = await ctx.newPage()
  await p.goto('/sign-up')
  await p.getByLabel('Name').fill('Ivy Squatter')
  await p.getByLabel('Work email').fill(email)
  await p.getByLabel('Password').fill('correct-horse-battery')
  await p.getByRole('button', { name: 'Create account' }).click()
  await p.waitForURL('**/onboarding**')
  await p.goto('/vindex')
  await expect(p).not.toHaveURL(/\/vindex$/)
  // The token redeems it (single use).
  await p.goto(path)
  await p.getByRole('button', { name: /^Join / }).click()
  await p.waitForURL('**/vindex**')
  await expect(p.getByText('My week').first()).toBeVisible()
  await p.goto(path)
  await expect(p.getByText('Invitation unavailable')).toBeVisible()
  await ctx.close()

  // Open redirect: a hostile `next` is ignored after sign-in.
  const ctx2 = await browser.newContext({ baseURL })
  const q = await ctx2.newPage()
  await q.goto('/sign-in?next=' + encodeURIComponent('/\\evil.example.com'))
  await q.getByLabel('Email').fill('demo@motion.local')
  await q.getByLabel('Password').fill('motion-demo')
  await q.getByRole('button', { name: 'Sign in' }).click()
  await q.waitForURL('**/vindex**')
  expect(new URL(q.url()).origin).toBe(new URL(baseURL!).origin)
  await ctx2.close()
})
