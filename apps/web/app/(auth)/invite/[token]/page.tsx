import type { Metadata } from 'next'
import Link from 'next/link'
import { getInvite } from '@movara/core'
import { Button } from '@movara/ui/button'
import { AuthCard } from '@/components/shell/auth-card'
import { getDb } from '@/lib/db'
import { getSession } from '@/lib/session'
import { joinWithInvite } from './actions'

export const metadata: Metadata = { title: 'Join organization', referrer: 'no-referrer' }

export default async function InvitePage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ error?: string }> }) {
  const { token } = await params
  const { error } = await searchParams
  const invite = await getInvite(await getDb(), token)
  if (!invite) {
    return (
      <AuthCard title="Invitation unavailable" subtitle="This link is invalid, expired or has already been used. Ask an admin to send you a new one." footer={<Link className="font-[550] text-accent-text hover:underline" href="/">Go to Movara</Link>}>
        <span />
      </AuthCard>
    )
  }
  const session = await getSession()
  const next = encodeURIComponent(`/invite/${token}`)
  return (
    <AuthCard title={`Join ${invite.orgName}`} subtitle={`${invite.personName}, you were invited as ${invite.role}.`}>
      {error && <p className="mb-3 text-sm text-danger-text" role="alert">{error === 'member' ? 'This account is already a member of that organization.' : 'This invitation could not be redeemed.'}</p>}
      {session ? (
        <form action={joinWithInvite.bind(null, token)} className="flex flex-col gap-3">
          <p className="text-sm text-body">Signed in as {session.user.email}. Joining links this account to {invite.orgName}.</p>
          <Button variant="primary" type="submit" className="w-full justify-center">Join {invite.orgName}</Button>
        </form>
      ) : (
        <div className="flex flex-col gap-2">
          <Button variant="primary" asChild className="w-full justify-center"><Link href={`/sign-up?next=${next}`}>Create an account</Link></Button>
          <Button variant="secondary" asChild className="w-full justify-center"><Link href={`/sign-in?next=${next}`}>I already have an account</Link></Button>
        </div>
      )}
    </AuthCard>
  )
}
