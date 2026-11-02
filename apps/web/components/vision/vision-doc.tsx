import type { ReactNode } from 'react'
import { AgentMark } from '@motion/ui/agent-mark'
import { StatusGlyph } from '@motion/ui/status-glyph'
import { cn } from '@motion/ui/cn'
import { fmtMonthYear, fmtYear, type FullSections, type IssueLite, type PriorityLite, type VisionLabels } from './shared'

export function Col({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-2.5">
      <div className="text-xs font-semibold uppercase tracking-[0.04em] text-faint">{title}</div>
      {children}
    </div>
  )
}

export function Section({ title, children, className, 'data-section': ds }: { title: ReactNode; children: ReactNode; className?: string; 'data-section'?: string }) {
  return (
    <section data-section={ds} className={cn('break-inside-avoid rounded-xl bg-surface p-4 shadow-[0_0_0_1px_var(--m-line)]', className)}>
      <div className="mb-2.5 text-sm font-semibold text-body">{title}</div>
      {children}
    </section>
  )
}

export function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-body">{label}</span>
      <b className="text-xl font-[640] tracking-[-0.02em] text-ink tabular-nums">{value || '—'}</b>
    </div>
  )
}

export const Empty = ({ children = 'Not set' }: { children?: ReactNode }) => <span className="text-sm text-faint">{children}</span>

export function Provenance({ agent, approver }: { agent: string; approver?: string }) {
  return (
    <span className="mt-1 flex items-center gap-1.5 text-xs font-normal text-accent-text">
      <AgentMark size={14} />
      {agent}
      {approver ? ` · approved by ${approver}` : ' · awaiting approval'}
    </span>
  )
}

export const statusToGlyph = (s: string) => (s === 'on_track' ? 'on' : s === 'done' ? 'done' : 'off') as 'on' | 'off' | 'done'

export type Goal = FullSections['oneYear']['goals'][number]

export function GoalsList({ goals, names }: { goals: Goal[]; names: Record<string, string> }) {
  if (!goals.length) return <Empty />
  return (
    <ol className="m-0 flex list-decimal flex-col gap-1.5 pl-[18px] text-base text-ink marker:text-xs marker:text-faint">
      {goals.map((g, i) => {
        const prov = g.provenance
        const byAgent = prov?.proposedBy.type === 'agent'
        return (
          <li key={i} className={cn(byAgent && '-ml-2 list-inside rounded-lg bg-accent-soft px-2 py-1.5 marker:text-accent-text')}>
            <span className={cn(byAgent && 'font-semibold')}>{g.text}</span>
            {byAgent && prov && (
              <Provenance agent={names[prov.proposedBy.id] ?? 'Agent'} approver={prov.approvedBy ? (names[prov.approvedBy.id] ?? 'a teammate') : undefined} />
            )}
          </li>
        )
      })}
    </ol>
  )
}

function PictureBlock({ p, names }: { p: FullSections['oneYear']; names: Record<string, string> }) {
  return (
    <>
      <div className="flex flex-wrap gap-x-7 gap-y-3">
        <Figure label="Revenue" value={p.revenue} />
        <Figure label="Profit" value={p.profit} />
        {p.measurables.map((m, i) => (
          <Figure key={i} label={m.name} value={m.value} />
        ))}
      </div>
      <div className="mt-3">
        <GoalsList goals={p.goals} names={names} />
      </div>
    </>
  )
}

export function QuarterPriorities({ items, quarter }: { items: PriorityLite[]; quarter: string }) {
  if (!items.length) return <Empty>No priorities this quarter</Empty>
  return (
    <div className="flex flex-col" data-quarter={quarter}>
      {items.map((p) => (
        <div key={p.id} className="flex h-[30px] items-center gap-2.5 text-base text-ink">
          <StatusGlyph status={statusToGlyph(p.status)} />
          <span className="truncate">{p.title}</span>
        </div>
      ))}
    </div>
  )
}

