/** Runs once when the Next.js server starts. Wires the meeting-recap email sender (SMTP when SMTP_HOST is set, console otherwise). */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  // Fail fast: never run a production server on the built-in development secret.
  if (process.env.NODE_ENV === 'production' && process.env.NEXT_PHASE !== 'phase-production-build') {
    const { assertProductionSecret } = await import('./src/lib/auth-secret')
    assertProductionSecret(process.env.BETTER_AUTH_SECRET)
  }
  const { configureEmail } = await import('./src/lib/email')
  const mode = configureEmail()
  console.log(`[movara] recap email: ${mode}`)
  // Meeting-notes extraction (to-dos, issues, headlines, decisions). The extractor checks each org's AI configuration at call time.
  const { setNotesExtractor } = await import('@movara/core')
  const { createNotesExtractor } = await import('@movara/coach')
  setNotesExtractor(createNotesExtractor())
}
