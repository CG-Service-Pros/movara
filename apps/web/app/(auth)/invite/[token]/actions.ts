'use server'

import { redirect } from 'next/navigation'
import { acceptInvite, isMovaraError } from '@movara/core'
import { getDb } from '@/lib/db'
import { getSession } from '@/lib/session'

/** Redeem an invite token for the signed-in account (the only way an account is linked to an invited person). */
export async function joinWithInvite(token: string) {
  const session = await getSession()
  if (!session) redirect(`/sign-in?next=${encodeURIComponent(`/invite/${token}`)}`)
  let slug: string
  try {
    slug = (await acceptInvite(await getDb(), token, session.user.id)).slug
  } catch (e) {
    if (isMovaraError(e)) redirect(`/invite/${encodeURIComponent(token)}?error=${e.code === 'conflict' ? 'member' : 'invalid'}`)
    throw e
  }
  redirect(`/${slug}`)
}
