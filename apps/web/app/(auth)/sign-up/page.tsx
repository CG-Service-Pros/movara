import type { Metadata } from 'next'
import Link from 'next/link'
import { getInvite } from '@movara/core'
import { safeNext } from '@/lib/safe-next'
import { AuthCard } from '@/components/shell/auth-card'
import { getDb } from '@/lib/db'
import { selfSignupOpen } from '@/lib/signup'
import { inviteTokenFromNext } from '@/lib/signup-policy'
import { SignUpForm } from './sign-up-form'

export const metadata: Metadata = { title: 'Create account', referrer: 'no-referrer' }

export default async function SignUpPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeNext((await searchParams).next)
  const q = next === '/' ? '' : `?next=${encodeURIComponent(next)}`
  const db = await getDb()
  const token = inviteTokenFromNext(next)
  const invite = token ? await getInvite(db, token) : null
  const signIn = (
    <>
      Already have an account? <Link className="font-[550] text-accent-text hover:underline" href={`/sign-in${q}`}>Sign in</Link>
    </>
  )

  if (!invite && !(await selfSignupOpen(db))) {
    return (
      <AuthCard title="Invitation required" subtitle="Accounts on this workspace are created from an invite link. Ask an admin of your organization to invite you." footer={signIn}>
        <span />
      </AuthCard>
    )
  }

  return (
    <AuthCard title="Create your account" subtitle={invite ? `Then join ${invite.orgName}.` : 'Then set up your organization.'} footer={signIn}>
      <SignUpForm next={next} />
    </AuthCard>
  )
}
