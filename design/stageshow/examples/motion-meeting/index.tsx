import { Check, Collapse, Count, Facepile, Avatar, Stage, Window, type Act } from '../../kit'
import { AgentMark } from '../_motion/shared'
import '../_motion/motion.css'
import './meeting.css'

// The weekly meeting, live. Meeting mode swaps the app's navigation for the
// agenda: every section with its time, the current one counting down. The
// team is in "Solve issues", working the second of three issues they
// picked. A note-taking agent has already captured the follow-up to-do from
// the discussion. The facilitator marks the issue solved: the button
// confirms on itself, the queue row takes its check, and the count rolls
// 1 -> 2 of 3 solved. Plays once; the poster is the payoff.
//
// Real strings: the agenda, the meeting title, the issue being solved, its
// source, the captured to-do, the queue's three picked issues.

type S = { solved: boolean; press: boolean }
const initial: S = { solved: false, press: false }
const poster: S = { solved: true, press: false }

const AGENDA: { name: string; min: number; done?: boolean; now?: boolean }[] = [
  { name: 'Check-in', min: 5, done: true },
  { name: 'Scorecard', min: 5, done: true },
  { name: 'Priorities', min: 5, done: true },
  { name: 'Headlines', min: 5, done: true },
  { name: 'To-do review', min: 5, done: true },
  { name: 'Solve issues', min: 60, now: true },
  { name: 'Wrap-up', min: 5 },
]

async function script(a: Act<S>) {
  await a.wait(1100)
  a.mark('solve')
  await a.move({ at: 'solve', x: 0.5, y: 0.55 })
  await a.wait(250)
  await a.set({ press: true })
  await a.click()
  await a.set({ press: false, solved: true })
  await a.move({ at: 'rest', x: 0.5, y: 0.5 })
  await a.wait(3000)
}

function Agenda() {
  return (
    <div className="km-agenda">
      <div className="km-agenda__label">Agenda · 90 min</div>
      {AGENDA.map((s) => (
        <div key={s.name} className="km-item" data-now={s.now || undefined} data-done={s.done || undefined}>
          <span className="km-item__mark">{s.done ? <Check on size={14} /> : <span className="km-item__dot" />}</span>
          <span className="km-item__name">{s.name}</span>
          <span className="km-item__time">{s.now ? '38:12' : `${s.min} min`}</span>
          {s.now && <span className="km-item__bar"><span style={{ width: '36%' }} /></span>}
        </div>
      ))}
      <div className="km-agenda__label km-room">In the room</div>
      {['Oscar Hidalgo', 'Maya Reyes', 'Theo Kim', 'Ines Park'].map((n) => (
        <div key={n} className="km-person">
          <Avatar name={n} size={18} style={{ fontSize: 9 }} />
          <span>{n}</span>
        </div>
      ))}
      <div className="km-person">
        <AgentMark size={18} />
        <span>Notes Agent</span>
        <span className="km-person__role">Notes</span>
      </div>
    </div>
  )
}

export default function MotionMeeting() {
  return (
    <Stage width={1000} height={560} initial={initial} poster={poster} script={script} play="once" fidelity="realistic" cursor={{ at: { x: 900, y: 520 } }} className="motion km">
      {(s) => (
        <Window
          className="k-window km-window"
          sidebar={<Agenda />}
          sidebarWidth={210}
          lead={
            <div className="km-head">
              <span className="km-live">Live</span>
              <span className="km-head__title">Leadership weekly</span>
              <span className="km-head__date">Nov 3</span>
            </div>
          }
          toolbar={
            <div className="km-tools">
              <span className="km-people">
                <Facepile names={['Oscar Hidalgo', 'Maya Reyes', 'Theo Kim', 'Ines Park', 'Sam Ortiz']} size={22} />
                <span className="km-notetaker"><AgentMark size={22} /></span>
              </span>
              <span className="km-clock">51:48</span>
              <span className="k-btn">End meeting</span>
            </div>
          }
          body={{ className: 'km-body', 'data-crop': true }}
        >
          <div className="km-main">
            <div className="km-titlebar">
              <span className="km-section">Solve issues</span>
              <span className="km-solved"><Count value={s.solved ? 2 : 1} /> of 3 solved</span>
              <div className="km-steps">
                <span data-past>Identify</span>
                <span data-past={s.solved || undefined} data-current={!s.solved || undefined}>Discuss</span>
                <span data-current={s.solved || undefined}>Solve</span>
              </div>
            </div>

            <section className="km-focus">
              <div className="km-focus__meta">
                <Avatar name="Theo Kim" size={18} style={{ fontSize: 9 }} />
                <span>Theo Kim</span>
                <span className="km-from">From priority · Close four enterprise pilots</span>
              </div>
              <div className="km-focus__title">Partner onboarding takes three weeks</div>
              <div className="km-focus__note">Pilots stall in week two waiting on security review and SSO setup. Agreed to run both in parallel and give partners a fixed seven-day checklist.</div>

              <div className="km-captured">
                <div className="km-captured__label">
                  <AgentMark size={16} />
                  Captured by Notes Agent
                </div>
                <div className="km-todo">
                  <Check on={false} size={16} />
                  <span className="km-todo__title">Draft the seven-day partner onboarding checklist</span>
                  <Avatar name="Maya Reyes" size={18} style={{ fontSize: 9 }} />
                  <span className="km-todo__due">Nov 10</span>
                </div>
              </div>

              <div className="km-actions">
                <span className="k-btn">Not solved</span>
                <span className="k-btn km-solve" data-primary data-target="solve" data-cursor="pointer" data-pressed={s.press || undefined} data-solved={s.solved || undefined}>
                  <span className="km-solve__a">Mark solved</span>
                  <span className="km-solve__b"><Check on size={14} />Solved</span>
                </span>
              </div>
            </section>

            <div className="km-queue" data-target="rest">
              {[
                { t: 'Renewal pricing for legacy clients', done: true },
                { t: 'Partner onboarding takes three weeks', done: s.solved, now: !s.solved },
                { t: 'Delivery team is short one senior PM' },
              ].map((q, i) => (
                <div key={q.t} className="km-q" data-now={q.now || undefined} data-done={q.done || undefined}>
                  <span className="km-q__n">{i + 1}</span>
                  <span className="km-q__t">{q.t}</span>
                  <Check on={!!q.done} size={16} />
                </div>
              ))}
            </div>
          </div>
        </Window>
      )}
    </Stage>
  )
}
