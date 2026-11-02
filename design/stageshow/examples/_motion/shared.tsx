import { Bot, Building2, CalendarDays, ChevronDown, Gauge, KeyRound, LayoutGrid, Palette, ScrollText, Type, Home, ListChecks, Mountain, Network, Search, Target, TriangleAlert, Users } from 'lucide-react'
import type { ReactNode } from 'react'
import './motion.css'

// Shared pieces for every Motion mockup: the white-label sidebar, the agent
// mark and the priority status glyph. Icons: lucide-react, chosen on
// purpose for its even 1.7 stroke, one size (15px) throughout.

export const I = { size: 15, strokeWidth: 1.7 }

// Terminology packs: every label in the product reads from one of these.
export type Terms = { priorities: string; metrics: string; meeting: string; issues: string; vision: string; chart: string }
export const STANDARD: Terms = { priorities: 'Priorities', metrics: 'Scorecard', meeting: 'Weekly meeting', issues: 'Issues', vision: 'Vision plan', chart: 'Accountability' }
export const EOS: Terms = { priorities: 'Rocks', metrics: 'Scorecard', meeting: 'Level 10', issues: 'Issues List', vision: 'V/TO', chart: 'A/C' }

export function AgentMark({ size = 18 }: { size?: number }) {
  return (
    <span className="k-agent" style={{ width: size, height: size }} aria-label="Agent">
      <Bot strokeWidth={2} />
    </span>
  )
}

export type Status = 'on' | 'off' | 'done'

// On track: a ring with a filled center; off track: a ring with a gap
// (a warning in shape as well as color); done: a filled check.
export function StatusGlyph({ s }: { s: Status }) {
  if (s === 'done') {
    return (
      <svg className="k-status" data-s="done" width="14" height="14" viewBox="0 0 14 14" aria-hidden>
        <circle cx="7" cy="7" r="6.5" fill="currentColor" />
        <path d="M4.3 7.2 6.1 9l3.6-3.8" fill="none" stroke="var(--ss-surface)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }
  return (
    <svg className="k-status" data-s={s} width="14" height="14" viewBox="0 0 14 14" aria-hidden>
      <circle cx="7" cy="7" r="5.6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeDasharray={s === 'off' ? '26 9.2' : undefined} transform="rotate(-60 7 7)" />
      {s === 'on' && <circle cx="7" cy="7" r="2.4" fill="currentColor" />}
    </svg>
  )
}

export function StatusPill({ s }: { s: Status }) {
  return <span className="k-pill" data-s={s}>{s === 'on' ? 'On track' : s === 'off' ? 'Off track' : 'Done'}</span>
}

type NavKey = 'home' | 'meeting' | 'priorities' | 'metrics' | 'issues' | 'todos' | 'vision' | 'chart' | 'agents' | 'activity' | 'settings'

export function Sidebar({ active, terms = STANDARD, brand = 'Vindex', label }: { active: NavKey; terms?: Terms; brand?: string; label?: (key: NavKey, text: string) => ReactNode }) {
  const t = (key: NavKey, text: string) => (label ? label(key, text) : text)
  const nav = (key: NavKey, icon: ReactNode, text: string, count?: number) => (
    <div className="k-nav" data-active={active === key || undefined} data-target={`nav-${key}`}>
      {icon}
      <span>{t(key, text)}</span>
      {count !== undefined && <span className="k-nav__count">{count}</span>}
    </div>
  )
  return (
    <div className="k-side">
      <div className="k-brand">
        {/* The customer's own wordmark, set in their brand settings */}
        <span className="k-brand__word">{brand}</span>
        <ChevronDown size={12} strokeWidth={1.8} color="var(--ss-icon)" />
      </div>
      <div className="k-search">
        <Search size={13} strokeWidth={1.8} />
        <span>Search</span>
        <span className="k-search__key">⌘K</span>
      </div>
      <div className="k-group">
        {nav('home', <Home {...I} />, 'Home')}
        {nav('todos', <ListChecks {...I} />, 'My to-dos', 4)}
      </div>
      <div className="k-group">
        <div className="k-section">Leadership team</div>
        {nav('meeting', <Users {...I} />, terms.meeting)}
        {nav('priorities', <Target {...I} />, terms.priorities)}
        {nav('metrics', <Gauge {...I} />, terms.metrics)}
        {nav('issues', <TriangleAlert {...I} />, terms.issues, 6)}
      </div>
      <div className="k-group">
        <div className="k-section">Company</div>
        {nav('vision', <Mountain {...I} />, terms.vision)}
        {nav('chart', <Network {...I} />, terms.chart)}
      </div>
      <div className="k-group">
        <div className="k-section">Workspace</div>
        {nav('agents', <Bot {...I} />, 'Agents', 3)}
      </div>
    </div>
  )
}

export function SettingsNav({ active }: { active: string }) {
  const item = (icon: ReactNode, label: string) => (
    <div className="k-nav" data-active={active === label || undefined}>{icon}<span>{label}</span></div>
  )
  return (
    <div className="k-side">
      <div className="k-brand"><span className="k-brand__word">Settings</span></div>
      <div className="k-group">
        <div className="k-section">Organization</div>
        {item(<Building2 {...I} />, 'General')}
        {item(<Palette {...I} />, 'Brand')}
        {item(<Type {...I} />, 'Terminology')}
        {item(<LayoutGrid {...I} />, 'Modules')}
        {item(<CalendarDays {...I} />, 'Calendar')}
        {item(<Users {...I} />, 'Members')}
      </div>
      <div className="k-group">
        <div className="k-section">Agents</div>
        {item(<Bot {...I} />, 'Connected agents')}
        {item(<KeyRound {...I} />, 'MCP & API keys')}
        {item(<ScrollText {...I} />, 'Audit log')}
      </div>
    </div>
  )
}
