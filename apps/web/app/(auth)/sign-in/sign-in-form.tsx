'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@movara/ui/button'
import { Field } from '@movara/ui/field'
import { Input } from '@movara/ui/input'
import { authClient } from '@/lib/auth-client'
import { safeNext } from '@/lib/safe-next'

export function SignInForm({ next, demoHint = false }: { next?: string; demoHint?: boolean }) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    setError(null)
    start(async () => {
      const { error } = await authClient.signIn.email({ email: String(f.get('email')), password: String(f.get('password')) })
      if (error) return setError(error.message ?? 'Could not sign in')
      router.replace(safeNext(next))
      router.refresh()
    })
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3.5">
      <Field label="Email" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="email" required defaultValue="" />
      </Field>
      <Field label="Password" htmlFor="password" error={error ?? undefined}>
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
      </Field>
      <Button variant="primary" type="submit" loading={pending} className="mt-1 w-full justify-center">Sign in</Button>
      {demoHint && <p className="text-center text-xs text-faint">Demo: demo@movara.local / movara-demo</p>}
    </form>
  )
}
