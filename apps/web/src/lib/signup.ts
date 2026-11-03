import 'server-only'
import { getInvite, listMembershipsForUser } from '@movara/core'
import { orgs, type Db } from '@movara/db'
import { decideOrgCreation, decideSignup, openSignupByEnv } from './signup-policy'

async function hasOrganization(db: Db): Promise<boolean> {
  return (await db.select({ id: orgs.id }).from(orgs).limit(1)).length > 0
}

/** Server-side gate used by the Better Auth sign-up hook. */
export async function signupAllowed(db: Db, inviteToken: string | null): Promise<boolean> {
  if (openSignupByEnv(process.env)) return true
  const inviteValid = inviteToken ? !!(await getInvite(db, inviteToken)) : false
  return decideSignup({ env: process.env, hasOrganization: await hasOrganization(db), inviteValid })
}

/** Whether to advertise self-service sign-up (the "Create an account" link) to someone without an invite. */
export async function selfSignupOpen(db: Db): Promise<boolean> {
  return decideSignup({ env: process.env, hasOrganization: await hasOrganization(db), inviteValid: false })
}

/** Server-side gate for /onboarding and the org switcher's "New organization". */
export async function orgCreationAllowed(db: Db, userId: string): Promise<boolean> {
  if (openSignupByEnv(process.env)) return true
  const memberships = await listMembershipsForUser(db, userId)
  return decideOrgCreation({ env: process.env, hasOrganization: await hasOrganization(db), ownsAnOrganization: memberships.some((m) => m.role === 'owner') })
}
