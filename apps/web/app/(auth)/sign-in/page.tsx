import type { Metadata } from 'next'
import Link from 'next/link'
import { safeNext } from '@/lib/safe-next'
import { showDemoLoginHint } from '@/lib/demo'
import { getDb } from '@/lib/db'
import { selfSignupOpen } from '@/lib/signup'
import { inviteTokenFromNext } from '@/lib/signup-policy'
import { AuthCard } from '@/components/shell/auth-card'
import { SignInForm } from './sign-in-form'

export const metadata: Metadata = { title: 'Sign in' }

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next: rawNext } = await searchParams
  const next = safeNext(rawNext)
  const q = next === '/' ? '' : `?next=${encodeURIComponent(next)}`
  // Offer sign-up only where it can succeed: an invite link in `next`, or a workspace that is still open.
  const offerSignup = !!inviteTokenFromNext(next) || (await selfSignupOpen(await getDb()))
  return (
    <AuthCard
      title="Sign in"
      subtitle="Welcome back."
      footer={
        offerSignup ? (
          <>
            New here? <Link className="font-[550] text-accent-text hover:underline" href={`/sign-up${q}`}>Create an account</Link>
          </>
        ) : (
          <>New here? Ask an admin of your organization for an invite link.</>
        )
      }
    >
      <SignInForm next={next} demoHint={showDemoLoginHint(process.env)} />
    </AuthCard>
  )
}
