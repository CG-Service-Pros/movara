import { describe, expect, it } from 'vitest'
import { decideSignup, inviteTokenFromNext } from './signup-policy'

describe('sign-up policy', () => {
  it('is open on a fresh install so the first admin can create the workspace', () => {
    expect(decideSignup({ env: {}, hasOrganization: false, inviteValid: false })).toBe(true)
  })
  it('is invite-only once an organization exists', () => {
    expect(decideSignup({ env: {}, hasOrganization: true, inviteValid: false })).toBe(false)
    expect(decideSignup({ env: {}, hasOrganization: true, inviteValid: true })).toBe(true)
  })
  it('MOVARA_ALLOW_SIGNUP=1 reopens self-service sign-up; anything else keeps it closed', () => {
    expect(decideSignup({ env: { MOVARA_ALLOW_SIGNUP: '1' }, hasOrganization: true, inviteValid: false })).toBe(true)
    expect(decideSignup({ env: { MOVARA_ALLOW_SIGNUP: 'true' }, hasOrganization: true, inviteValid: false })).toBe(false)
    expect(decideSignup({ env: { MOVARA_ALLOW_SIGNUP: '0' }, hasOrganization: true, inviteValid: false })).toBe(false)
  })
  it('extracts invite tokens only from same-origin invite paths', () => {
    expect(inviteTokenFromNext('/invite/abcdefghijklmnopqrstuvwxyz012345')).toBe('abcdefghijklmnopqrstuvwxyz012345')
    expect(inviteTokenFromNext('/invite/short')).toBeNull()
    expect(inviteTokenFromNext('/vindex')).toBeNull()
    expect(inviteTokenFromNext('//evil.example/invite/abcdefghijklmnopqrstuvwxyz')).toBeNull()
    expect(inviteTokenFromNext(undefined)).toBeNull()
  })
})
