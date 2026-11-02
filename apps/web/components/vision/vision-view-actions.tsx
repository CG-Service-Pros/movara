'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { FileDown, History, Pencil } from 'lucide-react'
import { Button } from '@motion/ui/button'
import { Badge } from '@motion/ui/badge'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@motion/ui/sheet'
import { toast } from '@motion/ui/toaster'
import { createVisionDraft } from '@/app/(app)/[org]/vision/actions'
import type { RevisionLite } from './shared'

const tone = { published: 'success', draft: 'warning', archived: 'neutral' } as const

export function VisionViewActions({
  slug,
  revisions,
  currentId,
  hasDraft,
  canEdit,
}: {
  slug: string
  revisions: RevisionLite[]
  currentId: string | null
  hasDraft: boolean
  canEdit: boolean
}) {
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [pending, start] = React.useTransition()

  const edit = () =>
    start(async () => {
      const r = await createVisionDraft(slug)
      if (!r.ok) return void toast.error(r.error)
      if (r.needsApproval) return void toast('Sent for approval')
      router.push(`/${slug}/vision?edit=1`)
    })

  return (
    <>
      <Button variant="ghost" size="md" onClick={() => setOpen(true)}>
        <History size={15} strokeWidth={1.7} />
        Revision history
      </Button>
      <Button variant="secondary" onClick={() => window.print()}>
        <FileDown size={15} strokeWidth={1.7} />
        Export PDF
      </Button>
      {canEdit && (
        <Button variant="primary" onClick={edit} loading={pending}>
          <Pencil size={14} strokeWidth={1.7} />
          {hasDraft ? 'Continue draft' : 'Edit draft'}
        </Button>
      )}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Revision history</SheetTitle>
            <SheetDescription>Open any revision to read it. Only the published one is live.</SheetDescription>
          </SheetHeader>
          <ul className="-mx-2 flex flex-col overflow-auto">
            {revisions.map((r) => (
              <li key={r.id}>
                <Link
                  href={r.status === 'draft' ? `/${slug}/vision?edit=1` : `/${slug}/vision?rev=${r.id}`}
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-2 rounded-md px-2 py-2 text-base text-ink outline-none hover:bg-nav-active focus-visible:ring-2 focus-visible:ring-accent/50"
                  data-current={r.id === currentId || undefined}
                >
                  <span className="font-semibold tabular-nums">v{r.number}</span>
                  <Badge tone={tone[r.status]}>{r.status}</Badge>
                  <span className="ml-auto text-sm text-body">
                    {r.date ?? 'Not published'}
                    {r.by ? ` · ${r.by}` : ''}
                  </span>
                </Link>
              </li>
            ))}
            {!revisions.length && <li className="px-2 py-2 text-sm text-body">No revisions yet.</li>}
          </ul>
        </SheetContent>
      </Sheet>
    </>
  )
}

/** Empty-state call to action. */
export function StartDraftButton({ slug, label }: { slug: string; label: string }) {
  const router = useRouter()
  const [pending, start] = React.useTransition()
  return (
    <Button
      variant="primary"
      loading={pending}
      onClick={() =>
        start(async () => {
          const r = await createVisionDraft(slug)
          if (!r.ok) return void toast.error(r.error)
          router.push(`/${slug}/vision?edit=1`)
        })
      }
    >
      {label}
    </Button>
  )
}
