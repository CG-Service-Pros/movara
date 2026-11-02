'use client'

import { Check, X } from 'lucide-react'
import { useState } from 'react'
import { Badge } from '@motion/ui/badge'
import { Button } from '@motion/ui/button'
import { Input } from '@motion/ui/input'
import { decideApproval } from '@/app/(app)/[org]/settings/actions'
import { ActorChip, type ActorLike, type NameMap } from './actor'
import { Panel, Section, ago } from './ui'
import { useSave } from './use-save'

export type ApprovalItem = {
  id: string; action: string; summary: string | null; payload: unknown; status: 'pending' | 'approved' | 'declined'
  requestedBy: ActorLike; decidedBy: ActorLike | null; createdAt: string; decidedAt: string | null; note: string | null; error: string | null
}

const show = (v: unknown) => (typeof v === 'string' ? v : JSON.stringify(v))

/** Payload rendered as added lines, since nothing has been applied yet. */
export function PayloadDiff({ payload }: { payload: unknown }) {
  const entries = payload && typeof payload === 'object' ? Object.entries(payload as Record<string, unknown>) : [['value', payload] as [string, unknown]]
  return (
    <div className="overflow-hidden rounded-lg bg-canvas font-mono text-xs" data-testid="payload-diff">
      {entries.map(([k, v]) => (
        <div key={k} className="flex gap-2 bg-success-soft/50 px-3 py-1 text-success-text">
          <span className="select-none">+</span>
          <span className="shrink-0 text-ink">{k}:</span>
          <span className="min-w-0 break-words">{show(v)}</span>
        </div>
      ))}
    </div>
  )
}

export function ApprovalsPanel({ slug, items, names, canDecide }: { slug: string; items: ApprovalItem[]; names: NameMap; canDecide: boolean }) {
  const { save, pending } = useSave()
  const [note, setNote] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const pendingItems = items.filter((i) => i.status === 'pending')
  const history = items.filter((i) => i.status !== 'pending')
  const decide = (id: string, d: 'approve' | 'decline') => {
    setBusy(id + d)
    save(() => decideApproval(slug, id, d, note[id]?.trim() || undefined), d === 'approve' ? 'Approved and applied' : 'Declined')
  }

  return (
    <div className="flex flex-col gap-7">
      <Section title={`Pending (${pendingItems.length})`} description="Nothing changes until a person approves it. Approving runs the command as the agent that asked.">
        {pendingItems.length === 0 ? (
          <div className="rounded-xl bg-surface px-4 py-10 text-center text-base text-body shadow-panel">Nothing is waiting for you.</div>
        ) : (
          <div className="flex flex-col gap-3" data-testid="pending-approvals">
            {pendingItems.map((a) => (
              <div key={a.id} className="flex flex-col gap-3 rounded-xl bg-surface p-4 shadow-panel">
                <div className="flex items-center gap-2">
                  <ActorChip actor={a.requestedBy} names={names} size={22} />
                  <span className="text-sm text-faint">asked {ago(a.createdAt)}</span>
                  <Badge className="ml-auto font-mono">{a.action}</Badge>
                </div>
                <div className="text-base font-[550] text-ink">{a.summary ?? a.action}</div>
                <PayloadDiff payload={a.payload} />
                {canDecide && (
                  <div className="flex items-center gap-2">
                    <Input aria-label="Note" placeholder="Add a note (optional)" value={note[a.id] ?? ''} onChange={(e) => setNote({ ...note, [a.id]: e.target.value })} />
                    <Button variant="primary" loading={pending && busy === a.id + 'approve'} disabled={pending} onClick={() => decide(a.id, 'approve')}><Check size={14} strokeWidth={2} />Approve</Button>
                    <Button loading={pending && busy === a.id + 'decline'} disabled={pending} onClick={() => decide(a.id, 'decline')}><X size={14} strokeWidth={2} />Decline</Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Section>
      <Section title="History">
        <Panel data-testid="approval-history">
          {history.map((a) => (
            <div key={a.id} className="flex flex-col gap-1 px-4 py-2.5">
              <div className="flex items-center gap-2">
                <Badge tone={a.status === 'approved' ? 'success' : 'danger'} className="capitalize">{a.status}</Badge>
                <span className="min-w-0 flex-1 truncate text-base text-ink">{a.summary ?? a.action}</span>
                <span className="shrink-0 text-sm text-faint">{ago(a.decidedAt)}</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-body">
                <ActorChip actor={a.requestedBy} names={names} size={16} />
                {a.decidedBy && <><span className="text-faint">decided by</span><ActorChip actor={a.decidedBy} names={names} size={16} /></>}
                {a.note && <span className="text-faint">· “{a.note}”</span>}
                {a.error && <span className="text-danger-text">· {a.error}</span>}
              </div>
            </div>
          ))}
          {history.length === 0 && <div className="px-4 py-8 text-center text-base text-body">No decisions yet.</div>}
        </Panel>
      </Section>
    </div>
  )
}
