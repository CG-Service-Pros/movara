'use client'

import { useState, useTransition } from 'react'
import { Button } from '@movara/ui/button'
import { Field } from '@movara/ui/field'
import { Input } from '@movara/ui/input'
import { authClient } from '@/lib/auth-client'

export function ForgotPasswordForm() {
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const email = String(new FormData(e.currentTarget).get('email')).trim()
    setError(null)
    start(async () => {
      try {
        const { error } = await authClient.requestPasswordReset({ email, redirectTo: '/reset-password' })
        if (error) {
          setError(error.status === 429 ? 'Too many requests. Please wait a minute and try again.' : error.status === 503 ? 'Password recovery is unavailable. Please contact your administrator.' : 'Could not request a reset link. Please try again.')
          return
        }
        setSent(true)
      } catch {
        setError('Could not connect. Check your connection and try again.')
      }
    })
  }

  if (sent) return <p role="status" className="text-sm text-body">If an account exists for that email, you will receive a reset link. Check your inbox and spam folder. The link expires in 30 minutes.</p>

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3.5" aria-busy={pending}>
      <Field label="Email" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="email" required disabled={pending} />
      </Field>
      {error && <p role="alert" className="text-sm text-danger-text">{error}</p>}
      <Button variant="primary" type="submit" loading={pending} className="mt-1 w-full justify-center">Send reset link</Button>
    </form>
  )
}
