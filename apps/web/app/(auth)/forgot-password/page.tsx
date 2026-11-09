import type { Metadata } from 'next'
import Link from 'next/link'
import { AuthCard } from '@/components/shell/auth-card'
import { ForgotPasswordForm } from './forgot-password-form'

export const metadata: Metadata = { title: 'Forgot password', robots: { index: false, follow: false } }

export default function ForgotPasswordPage() {
  return (
    <AuthCard title="Forgot password?" subtitle="Enter your account email to request a reset link." footer={<Link className="text-accent-text hover:underline" href="/sign-in">Back to sign in</Link>}>
      <ForgotPasswordForm />
    </AuthCard>
  )
}
