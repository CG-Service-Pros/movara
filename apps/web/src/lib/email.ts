import 'server-only'
import nodemailer from 'nodemailer'
import { consoleEmailSender, setEmailSender, type EmailSender } from '@motion/core'

/** SMTP sender for meeting recaps. Env: SMTP_HOST, SMTP_PORT (default 587; 465 = TLS), SMTP_USER, SMTP_PASS, SMTP_FROM. */
export function createSmtpSender(env: NodeJS.ProcessEnv = process.env): EmailSender {
  const port = Number(env.SMTP_PORT ?? 587)
  const transport = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS ?? '' } : undefined,
  })
  const from = env.SMTP_FROM || env.SMTP_USER || 'Motion <no-reply@localhost>'
  return {
    async send(m) {
      await transport.sendMail({ from, to: m.to, subject: m.subject, text: m.text, html: m.html })
    },
  }
}

/** SMTP when SMTP_HOST is set, otherwise log recaps to the console. Called once at server startup (instrumentation.ts). */
export function configureEmail(env: NodeJS.ProcessEnv = process.env): 'smtp' | 'console' {
  if (env.SMTP_HOST) {
    setEmailSender(createSmtpSender(env))
    return 'smtp'
  }
  setEmailSender(consoleEmailSender)
  return 'console'
}
