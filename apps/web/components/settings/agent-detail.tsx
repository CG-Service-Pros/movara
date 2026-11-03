'use client'

import { Check, Copy, KeyRound, ShieldAlert } from 'lucide-react'
import { useState } from 'react'
import { AgentMark } from '@movara/ui/agent-mark'
import { Badge } from '@movara/ui/badge'
import { Button } from '@movara/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@movara/ui/dialog'
import { Input } from '@movara/ui/input'
import { Segmented } from '@movara/ui/segmented'
import { Switch } from '@movara/ui/switch'
import { toast } from '@movara/ui/toaster'
import { issueKey, revokeAgent, revokeKey, setAgentPreset, setAgentStatus, updateAgentScopes } from '@/app/(app)/[org]/settings/actions'
import { PRESET_INFO, presetLabel, type PresetChoice } from './presets'
import { Mono, NativeSelect, Panel, Section, ago, fmtDate } from './ui'
import { useSave } from './use-save'

export const SCOPE_INFO: { scope: string; label: string; description: string; gated?: string }[] = [
  { scope: 'read', label: 'Read', description: 'See everything the owner can see.' },
  { scope: 'write:own_todos', label: 'Write own to-dos', description: 'Create and complete only the owner’s own to-dos.' },
  { scope: 'write:todos', label: 'Write to-dos', description: 'Create, edit and complete to-dos.' },
  { scope: 'write:issues', label: 'Write issues', description: 'Create, rank and solve issues.' },
  { scope: 'write:headlines', label: 'Write headlines', description: 'Share and review headlines.' },
  { scope: 'write:metrics', label: 'Write metrics', description: 'Record scorecard values and create metrics.' },
  { scope: 'write:priorities', label: 'Write priorities', description: 'Create priorities, set status and milestones.', gated: 'Deletes need approval' },
  { scope: 'write:meetings', label: 'Write meetings', description: 'Run meetings, capture notes and ratings.' },
  { scope: 'capture:meetings', label: 'Capture meeting notes', description: 'Push notes and action items into meetings; items wait for review.' },
  { scope: 'propose:vision', label: 'Propose vision changes', description: 'Draft changes to the vision plan.', gated: 'Needs approval' },
  { scope: 'propose:chart', label: 'Propose chart changes', description: 'Draft changes to the accountability chart.', gated: 'Needs approval' },
  { scope: 'admin', label: 'Admin', description: 'Packs, members and agents. Every action waits for a person.', gated: 'Needs approval' },
]

export type AgentDetailData = {
  id: string; name: string; client: string | null; owner: string; status: string; lastSeenAt: string | null; scopes: string[]; preset: string | null
  keys: { id: string; name: string | null; prefix: string; createdAt: string; lastUsedAt: string | null; revokedAt: string | null; expiresAt: string | null }[]
}

function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [done, setDone] = useState(false)
  return (
    <Button
      size="sm"
      onClick={async () => {
        await navigator.clipboard.writeText(text).catch(() => undefined)
        setDone(true)
        setTimeout(() => setDone(false), 1800)
      }}
    >
      {done ? <Check size={13} strokeWidth={2} /> : <Copy size={13} strokeWidth={1.7} />}
      {done ? 'Copied' : label}
    </Button>
  )
}

function ConnectSnippets({ mcpUrl, apiKey }: { mcpUrl: string; apiKey: string }) {
  const [tab, setTab] = useState<'code' | 'desktop'>('code')
  const code = `claude mcp add --transport http movara ${mcpUrl} \\\n  --header "Authorization: Bearer ${apiKey}"`
  const desktop = JSON.stringify({ mcpServers: { movara: { command: 'npx', args: ['-y', 'mcp-remote', mcpUrl, '--header', `Authorization: Bearer ${apiKey}`] } } }, null, 2)
  const text = tab === 'code' ? code : desktop
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <Segmented aria-label="Client" value={tab} onValueChange={setTab} options={[{ value: 'code', label: 'Claude Code' }, { value: 'desktop', label: 'Claude Desktop' }]} />
        <CopyButton text={text} label="Copy snippet" />
      </div>
      <pre className="overflow-x-auto rounded-lg bg-canvas p-3 font-mono text-xs leading-relaxed text-ink" data-testid="snippet">{text}</pre>
      {tab === 'desktop' && <p className="text-xs text-faint">Add this to claude_desktop_config.json, then restart Claude Desktop.</p>}
    </div>
  )
}

