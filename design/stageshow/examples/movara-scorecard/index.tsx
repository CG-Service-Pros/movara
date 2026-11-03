import { Avatar, Collapse, Count, Stage, Window, type Act } from '../../kit'
import { AgentMark } from '../_movara/shared'
import '../_movara/movara.css'
import './scorecard.css'

// The scorecard, filled in by an agent. A sales agent connected over MCP
// records this week's qualified leads: its mark arrives in the empty cell
// (dark while it writes, gray after, as provenance), the value is written in, the cell turns from "missing" to on track,
// and the header count rolls from 3 to 4 a beat later. An activity line at
// the foot names the tool call. Plays once; the poster is the payoff.
//
// Real strings: every metric and value (a scorecard is dense real data by
// nature; five rows keep it short), the agent's name, the activity line.

type S = { tag: boolean; typed: string; done: boolean; log: boolean }
const initial: S = { tag: false, typed: '', done: false, log: false }
const poster: S = { tag: true, typed: '13', done: true, log: true }

type Cell = number | null
type M = { name: string; owner: string; goal: string; test: (v: number) => boolean; fmt: (v: number) => string; weeks: Cell[] }
const pct = (v: number) => `${v}%`
const k = (v: number) => `$${v}k`
const n = (v: number) => `${v}`
const ROWS: M[] = [
  { name: 'Qualified leads', owner: 'Maya Reyes', goal: '≥ 10', test: (v) => v >= 10, fmt: n, weeks: [12, 9, 11, 14, null] },
  { name: 'Revenue booked', owner: 'Theo Kim', goal: '≥ $40k', test: (v) => v >= 40, fmt: k, weeks: [46, 38, 52, 41, 44] },
  { name: 'Projects on schedule', owner: 'Sam Ortiz', goal: '≥ 90%', test: (v) => v >= 90, fmt: pct, weeks: [92, 88, 95, 91, 93] },
  { name: 'Client NPS', owner: 'Ines Park', goal: '≥ 50', test: (v) => v >= 50, fmt: n, weeks: [54, 61, 48, 57, 59] },
  { name: 'Days to onboard', owner: 'Sam Ortiz', goal: '≤ 7', test: (v) => v <= 7, fmt: n, weeks: [11, 9, 10, 8, 9] },
]
const WEEKS = ['Oct 6', 'Oct 13', 'Oct 20', 'Oct 27', 'Nov 3']

async function script(a: Act<S>) {
  await a.wait(1000)
  a.mark('tag')
  await a.set({ tag: true })
  await a.wait(700)
  a.mark('type')
  await a.type('typed', '13', { interval: 160 })
  await a.wait(350)
  a.mark('commit')
  await a.set({ done: true })
  await a.wait(500)
  await a.set({ log: true })
  await a.wait(3000)
}

export default function MovaraScorecard() {
  return (
    <Stage width={800} height={424} initial={initial} poster={poster} script={script} play="once" fidelity="realistic" className="movara ksc">
      {(s) => {
        const onTrack = 3 + (s.done ? 1 : 0)
        return (
          <Window
            className="k-window ksc-window"
            lead={
              <div className="ksc-head">
                <span className="ksc-head__title">Scorecard</span>
                <span className="ksc-head__team">Leadership team · weekly</span>
              </div>
            }
            toolbar={
              <span className="ksc-count" data-target="count">
                <Count value={onTrack} /> of 5 on track this week
              </span>
            }
            body={{ className: 'ksc-body', 'data-crop': true }}
          >
            <div className="ksc-table">
              <div className="ksc-row ksc-row--head">
                <span>Metric</span>
                <span>Goal</span>
                {WEEKS.map((w, i) => <span key={w} className="ksc-num" data-now={i === 4 || undefined}>{w}</span>)}
              </div>
              {ROWS.map((m, r) => (
                <div key={m.name} className="ksc-row">
                  <span className="ksc-metric">
                    <Avatar name={m.owner} size={20} style={{ fontSize: 9 }} />
                    <span>{m.name}</span>
                  </span>
                  <span className="ksc-goal">{m.goal}</span>
                  {m.weeks.map((v, i) => {
                    const target = r === 0 && i === 4
                    if (target) {
                      const val = s.typed ? Number(s.typed) : null
                      return (
                        <span key={i} className="ksc-num ksc-cell" data-now data-target="cell" data-editing={(s.tag && !s.done) || undefined} data-state={s.done ? 'on' : 'missing'}>
                          {(s.tag || s.done) && <span className="ksc-by" data-live={(s.tag && !s.done) || undefined}><AgentMark size={14} /></span>}
                          {val === null ? <span className="ksc-missing">Missing</span> : m.fmt(val)}
                        </span>
                      )
                    }
                    const off = v !== null && !m.test(v)
                    return (
                      <span key={i} className="ksc-num ksc-cell" data-now={i === 4 || undefined} data-state={off ? 'off' : 'on'}>
                        {v === null ? '' : m.fmt(v)}
                      </span>
                    )
                  })}
                </div>
              ))}
              <Collapse open={s.log} reveal="drop">
                <div className="ksc-log">
                  <AgentMark size={18} />
                  <span><b>Sales Agent</b> recorded Qualified leads = 13 for Nov 3</span>
                  <code className="ksc-log__call">record_metric_values · from HubSpot</code>
                </div>
              </Collapse>
            </div>
          </Window>
        )
      }}
    </Stage>
  )
}
