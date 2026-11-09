import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createDb, migrate, session, verification, type DbHandle } from '@movara/db'
import { eq } from 'drizzle-orm'

vi.mock('server-only', () => ({}))
const delivery = vi.hoisted(() => ({ send: vi.fn(), pending: [] as Array<() => Promise<void>> }))
vi.mock('./email', () => ({ createSmtpSender: () => ({ send: delivery.send }) }))
vi.mock('next/server', () => ({ after: (task: () => Promise<void>) => delivery.pending.push(task) }))
let db: DbHandle
vi.mock('./db', () => ({ getDb: async () => db }))
import { getAuth } from './auth'
import { sendPasswordResetEmail } from './password-recovery-email'

const baseURL = 'http://localhost:3000'
const email = 'recovery-test@example.com'
const oldPassword = 'original-password-123'
const newPassword = 'replacement-password-456'

async function post(path: string, body: unknown) {
  return (await getAuth()).handler(new Request(`${baseURL}/api/auth${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', origin: baseURL }, body: JSON.stringify(body),
  }))
}
async function requestReset(address = email) {
  const response = await post('/request-password-reset', { email: address, redirectTo: '/reset-password' })
  for (const task of delivery.pending.splice(0)) await task()
  return response
}
function latestToken() {
  const message = delivery.send.mock.calls.at(-1)![0] as { text: string }
  const url = new URL(message.text.match(/http[^\s]+/)![0])
  expect(url.origin).toBe(baseURL)
  expect(url.searchParams.get('callbackURL')).toBe('/reset-password')
  return url.pathname.split('/').at(-1)!
}

beforeAll(async () => {
  vi.stubEnv('SMTP_HOST', 'smtp.example.test')
  vi.stubEnv('APP_URL', baseURL)
  vi.stubEnv('BETTER_AUTH_URL', baseURL)
  vi.stubEnv('BETTER_AUTH_SECRET', 'test-only-password-recovery-secret-0123456789')
  db = createDb('memory')
  await migrate(db)
  const response = await post('/sign-up/email', { name: 'Recovery Test', email, password: oldPassword })
  expect(response.status).toBe(200)
})
afterAll(async () => {
  await db.$close()
  delete (globalThis as { __movaraAuth?: unknown }).__movaraAuth
  vi.unstubAllEnvs()
})

describe('password recovery using the real Better Auth routes and database', () => {
  it('delivers a single-use link, changes the password, and revokes sessions', async () => {
    expect((await db.select().from(session)).length).toBeGreaterThan(0)
    const response = await requestReset()
    expect(response.status).toBe(200)
    expect(delivery.send.mock.calls.at(-1)![0].to).toEqual([email])
    const token = latestToken()
    const [stored] = await db.select().from(verification).where(eq(verification.identifier, `reset-password:${token}`))
    expect(stored!.expiresAt.getTime() - Date.now()).toBeGreaterThan(29 * 60_000)
    expect(stored!.expiresAt.getTime() - Date.now()).toBeLessThanOrEqual(30 * 60_000)
    const callback = await (await getAuth()).handler(new Request(`${baseURL}/api/auth/reset-password/${token}?callbackURL=%2Freset-password`))
    expect(callback.status).toBe(302)
    expect(new URL(callback.headers.get('location')!).searchParams.get('token')).toBe(token)
    expect((await post('/reset-password', { token, newPassword })).status).toBe(200)
    expect(await db.select().from(session)).toHaveLength(0)
    expect((await post('/reset-password', { token, newPassword: oldPassword })).status).toBe(400)
    expect((await post('/sign-in/email', { email, password: oldPassword })).status).toBe(401)
    expect((await post('/sign-in/email', { email, password: newPassword })).status).toBe(200)
  })

  it('returns the same response for unknown accounts without sending email', async () => {
    const known = await requestReset()
    const sent = delivery.send.mock.calls.length
    const unknown = await requestReset('nobody@example.com')
    expect(unknown.status).toBe(known.status)
    expect(await unknown.json()).toEqual(await known.json())
    expect(delivery.send.mock.calls.length).toBe(sent)
  })

  it('rejects expired tokens and short passwords', async () => {
    await requestReset()
    const token = latestToken()
    expect((await post('/reset-password', { token, newPassword: 'short' })).status).toBe(400)
    await db.update(verification).set({ expiresAt: new Date(Date.now() - 60_000) }).where(eq(verification.identifier, `reset-password:${token}`))
    expect((await post('/reset-password', { token, newPassword })).status).toBe(400)
    expect((await post('/sign-in/email', { email, password: newPassword })).status).toBe(200)
  })

  it('rejects external callback URLs', async () => {
    expect((await post('/request-password-reset', { email, redirectTo: 'https://evil.example/reset' })).status).toBe(403)
  })

  it('fails closed for all accounts when SMTP is missing and never logs recovery links', async () => {
    vi.stubEnv('SMTP_HOST', '')
    const sent = delivery.send.mock.calls.length
    expect((await requestReset()).status).toBe(503)
    expect((await requestReset('nobody@example.com')).status).toBe(503)
    await expect(sendPasswordResetEmail(email, 'https://example.com/secret')).rejects.toThrow('SMTP_HOST')
    expect(delivery.send.mock.calls.length).toBe(sent)
    vi.stubEnv('SMTP_HOST', 'smtp.example.test')
  })
})
