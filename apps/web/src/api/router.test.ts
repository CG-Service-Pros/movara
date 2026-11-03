import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createTestDb, seedTestOrg } from '@movara/core/testing'
import type { DbHandle } from '@movara/db'

let db: DbHandle
vi.mock('@/lib/db', () => ({ getDb: async () => db }))

const { handleApi, rateLimited } = await import('./router')

const call = (path: string, init: RequestInit & { key?: string } = {}) => {
  const { key, ...rest } = init
  const headers = new Headers(rest.headers)
  if (key) headers.set('authorization', `Bearer ${key}`)
  return handleApi(new Request(`http://localhost/api/v1/${path}`, { ...rest, headers }), path.split('?')[0]!.split('/'))
}

let orgA: Awaited<ReturnType<typeof seedTestOrg>>
let readKey = ''
let writeKey = ''
let otherKey = ''
beforeAll(async () => {
  db = await createTestDb()
  orgA = await seedTestOrg(db)
  readKey = (await orgA.addAgent('Reader', ['read'])).apiKey
  writeKey = (await orgA.addAgent('Writer', ['read', 'write:todos'])).apiKey
  const orgB = await seedTestOrg(db)
  otherKey = (await orgB.addAgent('B', ['read', 'write:todos'])).apiKey
})
afterAll(async () => { await db.$close() })

describe('REST /api/v1 hardening', () => {
  it('requires a valid bearer token', async () => {
    expect((await call('todos')).status).toBe(401)
    expect((await call('todos', { key: 'mk_live_nope' })).status).toBe(401)
    const res = await call('todos', { key: 'garbage' })
    expect(res.status).toBe(401)
    expect(JSON.stringify(await res.json())).not.toMatch(/stack|at .*\(/)
  })

  it('enforces scopes: a read-only key cannot write', async () => {
    const res = await call('todos', { key: readKey, method: 'POST', body: JSON.stringify({ title: 'x' }) })
    expect(res.status).toBe(403)
    expect((await call('todos', { key: writeKey, method: 'POST', body: JSON.stringify({ title: 'x' }) })).status).toBe(201)
  })

  it('does not expose another org\'s records', async () => {
    const created = await call('todos', { key: writeKey, method: 'POST', body: JSON.stringify({ title: 'A only' }) })
    const id = (await created.json()).data[0].id as string
    expect((await call(`todos/${id}`, { key: writeKey })).status).toBe(200)
    expect((await call(`todos/${id}`, { key: otherKey })).status).toBe(404)
    expect((await call(`todos/${id}`, { key: otherKey, method: 'DELETE' })).status).toBe(404)
    expect((await call(`todos/${id}`, { key: otherKey, method: 'PATCH', body: JSON.stringify({ title: 'hax' }) })).status).toBe(404)
    const list = await (await call('todos', { key: otherKey })).json()
    expect(JSON.stringify(list)).not.toContain('A only')
  })

  it('validates input and never leaks internals', async () => {
    expect((await call('todos/not-a-uuid', { key: writeKey })).status).toBe(404)
    expect((await call('todos?ownerId=zzz', { key: writeKey })).status).toBe(422)
    expect((await call('todos?limit=-5', { key: writeKey })).status).toBe(422)
    expect((await call('todos', { key: writeKey, method: 'POST', body: '{not json' })).status).toBe(422)
    expect((await call('todos', { key: writeKey, method: 'POST', body: JSON.stringify({ title: '' }) })).status).toBe(422)
    expect((await call('todos', { key: writeKey, method: 'POST', body: JSON.stringify({ title: 'x'.repeat(1_100_000) }) })).status).toBe(422)
    expect((await call('todos', { key: writeKey, method: 'POST', headers: { 'idempotency-key': 'k'.repeat(500) }, body: '{}' })).status).toBe(422)
    expect((await call('nope', { key: writeKey })).status).toBe(404)
    expect((await call('todos/%E0%A4%A', { key: writeKey })).status).toBe(404)
  })

  it('rate limits', () => {
    const now = Date.now()
    for (let i = 0; i < 5; i++) expect(rateLimited('t', 5, 60_000, now)).toBe(false)
    expect(rateLimited('t', 5, 60_000, now)).toBe(true)
    expect(rateLimited('t', 5, 60_000, now + 61_000)).toBe(false)
  })
})
