'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@motion/ui/button'
import { Field } from '@motion/ui/field'
import { Input } from '@motion/ui/input'
import { authClient } from '@/lib/auth-client'

export function SignUpForm() {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    setError(null)
    start(async () => {
      const { error } = await authClient.signUp.email({ name: String(f.get('name')), email: String(f.get('email')), password: String(f.get('password')) })
      if (error) return setError(error.message ?? 'Could not create the account')
      router.replace('/')
      router.refresh()
    })
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3.5">
      <Field label="Name" htmlFor="name">
        <Input id="name" name="name" autoComplete="name" required />
      </Field>
      <Field label="Work email" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </Field>
      <Field label="Password" htmlFor="password" hint="At least 8 characters." error={error ?? undefined}>
        <Input id="password" name="password" type="password" autoComplete="new-password" minLength={8} required />
      </Field>
      <Button variant="primary" type="submit" loading={pending} className="mt-1 w-full justify-center">Create account</Button>
    </form>
  )
}
