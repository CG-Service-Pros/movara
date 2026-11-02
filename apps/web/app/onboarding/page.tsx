import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { AuthCard } from '@/components/shell/auth-card'
import { getSession } from '@/lib/session'
import { OnboardingForm } from './onboarding-form'

export const metadata: Metadata = { title: 'Create your organization' }

export default async function OnboardingPage() {
  const session = await getSession()
  if (!session) redirect('/sign-in')
  return (
    <AuthCard title="Create your organization" subtitle="This is your company's workspace. You can change everything later.">
      <OnboardingForm />
    </AuthCard>
  )
}
