'use client'

import { ArrowRight, Check, FileJson, Loader2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useRef, useState, useTransition } from 'react'
import { Button } from '@movara/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@movara/ui/dialog'
import { Input } from '@movara/ui/input'
import { Segmented } from '@movara/ui/segmented'
import { toast } from '@movara/ui/toaster'
import { applyPack, previewPack, type PackPreview } from '@/app/(app)/[org]/settings/actions'

type Tab = 'npm' | 'url' | 'file'

/** Preview card shared by the import dialog and the preinstalled-pack list. */
export function PackPreviewCard({ preview }: { preview: PackPreview }) {
  const { pack, changes, termCount, templates } = preview
  return (
    <div className="flex flex-col gap-3 rounded-lg bg-canvas p-3" data-testid="pack-preview">
      <div>
        <div className="text-base font-semibold text-ink">
          {pack.name} <span className="font-[450] text-faint">v{pack.version}{pack.author ? ` · ${pack.author}` : ''}</span>
        </div>
        <div className="text-sm text-body">
          {termCount} terms · {templates.length} meeting template{templates.length === 1 ? '' : 's'} · data only, no code runs
        </div>
      </div>
      {changes.length > 0 ? (
        <div className="flex max-h-44 flex-col gap-1 overflow-auto">
          {changes.map((c) => (
            <div key={c.key} className="flex items-center gap-2 text-sm">
              <span className="text-body line-through decoration-faint/60">{c.from}</span>
              <ArrowRight size={13} strokeWidth={1.8} className="shrink-0 text-icon" />
              <span className="font-[550] text-ink">{c.to}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-sm text-body">No term changes compared with what is active now.</div>
      )}
      {templates.length > 0 && (
        <div className="text-sm text-body">
          New meeting templates: {templates.map((t) => <b key={t.key} className="font-[550] text-ink">{t.name} </b>)}
        </div>
      )}
      {pack.attribution && <div className="border-t border-line pt-2 text-xs text-faint">{pack.attribution}</div>}
    </div>
  )
}

export function ImportPackDialog({ slug, open, onOpenChange }: { slug: string; open: boolean; onOpenChange: (o: boolean) => void }) {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('npm')
  const [value, setValue] = useState('')
  const [fileName, setFileName] = useState('')
  const [preview, setPreview] = useState<PackPreview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [applied, setApplied] = useState(false)
  const [loading, start] = useTransition()
  const [applying, startApply] = useTransition()
  const fileRef = useRef<HTMLInputElement>(null)

  function reset() {
    setValue(''); setFileName(''); setPreview(null); setError(null); setApplied(false)
  }

  function fetchPreview(kind: Tab | 'json', v: string) {
    setError(null); setPreview(null); setApplied(false)
    start(async () => {
      const r = await previewPack(slug, { kind: kind === 'json' ? 'file' : kind, value: v })
      if (r.ok && r.data) setPreview(r.data)
      else setError(r.ok ? 'Nothing to preview' : r.error)
    })
  }

  async function onFile(f: File | undefined) {
    if (!f) return
    setFileName(f.name)
    if (!f.name.toLowerCase().endsWith('.json')) return setError('Choose a .json pack file.')
    if (f.size > 256 * 1024) return setError('The pack is larger than 256KB.')
    fetchPreview('file', await f.text())
  }

  function apply() {
    if (!preview) return
    startApply(async () => {
      const r = await applyPack(slug, preview.pack)
      if (!r.ok) return setError(r.error)
      if (r.pending) toast('Sent for approval')
      else setApplied(true)
      router.refresh()
    })
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) reset() }}>
      <DialogContent className="max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Import terminology pack</DialogTitle>
          <DialogDescription>Packs are data only. Movara validates the file and shows what changes before anything is applied.</DialogDescription>
        </DialogHeader>
        <Segmented<Tab>
          aria-label="Pack source"
          value={tab}
          onValueChange={(t) => { setTab(t); reset() }}
          options={[{ value: 'npm', label: 'npm package' }, { value: 'url', label: 'URL' }, { value: 'file', label: 'File' }]}
          className="self-start"
        />
        {tab !== 'file' ? (
          <form className="flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); if (value.trim()) fetchPreview(tab, value.trim()) }}>
            <Input
              aria-label={tab === 'npm' ? 'npm package name' : 'Pack URL'}
              autoFocus
              value={value}
              onChange={(e) => { setValue(e.target.value); setPreview(null); setError(null); setApplied(false) }}
              placeholder={tab === 'npm' ? '@movara-community/pack-eos' : 'https://example.com/pack.json'}
            />
            <Button type="submit" disabled={!value.trim()} loading={loading}>Check</Button>
          </form>
        ) : (
          <div className="flex items-center gap-2">
            <input ref={fileRef} type="file" accept=".json,application/json" className="sr-only" aria-label="Pack file" onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = '' }} />
            <Button onClick={() => fileRef.current?.click()}><FileJson size={14} strokeWidth={1.7} />Choose pack.json</Button>
            <span className="truncate text-sm text-body">{fileName || 'No file chosen'}</span>
            {loading && <Loader2 size={14} className="animate-spin text-icon" />}
          </div>
        )}
        {tab === 'npm' && !preview && <p className="-mt-2 text-xs text-faint">Fetches only pack.json from the package (via jsDelivr). Add @version to pin one.</p>}
        {error && <p role="alert" className="text-sm text-danger-text">{error}</p>}
        {preview && <PackPreviewCard preview={preview} />}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>{applied ? 'Close' : 'Cancel'}</Button>
          <Button variant="primary" disabled={!preview || applied} loading={applying} onClick={apply}>
            {applied ? <><Check size={14} strokeWidth={2} />Applied</> : 'Apply pack'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
