import type { Metadata } from 'next'
import Link from 'next/link'
import { AuthCard } from '@/components/shell/auth-card'
import { ResetPasswordForm } from './reset-password-form'

export const metadata: Metadata = { title: 'Reset password', robots: { index: false, follow: false }, referrer: 'no-referrer' }

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string; error?: string }> }) {
  const { token, error } = await searchParams
  return (
    <AuthCard title="Reset password" subtitle="Choose a new password for your account." footer={<Link className="text-accent-text hover:underline" href="/sign-in">Back to sign in</Link>}>
      {typeof token === 'string' && token && !error ? <ResetPasswordForm token={token} /> : (
        <div className="space-y-3 text-sm text-body">
          <p role="alert">This reset link is invalid or has expired.</p>
          <Link className="text-accent-text hover:underline" href="/forgot-password">Request a new reset link</Link>
        </div>
      )}
    </AuthCard>
  )
}
