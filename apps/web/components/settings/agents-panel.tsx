'use client'

import { Plus } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { AgentMark } from '@movara/ui/agent-mark'
import { Badge } from '@movara/ui/badge'
import { Button } from '@movara/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@movara/ui/dialog'
import { Field } from '@movara/ui/field'
import { Input } from '@movara/ui/input'
import { Switch } from '@movara/ui/switch'
import { PRESET_INFO, presetLabel, type PresetChoice } from './presets'
import { createAgent, setCaptureAutoAccept } from '@/app/(app)/[org]/settings/actions'
import { NativeSelect, Panel, Section, ago } from './ui'
import { useSave } from './use-save'

export type AgentListRow = { id: string; name: string; client: string | null; owner: string; status: string; lastSeenAt: string | null; scopeCount: number; keyCount: number; preset: string | null }

export function AgentsList({ slug, agents, people, meId, canCreate, isAdmin, autoAccept }: { slug: string; agents: AgentListRow[]; people: { id: string; name: string }[]; meId: string; canCreate: boolean; isAdmin: boolean; autoAccept: boolean }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [client, setClient] = useState('')
  const [owner, setOwner] = useState(meId)
  const [preset, setPreset] = useState<PresetChoice>('personal_assistant')
  const { save, pending } = useSave()
  const router = useRouter()

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-base text-body">Agents act in Movara with their own scopes. Everything they do is attributed and audited.</p>
        {canCreate && <Button variant="primary" onClick={() => setOpen(true)}><Plus size={14} strokeWidth={1.7} />New agent</Button>}
      </div>
      <Panel data-testid="agents">
        {agents.map((a) => (
          <Link key={a.id} href={`/${slug}/settings/agents/${a.id}`} className="flex items-center gap-3 px-4 py-3 outline-none hover:bg-canvas/60 focus-visible:bg-canvas">
            <AgentMark size={28} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 truncate text-base font-[550] text-ink">{a.name}<Badge tone={a.preset ? 'accent' : 'neutral'} data-testid="preset-badge">{presetLabel(a.preset)}</Badge></div>
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
            <DialogDescription>Pick what it is for. You can fine-tune scopes afterwards.</DialogDescription>
          </DialogHeader>
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault()
              save(() => createAgent(slug, { name: name.trim(), client: client.trim(), ownerPersonId: owner, ...(preset === 'custom' ? {} : { preset }) }), 'Agent created', (d) => {
                setOpen(false); setName(''); setClient('')
                const id = (d as { id?: string } | undefined)?.id
                if (id) router.push(`/${slug}/settings/agents/${id}`)
              })
            }}
          >
            <Field label="Name" htmlFor="ag-name"><Input id="ag-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ops Agent" required autoFocus /></Field>
            <Field label="Client" htmlFor="ag-client" hint="The app it connects from."><Input id="ag-client" value={client} onChange={(e) => setClient(e.target.value)} placeholder="Claude Code" /></Field>
            <Field label="Preset" htmlFor="ag-preset" hint={PRESET_INFO.find((p) => p.key === preset)?.description}>
              <NativeSelect id="ag-preset" value={preset} onChange={(e) => setPreset(e.target.value as PresetChoice)}>{PRESET_INFO.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}</NativeSelect>
            </Field>
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

      <Section title="Meeting notes from agents" description="Notes apps such as Granola or Plaud push notes and action items through an agent.">
        <Panel>
          <div className="flex items-center gap-4 px-4 py-3">
            <div className="min-w-0 flex-1">
              <label htmlFor="auto-accept" className="text-base font-[550] text-ink">Auto-accept items pushed by agents</label>
              <p className="text-sm text-body">
                Off (recommended): proposed to-dos, issues and headlines wait in the <Link href={`/${slug}/inbox`} className="text-accent-text hover:underline">Inbox</Link> until a person accepts them.
                On: an agent that asks for it creates the records directly, within its own scopes. Everything stays attributed and audited.
              </p>
            </div>
            <Switch id="auto-accept" checked={autoAccept} disabled={!isAdmin || pending} onCheckedChange={(v) => save(() => setCaptureAutoAccept(slug, v), v ? 'Auto-accept on' : 'Auto-accept off')} />
          </div>
          {!isAdmin && <p className="px-4 pb-3 text-sm text-faint">Only admins can change this.</p>}
        </Panel>
      </Section>
    </div>
  )
}
