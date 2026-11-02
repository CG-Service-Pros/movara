'use client'

import { Trash2, UserPlus } from 'lucide-react'
import { useState } from 'react'
import { Avatar } from '@motion/ui/avatar'
import { Badge } from '@motion/ui/badge'
import { Button } from '@motion/ui/button'
import { Field } from '@motion/ui/field'
import { Input } from '@motion/ui/input'
import { changeRole, inviteMember, removeMember } from '@/app/(app)/[org]/settings/actions'
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

  return (
    <div className="flex flex-col gap-7">
      {canEdit && (
        <Section title="Invite" description="They join automatically when they sign up with this email.">
          <form
            className="flex flex-wrap items-end gap-2 rounded-xl bg-surface p-4 shadow-panel"
            onSubmit={(e) => {
              e.preventDefault()
              save(() => inviteMember(slug, { name: name.trim(), email: email.trim(), role }), 'Invitation added', () => { setName(''); setEmail('') })
            }}
          >
            <Field label="Name" htmlFor="inv-name" className="min-w-36 flex-1"><Input id="inv-name" value={name} onChange={(e) => setName(e.target.value)} required /></Field>
            <Field label="Email" htmlFor="inv-email" className="min-w-48 flex-[1.5]"><Input id="inv-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></Field>
            <Field label="Role" htmlFor="inv-role"><NativeSelect id="inv-role" value={role} onChange={(e) => setRole(e.target.value as typeof role)}><option value="admin">Admin</option><option value="member">Member</option><option value="viewer">Viewer</option></NativeSelect></Field>
            <Button type="submit" variant="primary" loading={pending}><UserPlus size={14} strokeWidth={1.7} />Invite</Button>
          </form>
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
