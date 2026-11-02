export type EmailMessage = { to: string[]; subject: string; text: string; html?: string }

/** Implement this to deliver meeting recaps (SMTP, Resend, ...). Core ships a no-op and a console sender. */
export interface EmailSender {
  send(message: EmailMessage): Promise<void>
}

export const noopEmailSender: EmailSender = { async send() {} }

export const consoleEmailSender: EmailSender = {
  async send(m) {
    console.log(`[email] to=${m.to.join(', ')} subject=${m.subject}\n${m.text}`)
  },
}

// Kept on globalThis so every bundle of core in the same process (Next.js instrumentation, route handlers, server actions) shares it.
const g = globalThis as unknown as { __motionEmailSender?: EmailSender }
/** Set the process-wide default sender (used by `endMeeting` unless one is passed). */
export function setEmailSender(sender: EmailSender | null): void {
  g.__motionEmailSender = sender ?? noopEmailSender
}
export const getEmailSender = (): EmailSender => g.__motionEmailSender ?? noopEmailSender
