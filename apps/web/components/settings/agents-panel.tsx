'use client'

import { Plus } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { AgentMark } from '@motion/ui/agent-mark'
import { Badge } from '@motion/ui/badge'
import { Button } from '@motion/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@motion/ui/dialog'
import { Field } from '@motion/ui/field'
import { Input } from '@motion/ui/input'
import { createAgent } from '@/app/(app)/[org]/settings/actions'
import { NativeSelect, Panel, ago } from './ui'
import { useSave } from './use-save'

export type AgentListRow = { id: string; name: string; client: string | null; owner: string; status: string; lastSeenAt: string | null; scopeCount: number; keyCount: number }

export function AgentsList({ slug, agents, people, meId, canCreate }: { slug: string; agents: AgentListRow[]; people: { id: string; name: string }[]; meId: string; canCreate: boolean }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [client, setClient] = useState('')
  const [owner, setOwner] = useState(meId)
  const { save, pending } = useSave()
  const router = useRouter()

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-base text-body">Agents act in Motion with their own scopes. Everything they do is attributed and audited.</p>
        {canCreate && <Button variant="primary" onClick={() => setOpen(true)}><Plus size={14} strokeWidth={1.7} />New agent</Button>}
      </div>
      <Panel data-testid="agents">
        {agents.map((a) => (
          <Link key={a.id} href={`/${slug}/settings/agents/${a.id}`} className="flex items-center gap-3 px-4 py-3 outline-none hover:bg-canvas/60 focus-visible:bg-canvas">
            <AgentMark size={28} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-base font-[550] text-ink">{a.name}</div>
              <div className="truncate text-sm text-body">{a.client ?? 'No client set'} · owned by {a.owner}</div>
            </div>
            <div className="hidden text-sm text-faint sm:block">{a.scopeCount} scopes · {a.keyCount} key{a.keyCount === 1 ? '' : 's'}</div>
            <div className="w-24 text-right text-sm text-body">{a.lastSeenAt ? ago(a.lastSeenAt) : 'Never seen'}</div>
            <Badge tone={a.status === 'active' ? 'success' : a.status === 'paused' ? 'warning' : 'danger'} className="capitalize">{a.status}</Badge>
          </Link>
        ))}
        {agents.length === 0 && <div className="px-4 py-10 text-center text-base text-body">No agents yet. Create one to connect Claude, a workflow or a script.</div>}
      </Panel>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New agent</DialogTitle>
            <DialogDescription>Starts with read-only access. You choose its scopes next.</DialogDescription>
          </DialogHeader>
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault()
              save(() => createAgent(slug, { name: name.trim(), client: client.trim(), ownerPersonId: owner }), 'Agent created', (d) => {
                setOpen(false); setName(''); setClient('')
                const id = (d as { id?: string } | undefined)?.id
                if (id) router.push(`/${slug}/settings/agents/${id}`)
              })
            }}
          >
            <Field label="Name" htmlFor="ag-name"><Input id="ag-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ops Agent" required autoFocus /></Field>
            <Field label="Client" htmlFor="ag-client" hint="The app it connects from."><Input id="ag-client" value={client} onChange={(e) => setClient(e.target.value)} placeholder="Claude Code" /></Field>
            <Field label="Owner" htmlFor="ag-owner" hint="The agent acts on behalf of its owner and can never exceed their role.">
              <NativeSelect id="ag-owner" value={owner} onChange={(e) => setOwner(e.target.value)} disabled={people.length < 2}>{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</NativeSelect>
            </Field>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" variant="primary" loading={pending} disabled={!name.trim()}>Create agent</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
