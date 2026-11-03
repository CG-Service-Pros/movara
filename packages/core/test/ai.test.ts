import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { orgAiSettings, type DbHandle } from '@movara/db'
import {
  assertWithinTokenLimit, coachCtxFor, decryptSecret, encryptSecret, getAiClientConfig, getAiSettings, getCoachProfile, getUsageSummary, listAudit, recordUsage, updateAiSettings,
  appendCoachMessage, createCoachThread, getCoachThread, listCoachThreads,
} from '../src'
import { createTestDb, seedTestOrg } from '../src/testing'

let db: DbHandle
beforeAll(async () => { db = await createTestDb() })
afterAll(async () => { await db.$close() })

const KEY = 'sk-test-1234567890abcdef'

describe('encryption', () => {
  it('round-trips and fails closed on tamper or a different secret', () => {
    const e = encryptSecret(KEY, 'secret-a')
    expect(e.ciphertext).not.toContain('sk-test')
    expect(decryptSecret(e, 'secret-a')).toBe(KEY)
    expect(() => decryptSecret(e, 'secret-b')).toThrow(/cannot be decrypted/)
    expect(() => decryptSecret({ ...e, tag: encryptSecret(KEY, 'secret-a').tag }, 'secret-a')).toThrow()
    expect(encryptSecret(KEY, 'secret-a').iv).not.toBe(e.iv) // random IV
  })
})

describe('AI settings', () => {
  it('defaults, admin-only, never returns the key, stores it encrypted, audits without it', async () => {
    const o = await seedTestOrg(db)
    const member = await o.addPerson('Mem Ber')
    expect(await getAiSettings(o.ctx)).toMatchObject({ enabled: false, provider: 'openai', model: 'gpt-5.6-luna', reasoningEffort: 'low', coachName: 'Coach', hasKey: false, keyLast4: null, monthlyTokenLimit: null })
    await expect(getAiSettings(member.ctx)).rejects.toMatchObject({ code: 'forbidden' })
    await expect(updateAiSettings(member.ctx, { enabled: true })).rejects.toMatchObject({ code: 'forbidden' })
    const agent = await o.addAgent('Bot', ['read', 'admin'])
    await expect(updateAiSettings(agent.ctx, { apiKey: KEY })).rejects.toMatchObject({ code: 'forbidden' })

    const v = await updateAiSettings(o.ctx, { enabled: true, apiKey: KEY, coachName: 'Sage', monthlyTokenLimit: 1000 })
    expect(v).toMatchObject({ enabled: true, hasKey: true, keyLast4: 'cdef', coachName: 'Sage' })
    expect(JSON.stringify(v)).not.toContain(KEY)
    expect(JSON.stringify(await getAiSettings(o.ctx))).not.toContain('sk-test')

    const [row] = await db.select().from(orgAiSettings).where(eq(orgAiSettings.orgId, o.org.id))
    expect(row!.apiKeyCiphertext).toBeTruthy()
    expect(JSON.stringify(row)).not.toContain(KEY)
    const audit = await listAudit(o.ctx, { command: 'ai.update_settings' })
    expect(JSON.stringify(audit)).not.toContain('sk-test')

    // key kept when omitted, removed on null
    expect((await updateAiSettings(o.ctx, { model: 'gpt-x' })).hasKey).toBe(true)
    expect((await updateAiSettings(o.ctx, { apiKey: null })).hasKey).toBe(false)
  })

  it('getAiClientConfig decrypts for members and Coach, refuses other agents, and validates readiness', async () => {
    const o = await seedTestOrg(db)
    const member = await o.addPerson('Mem Ber')
    await expect(getAiClientConfig(member.ctx)).rejects.toMatchObject({ code: 'validation' }) // off
    await updateAiSettings(o.ctx, { enabled: true })
    await expect(getAiClientConfig(member.ctx)).rejects.toThrow(/No AI API key/)
    await updateAiSettings(o.ctx, { apiKey: KEY, provider: 'openai_compatible' })
    await expect(getAiClientConfig(member.ctx)).rejects.toThrow(/base URL/)
    await updateAiSettings(o.ctx, { baseUrl: 'http://localhost:11434/v1' })
    const cfg = await getAiClientConfig(member.ctx)
    expect(cfg).toMatchObject({ apiKey: KEY, provider: 'openai_compatible', baseUrl: 'http://localhost:11434/v1', model: 'gpt-5.6-luna' })
    expect(await getCoachProfile(member.ctx)).toEqual({ enabled: true, ready: true, coachName: 'Coach', coachPersonality: expect.stringContaining('Warm') })
    expect((await getAiClientConfig(await coachCtxFor(member.ctx))).apiKey).toBe(KEY)
    const other = await o.addAgent('Other', ['read'])
    await expect(getAiClientConfig(other.ctx)).rejects.toMatchObject({ code: 'forbidden' })
    await expect(updateAiSettings(o.ctx, { baseUrl: 'javascript:alert(1)' })).rejects.toMatchObject({ code: 'validation' })
  })
})

