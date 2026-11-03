'use client'

import { Bot, CheckCircle2, KeyRound, XCircle } from 'lucide-react'
import { useState, useTransition } from 'react'
import { Badge } from '@movara/ui/badge'
import { Button } from '@movara/ui/button'
import { Field } from '@movara/ui/field'
import { Input } from '@movara/ui/input'
import { Switch } from '@movara/ui/switch'
import { Textarea } from '@movara/ui/textarea'
import { saveCoachSettings, testCoachConnection } from '@/app/(app)/[org]/settings/actions'
import { NativeSelect, Panel, Section } from './ui'
import { useSave } from './use-save'

export type UsageView = {
  month: string
  inputTokens: number
  outputTokens: number
  costEstimateUsd: number
  limit: number | null
  overLimit: boolean
  byFeature: { feature: string; inputTokens: number; outputTokens: number; costEstimateUsd: number }[]
  byPerson: { name: string; inputTokens: number; outputTokens: number; costEstimateUsd: number }[]
}
type SettingsView = {
  enabled: boolean; provider: 'openai' | 'openai_compatible'; baseUrl: string | null; model: string; reasoningEffort: string
  monthlyTokenLimit: number | null; coachName: string; coachPersonality: string; hasKey: boolean; keyLast4: string | null
}

const n = (v: number) => v.toLocaleString('en-US')
const usd = (v: number) => (v === 0 ? '$0.00' : v < 0.01 ? `$${v.toFixed(4)}` : `$${v.toFixed(2)}`)
const FEATURES: Record<string, string> = { coach: 'Coach chat', extract: 'Meeting-notes extraction' }
const EFFORTS = [['none', 'None'], ['low', 'Low'], ['medium', 'Medium'], ['high', 'High']] as const

export function CoachForm({ slug, canEdit, mock, myFirstName, settings, usage, profile }: {
  slug: string; canEdit: boolean; mock: boolean; myFirstName: string
  settings: SettingsView | null; usage: UsageView | null; profile: { enabled: boolean; ready: boolean; coachName: string; coachPersonality: string } | null
}) {
  if (!canEdit || !settings) {
    return (
      <Panel>
        <div className="flex flex-col gap-2 p-4">
          <div className="flex items-center gap-2 text-base font-[550] text-ink"><Bot size={15} strokeWidth={1.7} />{profile?.coachName ?? 'Coach'}
            <Badge tone={profile?.ready ? 'success' : 'neutral'}>{profile?.ready ? 'Available' : profile?.enabled ? 'Not fully set up' : 'Off'}</Badge></div>
          <p className="text-base text-body">{profile?.coachPersonality}</p>
          <p className="text-sm text-faint">Only admins can change the AI provider, key and Coach personality.</p>
        </div>
      </Panel>
    )
  }
  return <Editable slug={slug} mock={mock} myFirstName={myFirstName} s={settings} usage={usage} />
}

