import type { Metadata } from 'next'
import Link from 'next/link'
import { AuthCard } from '@/components/shell/auth-card'
import { SignUpForm } from './sign-up-form'

export const metadata: Metadata = { title: 'Create account' }

export default function SignUpPage() {
  return (
    <AuthCard
      title="Create your account"
      subtitle="Then set up your organization."
      footer={
        <>
          Already have an account? <Link className="font-[550] text-accent-text hover:underline" href="/sign-in">Sign in</Link>
        </>
      }
    >
      <SignUpForm />
    </AuthCard>
  )
}
