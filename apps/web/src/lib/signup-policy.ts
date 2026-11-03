/**
 * Who may create an account. Movara installs are invite-only by default: the first person to sign up
 * on a fresh install (before any organization exists) creates the workspace, and everyone after that
 * joins through a single-use invite link from an admin. `MOVARA_ALLOW_SIGNUP=1` reopens self-service
 * sign-up (for hosted, multi-tenant installs).
 */
type Env = Record<string, string | undefined>

export const INVITE_HEADER = 'x-movara-invite'
export const INVITE_ONLY_MESSAGE = 'Sign-up is by invitation only. Ask an admin of your organization for an invite link.'

export function openSignupByEnv(env: Env): boolean {
  return env.MOVARA_ALLOW_SIGNUP?.trim() === '1'
}

/** Pure decision, so it can be tested without a database. */
export function decideSignup(input: { env: Env; hasOrganization: boolean; inviteValid: boolean }): boolean {
  if (openSignupByEnv(input.env)) return true
  if (!input.hasOrganization) return true // first-run bootstrap: the first admin creates the workspace
  return input.inviteValid
}

/** The invite token carried by `next=/invite/<token>` (sign-up launched from an invite link), if any. */
export function inviteTokenFromNext(next: string | undefined | null): string | null {
  const m = /^\/invite\/([A-Za-z0-9_-]{16,200})$/.exec(next ?? '')
  return m ? m[1]! : null
}
