import type { Metadata } from 'next'
import Link from 'next/link'
import { safeNext } from '@/lib/safe-next'
import { AuthCard } from '@/components/shell/auth-card'
import { SignUpForm } from './sign-up-form'

export const metadata: Metadata = { title: 'Create account' }

export default async function SignUpPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeNext((await searchParams).next)
  const q = next === '/' ? '' : `?next=${encodeURIComponent(next)}`
  return (
    <AuthCard
      title="Create your account"
      subtitle="Then set up your organization."
      footer={
        <>
          Already have an account? <Link className="font-[550] text-accent-text hover:underline" href={`/sign-in${q}`}>Sign in</Link>
        </>
      }
    >
      <SignUpForm next={next} />
    </AuthCard>
  )
}
