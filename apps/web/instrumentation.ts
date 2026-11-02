/** Runs once when the Next.js server starts. Wires the meeting-recap email sender (SMTP when SMTP_HOST is set, console otherwise). */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  const { configureEmail } = await import('./src/lib/email')
  const mode = configureEmail()
  console.log(`[motion] recap email: ${mode}`)
}
