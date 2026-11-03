import { describe, expect, it } from 'vitest'
import { postgresOptions } from '../src/client'

describe('postgresOptions', () => {
  it('keeps prepared statements for direct and session-pooler connections', () => {
    expect(postgresOptions('postgres://u:p@db.abc.supabase.co:5432/postgres', {}).prepare).toBe(true)
    expect(postgresOptions('postgres://u:p@localhost:5432/movara', {}).prepare).toBe(true)
  })
  it('disables them for transaction poolers', () => {
    expect(postgresOptions('postgres://u:p@aws-0-eu.pooler.supabase.com:6543/postgres', {}).prepare).toBe(false)
    expect(postgresOptions('postgres://u:p@host:6543/postgres', {}).prepare).toBe(false)
    const o = postgresOptions('postgres://u:p@host:5432/postgres?pgbouncer=true&sslmode=require', {})
    expect(o.prepare).toBe(false)
    expect(o.url).not.toContain('pgbouncer')
    expect(o.url).toContain('sslmode=require')
  })
  it('honours DATABASE_PREPARE', () => {
    expect(postgresOptions('postgres://u:p@host:6543/postgres', { DATABASE_PREPARE: '1' }).prepare).toBe(true)
    expect(postgresOptions('postgres://u:p@host:5432/postgres', { DATABASE_PREPARE: '0' }).prepare).toBe(false)
  })
})
