'use client'

import { Check, Download, PackagePlus, Pencil, RotateCcw, Undo2 } from 'lucide-react'
import { useState } from 'react'
import { Badge } from '@motion/ui/badge'
import { Button } from '@motion/ui/button'
import { Input } from '@motion/ui/input'
import { toast } from '@motion/ui/toaster'
import { applyPack, resetToStandard, revertPack, saveOverrides, type PackPreview } from '@/app/(app)/[org]/settings/actions'
import { ImportPackDialog, PackPreviewCard } from './import-pack-dialog'
import { Panel, Section } from './ui'
import { useSave } from './use-save'

type TermVal = { singular: string; plural: string; short?: string }
export type TermRow = { key: string; label: string; base: TermVal; effective: TermVal; override?: Partial<TermVal> }
export type ActivePack = { id: string; name: string; version: string; author?: string; attribution?: string } | null
export type Preinstalled = { spec: string; error?: string; preview?: PackPreview }

export function TerminologyPanel(props: {
  slug: string
  orgName: string
  active: ActivePack
  previousName: string | null
  /** How many earlier packs "Revert" can step back through. */
  historyDepth?: number
  rows: TermRow[]
  overrides: Record<string, Partial<TermVal>>
  templates: unknown
  statuses?: Record<string, string>
  preinstalled: Preinstalled[]
  canEdit: boolean
}) {
  const { slug, active, rows, overrides, canEdit } = props
  const [importOpen, setImportOpen] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [openPre, setOpenPre] = useState<string | null>(null)
  const { save, pending } = useSave()

  function exportPack() {
    const pack = {
      id: `custom.${slug}`,
      name: `${props.orgName} terms`,
      version: '1.0.0',
      format: 1,
      locale: 'en',
      description: `Terminology exported from ${props.orgName}${active ? ` (based on ${active.name} ${active.version})` : ''}.`,
      ...(active?.attribution ? { attribution: active.attribution } : {}),
      terms: Object.fromEntries(rows.map((r) => [r.key, { singular: r.effective.singular, plural: r.effective.plural, ...(r.effective.short ? { short: r.effective.short } : {}) }])),
      ...(props.templates ? { meetingTemplates: props.templates } : {}),
      ...(props.statuses ? { statuses: props.statuses } : {}),
    }
    const url = URL.createObjectURL(new Blob([JSON.stringify(pack, null, 2) + '\n'], { type: 'application/json' }))
    const a = Object.assign(document.createElement('a'), { href: url, download: `${slug}-terminology-pack.json` })
    a.click()
    URL.revokeObjectURL(url)
    toast.success('Pack exported')
  }

  function setOverride(key: string, value: Partial<TermVal> | null) {
    const next = { ...overrides }
    if (value && Object.keys(value).length) next[key] = value
    else delete next[key]
    save(() => saveOverrides(slug, next), value ? 'Term updated' : 'Term reset', () => setEditing(null))
  }

  return (
    <div className="flex flex-col gap-7">
      <div className="flex items-center gap-4 rounded-xl bg-surface p-4 shadow-panel" data-testid="active-pack">
        <div className="min-w-0 flex-1">
          <div className="text-xs font-[550] text-faint">Active pack</div>
          <div className="text-lg font-semibold tracking-tight text-ink">
            {active ? active.name : 'Standard'} <span className="text-base font-[450] text-faint">· {active ? `v${active.version}${active.author ? ` · ${active.author}` : ''}` : 'built in'}</span>
          </div>
          {active?.attribution && <p className="mt-1 text-xs text-faint">{active.attribution}</p>}
        </div>
        {canEdit && (
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
            {props.previousName !== undefined && props.previousName !== null && (
              <Button loading={pending} title={`Go back to the previously applied pack${(props.historyDepth ?? 0) > 1 ? ` (${props.historyDepth} earlier packs in history)` : ''}`} onClick={() => save(() => revertPack(slug), 'Reverted')}><Undo2 size={14} strokeWidth={1.7} />Revert to {props.previousName}</Button>
            )}
            {active && <Button loading={pending} title="Reset to the built-in Standard terms and clear the pack history" onClick={() => save(() => resetToStandard(slug), 'Using Standard terms')}>Use Standard</Button>}
            <Button onClick={exportPack}><Download size={14} strokeWidth={1.7} />Export</Button>
            <Button variant="primary" onClick={() => setImportOpen(true)}><PackagePlus size={14} strokeWidth={1.7} />Import pack</Button>
          </div>
        )}
      </div>

      {props.preinstalled.length > 0 && (
        <Section title="Preinstalled packs" description="Provided by this server (MOTION_TERMINOLOGY_PACKS).">
          <Panel>
            {props.preinstalled.map((p) => (
              <div key={p.spec} className="flex flex-col gap-3 px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-base font-[550] text-ink">{p.preview ? p.preview.pack.name : p.spec}</div>
                    <div className="truncate text-sm text-faint">{p.error ?? `${p.spec}${p.preview ? ` · v${p.preview.pack.version}` : ''}`}</div>
                  </div>
                  {p.preview && (
                    <>
                      <Button variant="ghost" onClick={() => setOpenPre(openPre === p.spec ? null : p.spec)}>{openPre === p.spec ? 'Hide' : 'Preview'}</Button>
                      {canEdit && (
                        <Button
                          disabled={active?.id === p.preview.pack.id && active.version === p.preview.pack.version}
                          loading={pending}
                          onClick={() => save(() => applyPack(slug, p.preview!.pack), `${p.preview!.pack.name} applied`)}
                        >
                          {active?.id === p.preview.pack.id && active.version === p.preview.pack.version ? <><Check size={14} strokeWidth={2} />Applied</> : 'Apply'}
                        </Button>
                      )}
                    </>
                  )}
                </div>
                {p.preview && openPre === p.spec && <PackPreviewCard preview={p.preview} />}
              </div>
            ))}
          </Panel>
        </Section>
      )}

      <Section title="Terms" description="Every label in Motion comes from these. Custom overrides sit on top of the active pack and survive pack updates.">
        <div className="overflow-x-auto rounded-xl bg-surface shadow-panel">
          <table className="w-full min-w-[640px] text-left text-base" data-testid="terms-table">
            <thead>
              <tr className="border-b border-line text-xs font-[550] text-faint">
                <th className="px-4 py-2 font-[550]">Term</th>
                <th className="px-2 py-2 font-[550]">Singular</th>
                <th className="px-2 py-2 font-[550]">Plural</th>
                <th className="px-2 py-2 font-[550]">Short</th>
                <th className="w-24 px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line-faint">
              {rows.map((r) =>
                editing === r.key ? (
                  <EditRow key={r.key} row={r} pending={pending} onCancel={() => setEditing(null)} onSave={(v) => setOverride(r.key, v)} />
                ) : (
                  <tr key={r.key} className="group h-9 hover:bg-canvas/60">
                    <td className="px-4 text-body">
                      {r.label}
                      {r.override && <Badge tone="accent" className="ml-2">Custom</Badge>}
                    </td>
                    <td className="px-2 font-[550] text-ink">{r.effective.singular}</td>
                    <td className="px-2 text-ink">{r.effective.plural}</td>
                    <td className="px-2 text-body">{r.effective.short ?? <span className="text-faint">-</span>}</td>
                    <td className="px-4 text-right">
                      {canEdit && (
                        <span className="inline-flex gap-1 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
                          <Button size="icon" variant="ghost" aria-label={`Edit ${r.label}`} onClick={() => setEditing(r.key)}><Pencil size={13} strokeWidth={1.7} /></Button>
                          {r.override && <Button size="icon" variant="ghost" aria-label={`Reset ${r.label}`} disabled={pending} onClick={() => setOverride(r.key, null)}><RotateCcw size={13} strokeWidth={1.7} /></Button>}
                        </span>
                      )}
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
      </Section>
      <ImportPackDialog slug={slug} open={importOpen} onOpenChange={setImportOpen} />
    </div>
  )
}

function EditRow({ row, pending, onSave, onCancel }: { row: TermRow; pending: boolean; onSave: (v: Partial<TermVal>) => void; onCancel: () => void }) {
  const [v, setV] = useState({ singular: row.effective.singular, plural: row.effective.plural, short: row.effective.short ?? '' })
  function submit() {
    // Store only the fields that differ from the active pack, so the override stays minimal.
    const o: Partial<TermVal> = {}
    if (v.singular.trim() && v.singular.trim() !== row.base.singular) o.singular = v.singular.trim()
    if (v.plural.trim() && v.plural.trim() !== row.base.plural) o.plural = v.plural.trim()
    if (v.short.trim() && v.short.trim() !== (row.base.short ?? '')) o.short = v.short.trim()
    onSave(o)
  }
  const field = (k: 'singular' | 'plural' | 'short', max: number) => (
    <Input aria-label={`${row.label} ${k}`} value={v[k]} maxLength={max} onChange={(e) => setV({ ...v, [k]: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') onCancel() }} />
  )
  return (
    <tr className="bg-accent-soft/40">
      <td className="px-4 py-1.5 text-body">{row.label}</td>
      <td className="px-2 py-1.5">{field('singular', 60)}</td>
      <td className="px-2 py-1.5">{field('plural', 60)}</td>
      <td className="px-2 py-1.5">{field('short', 24)}</td>
      <td className="px-4 py-1.5 text-right">
        <span className="inline-flex gap-1">
          <Button size="sm" variant="primary" loading={pending} onClick={submit}>Save</Button>
          <Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
        </span>
      </td>
    </tr>
  )
}