export const quarterTitle = (q: string) => q.replace(/^(\d{4})-(Q\d)$/, '$2 $1')

/** The one-page vision plan: the long view on the left, this year on the right. Pure presentation. */
export function VisionDocument({
  sections: s,
  labels: L,
  names,
  priorities,
  issues,
}: {
  sections: FullSections
  labels: VisionLabels
  names: Record<string, string>
  priorities: PriorityLite[]
  issues: IssueLite[]
}) {
  return (
    <div className="mx-auto grid max-w-[1100px] grid-cols-1 gap-7 md:grid-cols-2 print:grid-cols-2">
      <Col title="Where we're going">
        <Section title={L.coreValues}>
          {s.coreValues.length ? (
            <div className="flex flex-wrap gap-1.5">
              {s.coreValues.map((v, i) => (
                <span key={i} className="rounded-full bg-canvas px-2.5 py-1 text-sm font-[550] text-ink">
                  {v}
                </span>
              ))}
            </div>
          ) : (
            <Empty />
          )}
        </Section>
        <Section title={L.coreFocus}>
          <KV k="Purpose" v={s.coreFocus.purpose} />
          <KV k="Niche" v={s.coreFocus.niche} />
        </Section>
        <Section title={`${L.longRangeTarget}${s.longRangeTarget.date ? ` · ${fmtYear(s.longRangeTarget.date)}` : ''}`}>
          {s.longRangeTarget.text ? <div className="text-[16px] font-[620] tracking-[-0.015em] text-ink">{s.longRangeTarget.text}</div> : <Empty />}
        </Section>
        <Section title={L.marketing}>
          <KV k="Target market" v={s.marketing.targetMarket} />
          <div className="grid grid-cols-[104px_1fr] gap-2.5 py-[3px] text-sm">
            <span className="text-body">Uniques</span>
            {s.marketing.uniques.length ? (
              <ul className="m-0 list-disc pl-4 font-[550] text-ink">
                {s.marketing.uniques.map((u, i) => (
                  <li key={i}>{u}</li>
                ))}
              </ul>
            ) : (
              <Empty />
            )}
          </div>
          <KV k="Proven process" v={s.marketing.provenProcess} />
          <KV k="Guarantee" v={s.marketing.guarantee} />
        </Section>
        <Section title={`${L.threeYear}${s.threeYear.date ? ` · ${fmtMonthYear(s.threeYear.date)}` : ''}`}>
          <PictureBlock p={s.threeYear} names={names} />
        </Section>
      </Col>

      <Col title="This year">
        <Section title={`${L.oneYear}${s.oneYear.date ? ` · ${fmtMonthYear(s.oneYear.date)}` : ''}`}>
          <PictureBlock p={s.oneYear} names={names} />
        </Section>
        <Section title={`${quarterTitle(s.quarterly.quarter)} ${L.priority}`}>
          {(s.quarterly.revenue || s.quarterly.profit) && (
            <div className="mb-2 flex gap-7">
              <Figure label="Revenue" value={s.quarterly.revenue} />
              <Figure label="Profit" value={s.quarterly.profit} />
            </div>
          )}
          <QuarterPriorities items={priorities} quarter={s.quarterly.quarter} />
        </Section>
        <Section title={`${L.longTermIssues} · ${issues.length}`}>
          {issues.length ? (
            <div className="flex flex-col">
              {issues.map((i) => (
                <div key={i.id} className="flex min-h-[30px] items-center text-base text-ink">
                  {i.title}
                </div>
              ))}
            </div>
          ) : (
            <Empty>None</Empty>
          )}
        </Section>
      </Col>
    </div>
  )
}

export function KV({ k, v }: { k: string; v: string }) {
  return (
    <div className="grid grid-cols-[104px_1fr] gap-2.5 py-[3px] text-sm">
      <span className="text-body">{k}</span>
      {v ? <b className="font-[550] text-ink">{v}</b> : <Empty />}
    </div>
  )
}
