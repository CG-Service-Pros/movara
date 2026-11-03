import 'server-only'
import { getEmailSender } from '@movara/core'

/** Absolute invite link for a token (APP_URL, falling back to BETTER_AUTH_URL / localhost). */
export function inviteUrl(token: string, env: NodeJS.ProcessEnv = process.env): string {
  const base = (env.APP_URL ?? env.BETTER_AUTH_URL ?? 'http://localhost:3000').replace(/\/+$/, '')
  return `${base}/invite/${encodeURIComponent(token)}`
}

/** Emails the invite link, but only when SMTP is configured (the link is a credential: never logged to the console). */
export async function sendInviteEmail(m: { to: string; name: string; orgName: string; link: string }, env: NodeJS.ProcessEnv = process.env): Promise<boolean> {
  if (!env.SMTP_HOST) return false
  try {
    await getEmailSender().send({
      to: [m.to],
      subject: `You're invited to ${m.orgName} on Movara`,
      text: `Hi ${m.name},\n\nYou have been invited to ${m.orgName} on Movara. Accept the invitation (single use, expires in 14 days):\n${m.link}\n`,
    })
    return true
  } catch {
    return false
  }
}