function Editable({ slug, mock, myFirstName, s, usage }: { slug: string; mock: boolean; myFirstName: string; s: SettingsView; usage: UsageView | null }) {
  const { save, pending } = useSave()
  const [enabled, setEnabled] = useState(s.enabled)
  const [provider, setProvider] = useState(s.provider)
  const [baseUrl, setBaseUrl] = useState(s.baseUrl ?? '')
  const [model, setModel] = useState(s.model)
  const [effort, setEffort] = useState(s.reasoningEffort)
  const [limit, setLimit] = useState(s.monthlyTokenLimit == null ? '' : String(s.monthlyTokenLimit))
  const [name, setName] = useState(s.coachName)
  const [personality, setPersonality] = useState(s.coachPersonality)
  const [newKey, setNewKey] = useState('')
  const [replacing, setReplacing] = useState(!s.hasKey)
  const [testing, startTest] = useTransition()
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null)
  const [confirmRemove, setConfirmRemove] = useState(false)

  const dirty =
    enabled !== s.enabled || provider !== s.provider || (baseUrl.trim() || null) !== s.baseUrl || model !== s.model || effort !== s.reasoningEffort ||
    (limit.trim() === '' ? null : Number(limit)) !== s.monthlyTokenLimit || name !== s.coachName || personality !== s.coachPersonality || newKey.trim() !== ''
  const compatMissingUrl = provider === 'openai_compatible' && !baseUrl.trim()

  function submit() {
    save(
      () => saveCoachSettings(slug, {
        enabled, provider, baseUrl: baseUrl.trim() || null, model: model.trim(), reasoningEffort: effort as never,
        monthlyTokenLimit: limit.trim() === '' ? null : Math.max(0, Math.floor(Number(limit))), coachName: name.trim(), coachPersonality: personality.trim(),
        ...(newKey.trim() ? { apiKey: newKey.trim() } : {}),
      }),
      'Coach settings saved',
      () => { setNewKey(''); setReplacing(false) },
    )
  }

  return (
    <div className="flex flex-col gap-7">
      <Panel>
        <div className="flex items-center gap-4 px-4 py-3">
          <div className="min-w-0 flex-1">
            <label htmlFor="coach-enabled" className="text-base font-[550] text-ink">Enable Coach</label>
            <p className="text-sm text-body">Turns on the Coach panel and AI note extraction for everyone in the organization. Needs an API key.</p>
          </div>
          <Switch id="coach-enabled" checked={enabled} onCheckedChange={setEnabled} />
        </div>
      </Panel>

      <Section title="Provider" description="Bring your own key. Movara never sends data anywhere else.">
        <Panel className="divide-y-0">
          <div className="flex flex-col gap-4 p-4">
            <Field label="Provider" htmlFor="coach-provider">
              <NativeSelect id="coach-provider" value={provider} onChange={(e) => setProvider(e.target.value as typeof provider)}>
                <option value="openai">OpenAI</option>
                <option value="openai_compatible">OpenAI-compatible (OpenRouter, Azure, local…)</option>
              </NativeSelect>
            </Field>
            {provider === 'openai_compatible' && (
              <Field label="Base URL" htmlFor="coach-base" hint="e.g. https://openrouter.ai/api/v1" error={compatMissingUrl && enabled ? 'Required for an OpenAI-compatible provider.' : undefined}>
                <Input id="coach-base" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://openrouter.ai/api/v1" />
              </Field>
            )}
            <Field label="API key" htmlFor="coach-key" hint="Write-only. Stored encrypted; it is never shown again.">
              {s.hasKey && !replacing ? (
                <div className="flex items-center gap-2" data-testid="key-set">
                  <span className="inline-flex h-7 flex-1 items-center gap-2 rounded-md bg-canvas px-2.5 font-mono text-sm text-ink"><KeyRound size={13} strokeWidth={1.7} className="text-icon" />•••• {s.keyLast4}</span>
                  <Button onClick={() => setReplacing(true)}>Replace</Button>
                  {confirmRemove ? (
                    <>
                      <Button variant="danger" loading={pending} onClick={() => save(() => saveCoachSettings(slug, { apiKey: null }), 'Key removed', () => setConfirmRemove(false))}>Yes, remove</Button>
                      <Button variant="ghost" onClick={() => setConfirmRemove(false)}>Cancel</Button>
                    </>
                  ) : <Button variant="ghost" onClick={() => setConfirmRemove(true)}>Remove</Button>}
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Input id="coach-key" type="password" autoComplete="off" value={newKey} onChange={(e) => setNewKey(e.target.value)} placeholder="sk-…" />
                  {s.hasKey && <Button variant="ghost" onClick={() => { setReplacing(false); setNewKey('') }}>Cancel</Button>}
                </div>
              )}
            </Field>
            <div className="grid gap-4 sm:grid-cols-[1fr_160px]">
              <Field label="Model" htmlFor="coach-model" hint="Low-cost OpenAI model, about $0.20 per million input tokens. Any model id your provider accepts works.">
                <Input id="coach-model" value={model} onChange={(e) => setModel(e.target.value)} placeholder="gpt-5.6-luna" />
              </Field>
              <Field label="Reasoning effort" htmlFor="coach-effort">
                <NativeSelect id="coach-effort" value={effort} onChange={(e) => setEffort(e.target.value)}>{EFFORTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</NativeSelect>
              </Field>
            </div>
            <Field label="Monthly token limit" htmlFor="coach-limit" hint="Input plus output tokens across the organization. Leave empty for no limit.">
              <Input id="coach-limit" inputMode="numeric" value={limit} onChange={(e) => setLimit(e.target.value.replace(/[^\d]/g, ''))} placeholder="No limit" className="max-w-[220px]" />
            </Field>
          </div>
        </Panel>
      </Section>

      <Section title="Identity" description="How Coach introduces itself and talks to your team.">
        <Panel className="divide-y-0">
          <div className="flex flex-col gap-4 p-4">
            <Field label="Coach name" htmlFor="coach-name"><Input id="coach-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} className="max-w-[260px]" /></Field>
            <Field label="Personality" htmlFor="coach-personality" hint="Plain-language instructions on tone and style.">
              <Textarea id="coach-personality" rows={3} value={personality} onChange={(e) => setPersonality(e.target.value)} maxLength={2000} />
            </Field>
            <div className="flex items-center gap-2 rounded-lg bg-canvas px-3 py-2 text-base text-body" data-testid="coach-preview">
              <Bot size={14} strokeWidth={1.7} className="shrink-0 text-ink" />
              <span>Hi {myFirstName}, I&apos;m <span className="font-[550] text-ink">{name.trim() || 'Coach'}</span>. {personality.trim().split(/(?<=[.!?])\s/)[0]}</span>
            </div>
          </div>
        </Panel>
      </Section>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Button
            loading={testing}
            disabled={dirty || (!s.hasKey && !mock) || pending}
            title={dirty ? 'Save your changes first' : undefined}
            onClick={() => startTest(async () => { const r = await testCoachConnection(slug); setResult(r.ok ? { ok: true, text: r.data?.message ?? 'Connected' } : { ok: false, text: r.error }) })}
          >
            Test connection
          </Button>
          {result && (
            <span role="status" className={`inline-flex items-center gap-1.5 text-sm ${result.ok ? 'text-success-text' : 'text-danger-text'}`} data-testid="test-result">
              {result.ok ? <CheckCircle2 size={14} strokeWidth={1.8} /> : <XCircle size={14} strokeWidth={1.8} />}{result.text}
            </span>
          )}
        </div>
        <Button variant="primary" onClick={submit} loading={pending} disabled={!dirty || !name.trim() || !model.trim()}>Save changes</Button>
      </div>

      {usage && (
        <Section title="Usage this month" description={new Date(`${usage.month}-01T00:00:00Z`).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })}>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4" data-testid="coach-usage">
            <Stat label="Tokens in" value={n(usage.inputTokens)} />
            <Stat label="Tokens out" value={n(usage.outputTokens)} />
            <Stat label="Estimated cost" value={usd(usage.costEstimateUsd)} />
            <Stat label="Limit" value={usage.limit == null ? 'None' : n(usage.limit)} sub={usage.overLimit ? 'Limit reached' : usage.limit != null ? `${Math.min(100, Math.round(((usage.inputTokens + usage.outputTokens) / Math.max(1, usage.limit)) * 100))}% used` : undefined} />
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <UsageTable title="By feature" rows={usage.byFeature.map((f) => ({ name: FEATURES[f.feature] ?? f.feature, ...f }))} />
            <UsageTable title="By person" rows={usage.byPerson} />
          </div>
        </Section>
      )}
    </div>
  )
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl bg-surface p-4 shadow-panel">
      <div className="text-xs font-[550] text-faint">{label}</div>
      <div className="mt-1 text-xl font-[620] leading-none tracking-tight tabular-nums text-ink">{value}</div>
      {sub && <div className="mt-1.5 text-xs text-faint">{sub}</div>}
    </div>
  )
}

function UsageTable({ title, rows }: { title: string; rows: { name: string; inputTokens: number; outputTokens: number; costEstimateUsd: number }[] }) {
  return (
    <Panel>
      <div className="px-4 py-2 text-xs font-[550] text-faint">{title}</div>
      {rows.map((r) => (
        <div key={r.name} className="flex items-center gap-3 px-4 py-2 text-sm">
          <span className="min-w-0 flex-1 truncate text-ink">{r.name}</span>
          <span className="tabular-nums text-body">{n(r.inputTokens)} in · {n(r.outputTokens)} out</span>
          <span className="w-14 text-right tabular-nums text-faint">{usd(r.costEstimateUsd)}</span>
        </div>
      ))}
      {rows.length === 0 && <div className="px-4 py-4 text-sm text-faint">No usage yet this month.</div>}
    </Panel>
  )
}
