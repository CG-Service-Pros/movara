import { redirect } from 'next/navigation'
import { listMembershipsForUser } from '@motion/core'
import { getDb } from '@/lib/db'
import { getSession } from '@/lib/session'

/** Entry point: sends the user to their first org, or to onboarding if they have none. */
export default async function Index() {
  const session = await getSession()
  if (!session) redirect('/sign-in')
  const memberships = await listMembershipsForUser(await getDb(), session.user.id)
  const first = memberships[0]
  redirect(first ? `/${first.slug}` : '/onboarding')
}
