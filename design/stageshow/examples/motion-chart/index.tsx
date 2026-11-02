import { Avatar, Stage, Window } from '../../kit'
import { AgentMark, Sidebar } from '../_motion/shared'
import '../_motion/motion.css'
import './chart.css'

// The Accountability chart: seats, not job titles. Each seat lists its few
// responsibilities and the person in it. The open Delivery seat links to the
// priority that will fill it, and a seat can name an agent that assists it
// (the Finance seat's Ops Agent) without the agent ever owning the seat.
// A still.

type Seat = { id: string; title: string; who?: string; roles: string[]; agent?: string; open?: string }
const TOP: Seat = { id: 'ceo', title: 'CEO', who: 'Oscar Hidalgo', roles: ['Vision and culture', 'Key relationships', 'New ideas'] }
const COO: Seat = { id: 'coo', title: 'President & COO', who: 'Maya Reyes', roles: ['Run the leadership team', 'Execute the plan', 'Hold people accountable'] }
const LEADS: Seat[] = [
  { id: 'sales', title: 'Sales & marketing', who: 'Theo Kim', roles: ['Pipeline and close rate', 'Brand and messaging'] },
  { id: 'delivery', title: 'Delivery', roles: ['Client outcomes', 'Project margins'], open: 'Hire a head of delivery' },
  { id: 'finance', title: 'Finance & operations', who: 'Ines Park', roles: ['Cash and reporting', 'Tools and vendors'], agent: 'Ops Agent' },
]

function SeatCard({ s }: { s: Seat }) {
  return (
    <div className="kc-seat" data-open={s.open ? true : undefined}>
      <div className="kc-seat__title">{s.title}</div>
      {s.who ? (
        <div className="kc-seat__who"><Avatar name={s.who} size={20} style={{ fontSize: 9.5 }} />{s.who}</div>
      ) : (
        <div className="kc-seat__who kc-seat__who--open"><span className="kc-open-disc" />Open seat</div>
      )}
      <ul className="kc-seat__roles">{s.roles.map((r) => <li key={r}>{r}</li>)}</ul>
      {s.agent && <div className="kc-seat__agent"><AgentMark size={16} />Assisted by {s.agent}</div>}
      {s.open && <div className="kc-seat__link">Priority · {s.open}</div>}
    </div>
  )
}

export default function MotionChart() {
  return (
    <Stage width={1000} height={600} fidelity="realistic" className="motion kc">
      {() => (
        <Window
          className="k-window kc-window"
          sidebar={<Sidebar active="chart" />}
          sidebarWidth={204}
          lead={<div className="kc-head"><span className="kc-head__title">Accountability</span><span className="kc-ver">Published · Nov 1</span></div>}
          toolbar={<div className="kc-tools"><div className="kc-seg"><span data-on>Chart</span><span>List</span></div><span className="k-btn">Edit draft</span></div>}
          body={{ className: 'kc-body', 'data-crop': true }}
        >
          <div className="kc-canvas">
            <div className="kc-tree">
              <div className="kc-level"><SeatCard s={TOP} /></div>
              <div className="kc-stem" />
              <div className="kc-level"><SeatCard s={COO} /></div>
              <div className="kc-stem" />
              <div className="kc-branch">
                {LEADS.map((s) => <div key={s.id} className="kc-leaf"><SeatCard s={s} /></div>)}
              </div>
            </div>
          </div>
        </Window>
      )}
    </Stage>
  )
}