export const NOTES_INSTRUCTION = 'After each meeting, push the Granola notes and action items to the matching Movara meeting using meeting_capture_notes; assign to-dos to me unless someone else is named.'

export function AgentDetail({ slug, agent, mcpUrl, canManage, presetScopes }: { slug: string; agent: AgentDetailData; mcpUrl: string; canManage: boolean; presetScopes: Record<string, string[]> }) {
  const { save, pending } = useSave()
  const [scopes, setScopes] = useState(new Set(agent.scopes))
  const [keyOpen, setKeyOpen] = useState(false)
  const [keyName, setKeyName] = useState('')
  const [issued, setIssued] = useState<string | null>(null)
  const [confirmRevoke, setConfirmRevoke] = useState(false)
  const active = agent.status !== 'revoked'
  const [preset, setPreset] = useState<string>(agent.preset ?? 'custom')

  function choosePreset(p: PresetChoice) {
    setPreset(p)
    if (p === 'custom') return
    setScopes(new Set(presetScopes[p]))
    save(() => setAgentPreset(slug, agent.id, p), `Preset set to ${presetLabel(p)}`)
  }

  function toggle(scope: string, on: boolean) {
    const next = new Set(scopes)
    if (on) next.add(scope)
    else next.delete(scope)
    setScopes(next)
    setPreset('custom')
    save(() => updateAgentScopes(slug, agent.id, [...next]), 'Scopes updated')
  }

  function create() {
    save(() => issueKey(slug, agent.id, keyName.trim()), 'Key created', (d) => {
      if (d?.key) setIssued(d.key)
      setKeyName('')
    })
  }

  return (
    <div className="flex flex-col gap-7">
      <div className="flex flex-wrap items-center gap-3 rounded-xl bg-surface p-4 shadow-panel">
        <AgentMark size={36} />
        {/* min width keeps the name readable; badges and actions wrap below on narrow screens */}
        <div className="min-w-[12rem] flex-1">
          <div className="text-lg font-semibold tracking-tight text-ink">{agent.name}</div>
          <div className="text-sm text-body">{agent.client ?? 'No client set'} · owned by {agent.owner} · last seen {ago(agent.lastSeenAt)}</div>
        </div>
        <Badge tone={agent.preset ? 'accent' : 'neutral'}>{presetLabel(agent.preset)}</Badge>
        <Badge tone={agent.status === 'active' ? 'success' : agent.status === 'paused' ? 'warning' : 'danger'} className="capitalize">{agent.status}</Badge>
        {canManage && active && (
          <Button loading={pending} onClick={() => save(() => setAgentStatus(slug, agent.id, agent.status === 'active' ? 'paused' : 'active'), agent.status === 'active' ? 'Agent paused' : 'Agent resumed')}>
            {agent.status === 'active' ? 'Pause' : 'Resume'}
          </Button>
        )}
      </div>

      {agent.preset === 'notes_integration' && active && (
        <Section title="Connect your notes app" description="Granola and Plaud do not talk to Movara directly. Your AI agent reads the notes and pushes them here.">
          <div className="flex flex-col gap-4 rounded-xl bg-surface p-4 shadow-panel" data-testid="notes-helper">
            <ol className="flex list-decimal flex-col gap-3 pl-5 text-base text-body marker:font-[600] marker:text-faint">
              <li>
                Connect your agent (Claude, ChatGPT, n8n…) to the MCP endpoint <Mono>{mcpUrl}</Mono>. Sign in with OAuth, or{' '}
                {canManage ? <button type="button" className="font-[550] text-accent-text hover:underline" onClick={() => { setIssued(null); setKeyOpen(true) }}>issue an API key</button> : 'use an API key'} for this agent.
              </li>
              <li>
                Give your agent this standing instruction:
                <div className="mt-2 flex items-start gap-2 rounded-lg bg-canvas p-3">
                  <p className="min-w-0 flex-1 text-sm leading-relaxed text-ink" data-testid="notes-instruction">{NOTES_INSTRUCTION}</p>
                  <CopyButton text={NOTES_INSTRUCTION} />
                </div>
              </li>
              <li>Review what it sends in your <a href={`/${slug}/inbox`} className="font-[550] text-accent-text hover:underline">Inbox</a>. Nothing is created until you accept it.</li>
            </ol>
          </div>
        </Section>
      )}

      <Section title="Scopes" description="What this agent may do. An API key can only narrow these, never widen them." actions={
        <label className="flex items-center gap-2 text-sm text-body">Preset
          <NativeSelect aria-label="Preset" value={preset} disabled={!canManage || !active || pending} onChange={(e) => choosePreset(e.target.value as PresetChoice)}>
            {PRESET_INFO.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
          </NativeSelect>
        </label>
      }>
        <Panel data-testid="scopes">
          {SCOPE_INFO.map((s) => (
            <div key={s.scope} className="flex items-center gap-4 px-4 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-base font-[550] text-ink">
                  <label htmlFor={`scope-${s.scope}`}>{s.label}</label>
                  <Mono>{s.scope}</Mono>
                  {s.gated && <Badge tone="warning"><ShieldAlert size={11} strokeWidth={2} />{s.gated}</Badge>}
                </div>
                <p className="text-sm text-body">{s.description}</p>
              </div>
              <Switch id={`scope-${s.scope}`} checked={scopes.has(s.scope)} disabled={!canManage || !active || pending} onCheckedChange={(v) => toggle(s.scope, v)} />
            </div>
          ))}
        </Panel>
      </Section>

      <Section
        title="API keys"
        description={<>For scripts and workflows. MCP endpoint <Mono>{mcpUrl}</Mono></>}
        actions={canManage && active && <Button variant="primary" onClick={() => { setIssued(null); setKeyOpen(true) }}><KeyRound size={14} strokeWidth={1.7} />Issue key</Button>}
      >
        <Panel data-testid="agent-keys">
          {agent.keys.map((k) => (
            <div key={k.id} className="flex items-center gap-3 px-4 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="truncate text-base font-[550] text-ink">{k.name || 'Unnamed key'}</div>
                <div className="text-sm text-body"><Mono>{k.prefix}…</Mono> · created {fmtDate(k.createdAt)} · last used {ago(k.lastUsedAt)}</div>
              </div>
              {k.revokedAt ? <Badge tone="danger">Revoked</Badge> : canManage && <Button size="sm" variant="ghost" loading={pending} onClick={() => save(() => revokeKey(slug, k.id), 'Key revoked')}>Revoke</Button>}
            </div>
          ))}
          {agent.keys.length === 0 && <div className="px-4 py-8 text-center text-base text-body">No keys yet.</div>}
        </Panel>
      </Section>

      {canManage && active && (
        <Section title="Danger zone">
          <div className="flex items-center justify-between rounded-xl bg-surface p-4 shadow-panel">
            <div>
              <div className="text-base font-[550] text-ink">Revoke agent</div>
              <p className="text-sm text-body">Disables the agent and all of its keys. Its past activity stays in the audit log.</p>
            </div>
            {confirmRevoke ? (
              <span className="flex gap-1">
                <Button variant="danger" loading={pending} onClick={() => save(() => revokeAgent(slug, agent.id), 'Agent revoked')}>Yes, revoke</Button>
                <Button variant="ghost" onClick={() => setConfirmRevoke(false)}>Cancel</Button>
              </span>
            ) : (
              <Button variant="danger" onClick={() => setConfirmRevoke(true)}>Revoke agent</Button>
            )}
          </div>
        </Section>
      )}

      <Dialog open={keyOpen} onOpenChange={setKeyOpen}>
        <DialogContent className="max-w-[560px]">
          <DialogHeader>
            <DialogTitle>{issued ? 'Copy your API key' : `Issue a key for ${agent.name}`}</DialogTitle>
            <DialogDescription>{issued ? 'This is the only time the key is shown. Store it somewhere safe.' : 'Give it a name so you recognize it later.'}</DialogDescription>
          </DialogHeader>
          {!issued ? (
            <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); create() }}>
              <Input aria-label="Key name" autoFocus placeholder="e.g. Claude Code on laptop" value={keyName} onChange={(e) => setKeyName(e.target.value)} />
              <DialogFooter>
                <Button variant="ghost" onClick={() => setKeyOpen(false)}>Cancel</Button>
                <Button type="submit" variant="primary" loading={pending}>Issue key</Button>
              </DialogFooter>
            </form>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-2 rounded-lg bg-canvas p-2 pl-3">
                <code className="min-w-0 flex-1 break-all font-mono text-xs text-ink" data-testid="issued-key">{issued}</code>
                <CopyButton text={issued} />
              </div>
              <div className="text-sm text-body">MCP endpoint: <Mono>{mcpUrl}</Mono></div>
              <ConnectSnippets mcpUrl={mcpUrl} apiKey={issued} />
              <DialogFooter><Button variant="primary" onClick={() => { setKeyOpen(false); toast('Key hidden. Issue a new one if you lose it.') }}>Done</Button></DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
