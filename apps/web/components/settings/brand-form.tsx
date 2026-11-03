'use client'

import { Check, TriangleAlert, Upload, X } from 'lucide-react'
import { useRef, useState, type CSSProperties } from 'react'
import { Button } from '@motion/ui/button'
import { Field } from '@motion/ui/field'
import { Input } from '@motion/ui/input'
import { toast } from '@motion/ui/toaster'
import { updateBranding } from '@/app/(app)/[org]/settings/actions'
import { NavIcon } from '@/components/shell/icons'
import { Panel } from './ui'
import { useSave } from './use-save'

const MAX_LOGO = 200 * 1024
const PRESETS = ['#2f5bea', '#7c3aed', '#0e7490', '#15803d', '#c2410c', '#be123c', '#15181d']

function lum(hex: string) {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!
}
/** WCAG contrast ratio between the accent and white text. */
export const contrastWithWhite = (hex: string) => 1.05 / (lum(hex) + 0.05)
const isHex = (v: string) => /^#[0-9a-fA-F]{6}$/.test(v)

function LogoField({ label, value, onChange, dark }: { label: string; value?: string; onChange: (v: string | null) => void; dark?: boolean }) {
  const ref = useRef<HTMLInputElement>(null)
  function pick(file: File | undefined) {
    if (!file) return
    if (file.size > MAX_LOGO) return void toast.error('Logo must be 200KB or smaller.')
    if (!/^image\/(png|jpeg|svg\+xml|webp)$/.test(file.type)) return void toast.error('Use a PNG, SVG, JPEG or WebP image.')
    const r = new FileReader()
    r.onload = () => onChange(String(r.result))
    r.readAsDataURL(file)
  }
  return (
    <Field label={label} hint="PNG, SVG or WebP, up to 200KB.">
      <div className="flex items-center gap-3">
        <div className="grid h-14 w-40 place-items-center rounded-lg shadow-[0_0_0_1px_var(--m-line)]" style={{ background: dark ? '#17181c' : '#ffffff' }}>
          {value ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={value} alt={`${label} preview`} className="max-h-8 max-w-[130px] object-contain" />
          ) : (
            <span className="text-xs" style={{ color: dark ? '#9aa1ab' : '#9aa1ab' }}>No logo</span>
          )}
        </div>
        <input ref={ref} type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" className="sr-only" aria-label={`${label} file`} onChange={(e) => { pick(e.target.files?.[0]); e.target.value = '' }} />
        <Button onClick={() => ref.current?.click()}><Upload size={14} strokeWidth={1.7} />Upload</Button>
        {value && <Button variant="ghost" onClick={() => onChange(null)}><X size={14} strokeWidth={1.7} />Remove</Button>}
      </div>
    </Field>
  )
}

