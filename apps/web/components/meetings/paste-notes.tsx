'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { ClipboardPaste } from 'lucide-react'
import { Button } from '@movara/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@movara/ui/dialog'
import { Textarea } from '@movara/ui/textarea'
import { toast } from '@movara/ui/toaster'
import { pasteMeetingNotes, type PasteNotesResult } from '@/app/(app)/[org]/meetings/[id]/capture-actions'

/** Wrap-up action: paste notes from Granola, Plaud or anywhere; items land in the Inbox for review. */
export function PasteNotes({ meetingId }: { meetingId: string }) {
  const slug = useParams<{ org: string }>().org
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<PasteNotesResult | null>(null)

  const save = async () => {
    setBusy(true)
    const r = await pasteMeetingNotes(slug, meetingId, text)
    setBusy(false)
    if (!r.ok) return toast.error(r.error)
    setResult(r)
    setText('')
    toast.success(r.proposed ? `Notes saved, ${r.proposed} item${r.proposed === 1 ? '' : 's'} to review` : 'Notes saved')
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setResult(null) }}>
      <DialogTrigger asChild>
        <Button size="sm" data-testid="paste-notes"><ClipboardPaste size={13} /> Paste notes</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Paste meeting notes</DialogTitle>
          <DialogDescription>From Granola, Plaud or your own. To-dos, issues and decisions are pulled out for the team to review in the Inbox; nothing is created until someone accepts it.</DialogDescription>
        </DialogHeader>
        {result?.ok ? (
          <div className="rounded-lg bg-canvas p-3 text-sm text-body" data-testid="paste-notes-result">
            {result.proposed > 0 ? (
              <>{result.proposed} item{result.proposed === 1 ? ' is' : 's are'} waiting for review. <Link href={`/${slug}/inbox`} className="font-[600] text-accent-text hover:underline">Open the Inbox</Link></>
            ) : result.error ? (
              <>The notes are saved, but items could not be extracted: {result.error}</>
            ) : (
              <>The notes are saved on the meeting. {result.extracted ? 'No action items were found.' : 'Automatic extraction is off, so no items were proposed.'}</>
            )}
          </div>
        ) : (
          <Textarea rows={10} value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste notes here…" aria-label="Notes to paste" className="max-h-[50vh]" />
        )}
        <DialogFooter>
          <Button onClick={() => setOpen(false)}>{result ? 'Close' : 'Cancel'}</Button>
          {!result && <Button variant="primary" loading={busy} disabled={!text.trim()} onClick={save} data-testid="paste-notes-save">Save notes</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
