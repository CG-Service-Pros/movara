import type { Metadata } from 'next'
import Link from 'next/link'
import { safeNext } from '@/lib/safe-next'
import { AuthCard } from '@/components/shell/auth-card'
import { SignInForm } from './sign-in-form'

export const metadata: Metadata = { title: 'Sign in' }

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next: rawNext } = await searchParams
  const next = safeNext(rawNext)
  const q = next === '/' ? '' : `?next=${encodeURIComponent(next)}`
  return (
    <AuthCard
      title="Sign in"
      subtitle="Welcome back."
      footer={
        <>
          New here? <Link className="font-[550] text-accent-text hover:underline" href={`/sign-up${q}`}>Create an account</Link>
        </>
      }
    >
      <SignInForm next={next} />
    </AuthCard>
  )
}
