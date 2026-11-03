'use server'

import { redirect } from 'next/navigation'
import { createOrg, isMovaraError } from '@movara/core'
import { getDb } from '@/lib/db'
import { getSession } from '@/lib/session'
import { orgCreationAllowed } from '@/lib/signup'
import { ORG_CREATION_MESSAGE } from '@/lib/signup-policy'

export type OnboardingState = { error?: string; fieldErrors?: Record<string, string> } | undefined

export async function createOrgAction(_prev: OnboardingState, form: FormData): Promise<OnboardingState> {
  const session = await getSession()
  if (!session) redirect('/sign-in')
  const db = await getDb()
  if (!(await orgCreationAllowed(db, session.user.id))) return { error: ORG_CREATION_MESSAGE }
  let slug: string
  try {
    const { org } = await createOrg(db, {
      name: String(form.get('name') ?? ''),
      slug: String(form.get('slug') ?? ''),
      timezone: String(form.get('timezone') || 'UTC'),
      ownerUserId: session.user.id,
    })
    slug = org.slug
  } catch (e) {
    if (isMovaraError(e)) return { error: e.message, fieldErrors: e.code === 'conflict' ? { slug: e.message } : undefined }
    throw e
  }
  redirect(`/${slug}`)
}
