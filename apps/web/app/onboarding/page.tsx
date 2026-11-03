import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { listMembershipsForUser } from '@movara/core'
import { AuthCard } from '@/components/shell/auth-card'
import { getDb } from '@/lib/db'
import { getSession } from '@/lib/session'
import { orgCreationAllowed } from '@/lib/signup'
import { OnboardingForm } from './onboarding-form'
import { SignOutButton } from './sign-out-button'

export const metadata: Metadata = { title: 'Create your organization' }

export default async function OnboardingPage() {
  const session = await getSession()
  if (!session) redirect('/sign-in')
  const db = await getDb()
  if (!(await orgCreationAllowed(db, session.user.id))) {
    const memberships = await listMembershipsForUser(db, session.user.id)
    return (
      <AuthCard
        title={memberships.length ? 'Organizations are created by owners' : 'No organization yet'}
        subtitle={
          memberships.length
            ? 'Only an owner of an existing organization can create a new one. Ask an owner if your team needs its own workspace.'
            : `${session.user.email} is not a member of any organization. Ask an admin to send you an invite link.`
        }
        footer={memberships.length ? <Link className="font-[550] text-accent-text hover:underline" href={`/${memberships[0]!.slug}`}>Back to {memberships[0]!.name}</Link> : <SignOutButton />}
      >
        <span />
      </AuthCard>
    )
  }
  return (
    <AuthCard title="Create your organization" subtitle="This is your company's workspace. You can change everything later.">
      <OnboardingForm />
    </AuthCard>
  )
}
