import { ChevronRight, ListFilter, Plus } from 'lucide-react'
import { Avatar, Check, Collapse, Count, Meter, Stage, Text, Window, type Act } from '../../kit'
import { AgentMark, Sidebar, StatusGlyph, StatusPill, type Status } from '../_movara/shared'
import '../_movara/movara.css'
import './priorities.css'

// Movara's home screen for a team: this quarter's priorities, with the
// selected one open in a detail pane. The story is the product's reason to
// exist: an agent, working through the MCP server, ticks a milestone and
// the change lands everywhere at once (the checklist, the progress in the
// list row, the activity feed) with the agent named as the actor.
//
// Beats: the agent's row in the checklist goes pending; the check lands;
// the milestone count rolls 3 -> 4 in the pane and the list; the activity
// entry drops in at the top of the feed. Plays once; the poster is the
// payoff.

type S = { pending: boolean; done: boolean }
const initial: S = { pending: false, done: false }
const poster: S = { pending: false, done: true }

type P = { title: string; owner: string; s: Status; m: [number, number]; due: string; selected?: boolean }
const ROWS: P[] = [
  { title: 'Ship the agent MCP server v1', owner: 'Oscar Hidalgo', s: 'on', m: [3, 5], due: 'Dec 31', selected: true },
  { title: 'Launch the partner portal', owner: 'Maya Reyes', s: 'on', m: [3, 4], due: 'Dec 15' },
  { title: 'Close four enterprise pilots', owner: 'Theo Kim', s: 'off', m: [1, 4], due: 'Dec 31' },
  { title: 'Hire a head of delivery', owner: 'Ines Park', s: 'on', m: [2, 3], due: 'Nov 30' },
  { title: 'Cut onboarding to seven days', owner: 'Sam Ortiz', s: 'off', m: [0, 3], due: 'Dec 31' },
  { title: 'SOC 2 Type I readiness', owner: 'Ines Park', s: 'done', m: [4, 4], due: 'Oct 31' },
]

const TEAM: P[] = [
  { title: 'Standardize the delivery playbook', owner: 'Sam Ortiz', s: 'on', m: [2, 4], due: 'Dec 15' },
  { title: 'Ninety percent on-time milestones', owner: 'Theo Kim', s: 'on', m: [1, 3], due: 'Dec 31' },
]

const MILESTONES = ['Data model approved', 'Tool schemas drafted', 'Scoped agent tokens', 'Audit log for agent writes', 'Public beta with two teams']

async function script(a: Act<S>) {
  await a.wait(1100)
  a.mark('pending')
  await a.set({ pending: true })
  await a.wait(1300)
  a.mark('done')
  await a.set({ pending: false, done: true })
  await a.wait(3200)
}

function PriorityRow({ p, s }: { p: P; s: S }) {
  const done = p.selected ? p.m[0] + (s.done ? 1 : 0) : p.m[0]
  return (
    <div className="kp-row" data-selected={p.selected || undefined}>
      <StatusGlyph s={p.s} />
      <span className="kp-row__title">{p.title}</span>
      <span className="kp-row__progress">
        <Meter value={done / p.m[1]} tone={p.s === 'off' ? 'danger' : p.s === 'done' ? 'ink' : 'success'} className="kp-meter" />
        <span className="kp-row__count">
          <Count value={done} />/{p.m[1]}
        </span>
      </span>
      <Avatar name={p.owner} size={20} style={{ fontSize: 9.5 }} />
    </div>
  )
}

export default function MovaraPriorities({ theme = 'light' }: { theme?: 'light' | 'dark' }) {
  return (
    <Stage width={1000} height={560} initial={initial} poster={poster} script={script} play="once" fidelity="realistic" theme={theme} className="movara kp">
      {(s) => {
        const sel = ROWS[0]!
        const doneCount = sel.m[0] + (s.done ? 1 : 0)
        return (
          <Window
            className="k-window kp-window"
            sidebar={<Sidebar active="priorities" />}
            sidebarWidth={204}
            lead={
              <div className="kp-head">
                <span className="kp-head__title">Priorities</span>
                <ChevronRight size={13} strokeWidth={1.8} color="var(--ss-icon-faint)" />
                <span className="kp-head__q">Q4 2026</span>
                <div className="kp-tabs">
                  <span className="kp-tab" data-active>Company</span>
                  <span className="kp-tab">Team</span>
                  <span className="kp-tab">Mine</span>
                </div>
              </div>
            }
            toolbar={
              <div className="kp-tools">
                <span className="k-btn"><ListFilter size={13} strokeWidth={1.8} />Filter</span>
                <span className="k-btn" data-primary><Plus size={13} strokeWidth={2} />New priority</span>
              </div>
            }
            body={{ className: 'kp-body', 'data-crop': true }}
          >
            <div className="kp-split">
              <div className="kp-list">
                <div className="kp-summary">
                  <div className="kp-summary__big">
                    <span className="kp-summary__num">4</span>
                    <span className="kp-summary__of">of 6 on track</span>
                  </div>
                  <div className="kp-summary__bar">
                    <span style={{ flex: 3 }} data-s="on" />
                    <span style={{ flex: 1 }} data-s="done" />
                    <span style={{ flex: 2 }} data-s="off" />
                  </div>
                  <span className="kp-summary__week">Week 9 of 13</span>
                </div>
                <div className="kp-rows">
                  {ROWS.map((p) => <PriorityRow key={p.title} p={p} s={s} />)}
                </div>
                <div className="kp-group">Delivery team</div>
                <div className="kp-rows">
                  {TEAM.map((p) => <PriorityRow key={p.title} p={p} s={s} />)}
                </div>
              </div>

              <aside className="kp-pane">
                <div className="kp-pane__top">
                  <StatusPill s="on" />
                  <span className="kp-pane__due">Due Dec 31</span>
                </div>
                <Text className="kp-pane__title">{sel.title}</Text>
                <div className="kp-pane__owner">
                  <Avatar name={sel.owner} size={18} style={{ fontSize: 9 }} />
                  <span>{sel.owner}</span>
                </div>

                <div className="kp-pane__label">
                  Milestones
                  <span className="kp-pane__label-count"><Count value={doneCount} /> of 5</span>
                </div>
                <div className="kp-ms">
                  {MILESTONES.map((m, i) => {
                    const isAgent = i === 3
                    const on = i < 3 || (isAgent && s.done)
                    return (
                      <div key={m} className="kp-ms__row" data-on={on || undefined}>
                        <Check on={on} pending={isAgent && s.pending} size={16} />
                        <span className="kp-ms__text">{m}</span>
                      </div>
                    )
                  })}
                </div>

                <div className="kp-pane__label">Activity</div>
                <div className="kp-feed">
                  <Collapse open={s.done} reveal="drop">
                    <div className="kp-event" data-new>
                      <AgentMark size={20} />
                      <div className="kp-event__body">
                        <div><b>Ops Agent</b> completed “Audit log for agent writes”</div>
                        <div className="kp-event__meta">via MCP · on behalf of Oscar · just now</div>
                      </div>
                    </div>
                  </Collapse>
                  <div className="kp-event">
                    <Avatar name="Oscar Hidalgo" size={20} style={{ fontSize: 9 }} />
                    <div className="kp-event__body">
                      <div><b>Oscar</b> set status to On track</div>
                      <div className="kp-event__meta">Weekly meeting · Nov 3</div>
                    </div>
                  </div>
                </div>
              </aside>
            </div>
          </Window>
        )
      }}
    </Stage>
  )
}

