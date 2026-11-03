import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { Bot } from 'lucide-react'
import { getOAuthClient, listMembershipsForUser, SCOPES } from '@motion/core'
import { buttonClasses } from '@motion/ui/button'
import { AuthCard } from '@/components/shell/auth-card'
import { getDb } from '@/lib/db'
import { OAUTH_ENDPOINTS } from '@/lib/oauth'
import { getSession } from '@/lib/session'

export const metadata: Metadata = { title: 'Connect an agent' }
export const dynamic = 'force-dynamic'

type Params = Record<string, string | undefined>

const SCOPE_LABEL: Record<string, string> = {
  read: 'Read everything in the workspace',
  'write:todos': 'Create and update To-Dos',
  'write:issues': 'Create and update Issues',
  'write:headlines': 'Post Headlines',
  'write:metrics': 'Record Scorecard values',
  'write:priorities': 'Update Priorities and milestones',
  'write:meetings': 'Run and update Meetings',
  'propose:vision': 'Propose Vision changes (needs approval)',
  'propose:chart': 'Propose Accountability Chart changes (needs approval)',
  admin: 'Admin: packs, members, agents (always needs approval)',
}

function Problem({ message }: { message: string }) {
  return (
    <AuthCard title="Cannot connect" subtitle={message}>
      <p className="text-sm text-faint">Go back to the app you were connecting and start again.</p>
    </AuthCard>
  )
}

export default async function AuthorizePage({ searchParams }: { searchParams: Promise<Params> }) {
  const q = await searchParams
  const session = await getSession()
  if (!session) {
    const self = `/oauth/authorize?${new URLSearchParams(Object.entries(q).flatMap(([k, v]) => (v === undefined ? [] : [[k, v]]))).toString()}`
    redirect(`/sign-in?next=${encodeURIComponent(self)}`)
  }

  const db = await getDb()
  const client = q.client_id ? await getOAuthClient(db, q.client_id) : null
  if (!client) return <Problem message="This application is not registered." />
  if (!q.redirect_uri || !client.redirectUris.includes(q.redirect_uri)) return <Problem message="The redirect address does not match the application's registration." />
  if (q.response_type !== 'code') return <Problem message="Only response_type=code is supported." />
  if (!q.code_challenge || q.code_challenge_method !== 'S256') return <Problem message="This application did not send a PKCE (S256) challenge." />

  const memberships = await listMembershipsForUser(db, session.user.id)
  if (!memberships.length) return <Problem message="You are not a member of any organization yet. Finish onboarding first." />

  const asked = new Set((q.scope ?? '').split(/[\s,]+/).filter(Boolean))
  const preselected = (s: string) => (asked.size ? asked.has(s) : s === 'read')
  const canAdmin = memberships.some((m) => m.role === 'owner' || m.role === 'admin')
  const scopes = SCOPES.filter((s) => s !== 'admin' || canAdmin)
  const E = OAUTH_ENDPOINTS()
  const control = 'h-7 w-full rounded-md bg-surface px-2 text-sm text-ink shadow-[0_0_0_1px_var(--m-line)] outline-none focus-visible:ring-2 focus-visible:ring-accent/50'

  return (
    <AuthCard title={`Connect ${client.name}`} subtitle={`${session.user.email}`}>
      <form method="post" action={E.consent} className="flex flex-col gap-4">
        {(['client_id', 'redirect_uri', 'code_challenge', 'state'] as const).map((k) => (
          <input key={k} type="hidden" name={k} value={q[k] ?? ''} />
        ))}
        <div className="flex items-center gap-2.5 rounded-md bg-canvas p-2.5">
          <span className="grid size-7 shrink-0 place-items-center rounded-md bg-accent text-white"><Bot size={15} strokeWidth={1.7} /></span>
          <p className="text-sm text-body">
            <span className="font-[550] text-ink">{client.name}</span> wants to act as an agent in Motion on your behalf. It will appear in Settings, Agents, where you can change its access or revoke it.
          </p>
        </div>

        <label className="flex flex-col gap-1.5 text-sm font-[550] text-ink">
          Organization
          <select name="org" className={control} defaultValue={memberships[0]!.orgId}>
            {memberships.map((m) => (
              <option key={m.orgId} value={m.orgId}>{m.name} ({m.role})</option>
            ))}
          </select>
        </label>

        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1.5 text-sm font-[550] text-ink">What it can do</legend>
          {scopes.map((s) => (
            <label key={s} className="flex items-start gap-2 text-sm text-body">
              <input type="checkbox" name="scope" value={s} defaultChecked={preselected(s)} className="mt-0.5 size-3.5 accent-[var(--color-accent)]" />
              <span><span className="font-mono text-xs text-ink">{s}</span><span className="block text-xs text-faint">{SCOPE_LABEL[s]}</span></span>
            </label>
          ))}
        </fieldset>

        <div className="flex gap-2">
          <button type="submit" name="decision" value="deny" className={buttonClasses('secondary', 'md', 'flex-1')}>Deny</button>
          <button type="submit" name="decision" value="approve" className={buttonClasses('primary', 'md', 'flex-1')}>Allow</button>
        </div>
        <p className="text-center text-xs text-faint">You will be sent back to {new URL(q.redirect_uri).host || q.redirect_uri.split(':')[0]}.</p>
      </form>
    </AuthCard>
  )
}