describe('usage', () => {
  it('summarizes the month and blocks over the limit with a clear message', async () => {
    const o = await seedTestOrg(db)
    const member = await o.addPerson('Mem Ber')
    await updateAiSettings(o.ctx, { enabled: true, apiKey: KEY, monthlyTokenLimit: 1000 })
    await recordUsage(member.ctx, { feature: 'coach', model: 'm', inputTokens: 300, outputTokens: 100, costEstimateUsd: 0.01 })
    await recordUsage(member.ctx, { feature: 'extract', model: 'm', inputTokens: 200, outputTokens: 50, costEstimateUsd: 0.005 })
    const s = await getUsageSummary(o.ctx)
    expect(s).toMatchObject({ inputTokens: 500, outputTokens: 150, totalTokens: 650, limit: 1000, remaining: 350, overLimit: false })
    expect(s.costEstimateUsd).toBeCloseTo(0.015)
    expect(s.byFeature.coach).toMatchObject({ inputTokens: 300, outputTokens: 100 })
    await expect(getUsageSummary(member.ctx)).rejects.toMatchObject({ code: 'forbidden' })
    await assertWithinTokenLimit(member.ctx)
    await getAiClientConfig(member.ctx)
    await recordUsage(member.ctx, { feature: 'coach', model: 'm', inputTokens: 300, outputTokens: 100 })
    await expect(assertWithinTokenLimit(member.ctx)).rejects.toMatchObject({ code: 'forbidden', message: expect.stringMatching(/monthly AI limit/) })
    await expect(getAiClientConfig(member.ctx)).rejects.toMatchObject({ code: 'forbidden' })
    expect((await getAiClientConfig(member.ctx, { checkLimit: false })).apiKey).toBe(KEY)
    await updateAiSettings(o.ctx, { monthlyTokenLimit: null })
    await assertWithinTokenLimit(member.ctx)
    // other org unaffected
    const o2 = await seedTestOrg(db)
    expect((await getUsageSummary(o2.ctx)).totalTokens).toBe(0)
  })
})

describe('coach threads', () => {
  it('are private to the person', async () => {
    const o = await seedTestOrg(db)
    const a = await o.addPerson('Ann A')
    const b = await o.addPerson('Bob B')
    const t = await createCoachThread(a.ctx, { title: 'Hi', context: { page: 'issues' } })
    await appendCoachMessage(a.ctx, t.id, { role: 'user', content: { text: 'hello' } })
    await appendCoachMessage(await coachCtxFor(a.ctx), t.id, { role: 'assistant', content: { text: 'hi' }, usage: { inputTokens: 1 } })
    const full = await getCoachThread(a.ctx, t.id)
    expect(full.messages.map((m) => m.role)).toEqual(['user', 'assistant'])
    expect(await listCoachThreads(b.ctx)).toHaveLength(0)
    await expect(getCoachThread(b.ctx, t.id)).rejects.toMatchObject({ code: 'not_found' })
  })
})
