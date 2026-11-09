import 'server-only'
import { createSmtpSender } from './email'

/** Recovery tokens must only go to the mailbox, never the recap console/no-op sender. */
export async function sendPasswordResetEmail(email: string, url: string) {
  if (!process.env.SMTP_HOST) throw new Error('Password recovery requires SMTP_HOST')
  await createSmtpSender().send({
    to: [email],
    subject: 'Reset your Movara password',
    text: `Use this link to set a new Movara password:\n\n${url}\n\nThis link expires in 30 minutes and can only be used once. If you did not request a reset, you can ignore this email. Your password will stay the same.`,
  })
}
