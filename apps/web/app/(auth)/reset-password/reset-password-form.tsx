'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { Button } from '@movara/ui/button'
import { Field } from '@movara/ui/field'
import { Input } from '@movara/ui/input'
import { authClient } from '@/lib/auth-client'

export function ResetPasswordForm({ token }: { token: string }) {
  const [done, setDone] = useState(false)
  const [invalid, setInvalid] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const data = new FormData(form)
    const newPassword = String(data.get('password'))
    setError(null)
    if (newPassword !== String(data.get('confirmPassword'))) {
      setError('Passwords do not match.')
      return
    }
    start(async () => {
      try {
        const { error } = await authClient.resetPassword({ token, newPassword })
        if (error) {
          if (error.code === 'INVALID_TOKEN') setInvalid(true)
          else setError('Could not reset your password. Please try again.')
          return
        }
        form.reset()
        // Remove the single-use token from the current history entry after success.
        window.history.replaceState(null, '', '/reset-password')
        setDone(true)
      } catch {
        setError('Could not connect. Check your connection and try again.')
      }
    })
  }

  if (done) return <p role="status" className="text-sm text-body">Your password has been reset. <Link className="text-accent-text hover:underline" href="/sign-in">Sign in with your new password</Link>.</p>
  if (invalid) return <div className="space-y-3 text-sm text-body"><p role="alert">This reset link is invalid or has expired.</p><Link className="text-accent-text hover:underline" href="/forgot-password">Request a new reset link</Link></div>

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3.5" aria-busy={pending}>
      <Field label="New password" htmlFor="password" hint="Use 8 to 128 characters.">
        <Input id="password" name="password" type="password" autoComplete="new-password" minLength={8} maxLength={128} required disabled={pending} />
      </Field>
      <Field label="Confirm new password" htmlFor="confirmPassword">
        <Input id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password" minLength={8} maxLength={128} required disabled={pending} aria-invalid={!!error} aria-describedby={error ? 'reset-error' : undefined} />
      </Field>
      {error && <p id="reset-error" role="alert" className="text-sm text-danger-text">{error}</p>}
      <Button variant="primary" type="submit" loading={pending} className="mt-1 w-full justify-center">Reset password</Button>
    </form>
  )
}
