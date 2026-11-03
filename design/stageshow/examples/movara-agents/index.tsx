import { Copy } from 'lucide-react'
import { Avatar, Check, Collapse, Stage, States, Toggle, Window, type Act } from '../../kit'
import { AgentMark, SettingsNav } from '../_movara/shared'
import '../_movara/movara.css'
import './agents.css'

// Connected agents: each agent is an actor with an owner, a client, scoped
// permissions and a token, and anything consequential waits for a person.
// The Notes Agent asks to add a goal to the Vision plan; the admin approves
// it; the button confirms on itself and the audit log records who approved
// what. Plays once; the poster is the payoff.
//
// Real strings: the three agents, the selected agent's scopes, the request,
// the audit entries.

type S = { approved: boolean; press: boolean }
const initial: S = { approved: false, press: false }
const poster: S = { approved: true, press: false }

const AGENTS = [
  { name: 'Ops Agent', client: 'Claude Code · MCP', owner: 'Oscar Hidalgo', seen: '2m ago' },
  { name: 'Notes Agent', client: 'Meeting notes · MCP', owner: 'Maya Reyes', seen: 'now', selected: true },
  { name: 'Sales Agent', client: 'HubSpot workflow · API', owner: 'Theo Kim', seen: '1h ago' },
]
const SCOPES: { label: string; hint: string; on: boolean; approval?: boolean }[] = [
  { label: 'Read everything', hint: 'Priorities, scorecard, issues, meetings', on: true },
  { label: 'Write to-dos and issues', hint: 'Create, assign, complete', on: true },
  { label: 'Record metrics', hint: 'Scorecard values', on: false },
  { label: 'Propose vision changes', hint: 'Always waits for approval', on: true, approval: true },
]

async function script(a: Act<S>) {
  await a.wait(1200)
  a.mark('approve')
  await a.move({ at: 'approve', x: 0.5, y: 0.55 })
  await a.set({ press: true })
  await a.click()
  await a.set({ press: false, approved: true })
  await a.wait(3000)
}

export default function MovaraAgents() {
  return (
    <Stage width={1000} height={580} initial={initial} poster={poster} script={script} play="once" fidelity="realistic" cursor={{ at: { x: 940, y: 540 } }} className="movara ka">
      {(s) => (
        <Window className="k-window ka-window" sidebar={<SettingsNav active="Connected agents" />} sidebarWidth={196} lead={<span className="ka-crumb">Connected agents</span>} toolbar={<span className="k-btn" data-primary>Connect agent</span>} body={{ className: 'ka-body', 'data-crop': true }}>
          <div className="ka-split">
            <div className="ka-list">
              {AGENTS.map((g) => (
                <div key={g.name} className="ka-agent" data-selected={g.selected || undefined}>
                  <AgentMark size={28} />
                  <div className="ka-agent__who">
                    <div className="ka-agent__name">{g.name}</div>
                    <div className="ka-agent__client">{g.client}</div>
                  </div>
                  <span className="ka-agent__seen" data-live={g.seen === 'now' || undefined}>{g.seen}</span>
                </div>
              ))}
              <div className="ka-connect">
                <div className="ka-connect__label">MCP endpoint</div>
                <div className="ka-connect__url">
                  <span>vindex.movara.app/mcp</span>
                  <Copy size={13} strokeWidth={1.8} />
                </div>
                <div className="ka-connect__hint">Works with any MCP client: Claude, ChatGPT, Cursor, n8n. Each agent signs in with OAuth and gets its own scopes.</div>
              </div>
            </div>

            <div className="ka-detail">
              <section className="ka-request" data-approved={s.approved || undefined}>
                <div className="ka-request__head">
                  <AgentMark size={18} />
                  <span><b>Notes Agent</b> wants to change the Vision plan</span>
                </div>
                <div className="ka-request__what">
                  <span className="ka-request__where">1-year plan · add goal</span>
                  <span className="ka-request__goal">Win three partner referrals a quarter</span>
                </div>
                <div className="ka-request__actions">
                  <span className="ka-request__from">From the Nov 3 weekly meeting</span>
                  <span className="k-btn">Decline</span>
                  <span className="k-btn ka-approve" data-primary data-target="approve" data-cursor="pointer" data-pressed={s.press || undefined} data-done={s.approved || undefined}>
                    <States value={s.approved ? 'done' : 'idle'} states={{ idle: 'Approve', done: <span className="ka-done"><Check on size={14} />Approved</span> }} />
                  </span>
                </div>
              </section>

              <div className="ka-label">Permissions</div>
              <div className="ka-scopes">
                {SCOPES.map((sc) => (
                  <div key={sc.label} className="ka-scope">
                    <div>
                      <div className="ka-scope__label">{sc.label}{sc.approval && <span className="ka-tag">Needs approval</span>}</div>
                      <div className="ka-scope__hint">{sc.hint}</div>
                    </div>
                    <Toggle on={sc.on} />
                  </div>
                ))}
              </div>

              <div className="ka-label">Audit log</div>
              <div className="ka-log">
                <Collapse open={s.approved} reveal="drop">
                  <div className="ka-entry">
                    <Avatar name="Oscar Hidalgo" size={18} style={{ fontSize: 9 }} />
                    <span><b>Oscar</b> approved <b>Notes Agent</b>: add goal to 1-year plan</span>
                    <span className="ka-entry__t">now</span>
                  </div>
                </Collapse>
                <div className="ka-entry">
                  <AgentMark size={18} />
                  <span><b>Notes Agent</b> created 3 to-dos in Leadership weekly</span>
                  <span className="ka-entry__t">4m</span>
                </div>
              </div>
            </div>
          </div>
        </Window>
      )}
    </Stage>
  )
}
