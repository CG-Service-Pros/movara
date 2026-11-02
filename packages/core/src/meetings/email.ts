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

let defaultSender: EmailSender = noopEmailSender
/** Set the process-wide default sender (used by `endMeeting` unless one is passed). */
export function setEmailSender(sender: EmailSender | null): void {
  defaultSender = sender ?? noopEmailSender
}
export const getEmailSender = (): EmailSender => defaultSender
