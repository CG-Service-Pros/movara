'use client'

import { useActionState, useState } from 'react'
import { Button } from '@motion/ui/button'
import { Field } from '@motion/ui/field'
import { Input } from '@motion/ui/input'
import { createOrgAction, type OnboardingState } from './actions'

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40)

export function OnboardingForm() {
  const [state, action, pending] = useActionState<OnboardingState, FormData>(createOrgAction, undefined)
  const [slug, setSlug] = useState('')
  const [touched, setTouched] = useState(false)
  const tz = typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : 'UTC'

  return (
    <form action={action} className="flex flex-col gap-3.5">
      <input type="hidden" name="timezone" value={tz} />
      <Field label="Organization name" htmlFor="name">
        <Input id="name" name="name" required placeholder="Acme Inc." onChange={(e) => !touched && setSlug(slugify(e.target.value))} />
      </Field>
      <Field label="URL name" htmlFor="slug" hint="Lowercase letters, numbers and dashes." error={state?.fieldErrors?.slug ?? (state?.error && !state.fieldErrors ? state.error : undefined)}>
        <Input id="slug" name="slug" required value={slug} onChange={(e) => { setTouched(true); setSlug(slugify(e.target.value)) }} placeholder="acme" />
      </Field>
      <Button variant="primary" type="submit" loading={pending} className="mt-1 w-full justify-center">Create organization</Button>
    </form>
  )
}