export function BrandForm({ slug, init, orgName, canEdit }: { slug: string; init: { wordmark: string; logoLight?: string; logoDark?: string; accent: string }; orgName: string; canEdit: boolean }) {
  const [wordmark, setWordmark] = useState(init.wordmark)
  const [light, setLight] = useState(init.logoLight)
  const [dark, setDark] = useState(init.logoDark)
  const [accent, setAccent] = useState(init.accent)
  const { save, pending } = useSave()
  const valid = isHex(accent)
  const ratio = valid ? contrastWithWhite(accent) : 0
  const passes = ratio >= 4.5
  const dirty = wordmark !== init.wordmark || light !== init.logoLight || dark !== init.logoDark || accent !== init.accent
  const style = { '--accent': valid ? accent : init.accent } as CSSProperties

  function submit() {
    save(
      () =>
        updateBranding(slug, {
          wordmark: wordmark.trim() || undefined,
          logoLight: light ?? null,
          logoDark: dark ?? null,
          accent: valid ? accent : undefined,
        }),
      'Brand saved',
    )
  }

  return (
    <form className="flex flex-col gap-6" onSubmit={(e) => { e.preventDefault(); submit() }}>
      <Panel className="divide-y-0">
        <div className="flex flex-col gap-5 p-4">
          <Field label="Wordmark" htmlFor="brand-wordmark" hint="Shown at the top of the sidebar when no logo is set.">
            <Input id="brand-wordmark" value={wordmark} onChange={(e) => setWordmark(e.target.value)} maxLength={40} disabled={!canEdit} placeholder={orgName} />
          </Field>
          <div className="grid gap-5 sm:grid-cols-2">
            <LogoField label="Logo (light theme)" value={light} onChange={(v) => setLight(v ?? undefined)} />
            <LogoField label="Logo (dark theme)" value={dark} onChange={(v) => setDark(v ?? undefined)} dark />
          </div>
          <Field label="Accent color" htmlFor="brand-accent">
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="color"
                aria-label="Pick accent color"
                value={valid ? accent : '#2f5bea'}
                onChange={(e) => setAccent(e.target.value)}
                disabled={!canEdit}
                className="h-7 w-9 cursor-pointer rounded-md border-0 bg-transparent p-0"
              />
              <Input id="brand-accent" value={accent} onChange={(e) => setAccent(e.target.value)} className="w-28 font-mono" maxLength={7} disabled={!canEdit} aria-invalid={!valid} />
              <div className="flex gap-1.5">
                {PRESETS.map((c) => (
                  <button key={c} type="button" aria-label={`Use ${c}`} onClick={() => setAccent(c)} className="size-5 rounded-full shadow-[0_0_0_1px_var(--m-line)] outline-none focus-visible:ring-2 focus-visible:ring-accent" style={{ background: c }} />
                ))}
              </div>
            </div>
            <div className={`mt-1 flex items-center gap-1.5 text-sm ${!valid ? 'text-danger-text' : passes ? 'text-success-text' : 'text-warning-text'}`} data-testid="contrast">
              {!valid ? 'Enter a 6-digit hex color like #2f5bea.' : passes ? <><Check size={14} strokeWidth={2} />White text contrast {ratio.toFixed(2)}:1 passes WCAG AA</> : <><TriangleAlert size={14} strokeWidth={2} />White text contrast {ratio.toFixed(2)}:1 is below WCAG AA (4.5:1). Pick a darker color.</>}
            </div>
          </Field>
        </div>
      </Panel>

      <div>
        <div className="mb-2 text-xs font-[550] text-faint">Live preview</div>
        <div className="flex overflow-hidden rounded-xl bg-canvas shadow-panel" style={style} data-testid="brand-preview">
          <div className="flex w-48 shrink-0 flex-col gap-3 p-3 max-sm:w-28">
            {light ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={light} alt="" className="h-4 max-w-[120px] self-start object-contain" />
            ) : (
              <span className="px-1 text-[14px] font-[650] tracking-[-0.015em] text-ink">{wordmark || orgName}</span>
            )}
            <div className="flex flex-col gap-px">
              <div className="flex h-7 items-center gap-2 rounded-[7px] bg-nav-active px-2 text-base font-[500] text-ink"><NavIcon name="priorities" />Priorities</div>
              <div className="flex h-7 items-center gap-2 rounded-[7px] px-2 text-base font-[500] text-nav"><NavIcon name="issues" />Issues</div>
            </div>
          </div>
          <div className="m-2 ml-0 flex flex-1 flex-col items-start gap-3 rounded-lg bg-surface p-4 shadow-panel">
            <div className="flex items-center gap-2">
              <button type="button" className="h-7 whitespace-nowrap rounded-md bg-accent px-3 text-sm font-[550] text-white">Primary action</button>
              <button type="button" className="h-7 rounded-md px-3 text-sm font-[550] text-accent-text shadow-[0_0_0_1px_var(--m-line)]">Secondary</button>
            </div>
            <span className="inline-flex h-5 items-center rounded-full bg-accent-soft px-2 text-xs font-[550] text-accent-text">Accent badge</span>
          </div>
        </div>
      </div>

      {canEdit && (
        <div className="flex justify-end">
          <Button type="submit" variant="primary" disabled={!dirty || !valid} loading={pending}>Save brand</Button>
        </div>
      )}
    </form>
  )
}
