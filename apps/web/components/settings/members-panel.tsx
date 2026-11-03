'use client'

import { Copy, Link2, Trash2, UserPlus } from 'lucide-react'
import { useState } from 'react'
import { Avatar } from '@movara/ui/avatar'
import { Badge } from '@movara/ui/badge'
import { Button } from '@movara/ui/button'
import { Field } from '@movara/ui/field'
import { Input } from '@movara/ui/input'
import { toast } from '@movara/ui/toaster'
import { changeRole, inviteMember, reissueInvite, removeMember, type InviteResult } from '@/app/(app)/[org]/settings/actions'
import { NativeSelect, Panel, Section } from './ui'
import { useSave } from './use-save'

type Role = 'owner' | 'admin' | 'member' | 'viewer'
export type MemberRow = { id: string; name: string; email: string; role: Role; joined: boolean; isMe: boolean }

export function MembersPanel({ slug, members, canEdit, isOwner }: { slug: string; members: MemberRow[]; canEdit: boolean; isOwner: boolean }) {
  const { save, pending } = useSave()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'admin' | 'member' | 'viewer'>('member')
  const [confirm, setConfirm] = useState<string | null>(null)
  const [invite, setInvite] = useState<InviteResult | null>(null)

  async function copy(link: string) {
    try {
      await navigator.clipboard.writeText(link)
      toast.success('Invite link copied')
    } catch {
      toast.error('Could not copy: select the link and copy it manually')
    }
  }

  return (
    <div className="flex flex-col gap-7">
      {canEdit && (
        <Section title="Invite" description="Share the single-use invite link with them (emailed too when SMTP is configured). Signing up with the same email is not enough.">
          <form
            className="flex flex-wrap items-end gap-2 rounded-xl bg-surface p-4 shadow-panel"
            onSubmit={(e) => {
              e.preventDefault()
              save(() => inviteMember(slug, { name: name.trim(), email: email.trim(), role }), 'Invitation created', (d) => { setName(''); setEmail(''); if (d) setInvite(d) })
            }}
          >
            <Field label="Name" htmlFor="inv-name" className="min-w-36 flex-1"><Input id="inv-name" value={name} onChange={(e) => setName(e.target.value)} required /></Field>
            <Field label="Email" htmlFor="inv-email" className="min-w-48 flex-[1.5]"><Input id="inv-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></Field>
            <Field label="Role" htmlFor="inv-role"><NativeSelect id="inv-role" value={role} onChange={(e) => setRole(e.target.value as typeof role)}><option value="admin">Admin</option><option value="member">Member</option><option value="viewer">Viewer</option></NativeSelect></Field>
            <Button type="submit" variant="primary" loading={pending}><UserPlus size={14} strokeWidth={1.7} />Invite</Button>
          </form>
          {invite && (
            <div className="mt-3 rounded-xl bg-surface p-4 shadow-panel" data-testid="invite-link">
              <div className="mb-1.5 text-sm text-body">Invite link for {invite.name} ({invite.email}){invite.emailed ? ', also emailed' : ''}. Shown once; single use, valid 14 days.</div>
              <div className="flex gap-2">
                <Input readOnly aria-label="Invite link" value={invite.link} onFocus={(e) => e.currentTarget.select()} />
                <Button type="button" onClick={() => copy(invite.link)}><Copy size={14} strokeWidth={1.7} />Copy</Button>
              </div>
            </div>
          )}
        </Section>
      )}
      <Section title={`Members (${members.length})`}>
        <Panel data-testid="members">
          {members.map((m) => (
            <div key={m.id} className="flex items-center gap-3 px-4 py-2.5">
              <Avatar name={m.name} size={26} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-base font-[550] text-ink">{m.name}{m.isMe && <span className="ml-1.5 font-[450] text-faint">you</span>}</div>
                <div className="truncate text-sm text-body">{m.email}</div>
              </div>
              {!m.joined && <Badge tone="warning">Invited</Badge>}
              {!m.joined && canEdit && (
                <Button size="sm" variant="ghost" disabled={pending} onClick={() => save(() => reissueInvite(slug, m.id), 'New invite link created', (d) => { if (d) { setInvite(d); void copy(d.link) } })}>
                  <Link2 size={14} strokeWidth={1.7} />Copy invite link
                </Button>
              )}
              {canEdit ? (
                <NativeSelect aria-label={`Role for ${m.name}`} value={m.role} className="w-28" disabled={pending || (m.role === 'owner' && !isOwner)} onChange={(e) => save(() => changeRole(slug, m.id, e.target.value as Role), 'Role updated')}>
                  {isOwner && <option value="owner">Owner</option>}
                  {m.role === 'owner' && !isOwner && <option value="owner">Owner</option>}
                  <option value="admin">Admin</option><option value="member">Member</option><option value="viewer">Viewer</option>
                </NativeSelect>
              ) : (
                <Badge className="capitalize">{m.role}</Badge>
              )}
              {canEdit && (
                confirm === m.id ? (
                  <span className="flex items-center gap-1">
                    <Button size="sm" variant="danger" loading={pending} onClick={() => save(() => removeMember(slug, m.id), 'Member removed', () => setConfirm(null))}>Remove</Button>
                    <Button size="sm" variant="ghost" onClick={() => setConfirm(null)}>Cancel</Button>
                  </span>
                ) : (
                  <Button size="icon" variant="ghost" aria-label={`Remove ${m.name}`} onClick={() => setConfirm(m.id)}><Trash2 size={14} strokeWidth={1.7} /></Button>
                )
              )}
            </div>
          ))}
        </Panel>
      </Section>
    </div>
  )
}
