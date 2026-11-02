'use server'

import { redirect } from 'next/navigation'
import { createOrg, isMotionError } from '@motion/core'
import { getDb } from '@/lib/db'
import { getSession } from '@/lib/session'

export type OnboardingState = { error?: string; fieldErrors?: Record<string, string> } | undefined

export async function createOrgAction(_prev: OnboardingState, form: FormData): Promise<OnboardingState> {
  const session = await getSession()
  if (!session) redirect('/sign-in')
  let slug: string
  try {
    const { org } = await createOrg(await getDb(), {
      name: String(form.get('name') ?? ''),
      slug: String(form.get('slug') ?? ''),
      timezone: String(form.get('timezone') || 'UTC'),
      ownerUserId: session.user.id,
    })
    slug = org.slug
  } catch (e) {
    if (isMotionError(e)) return { error: e.message, fieldErrors: e.code === 'conflict' ? { slug: e.message } : undefined }
    throw e
  }
  redirect(`/${slug}`)
}
