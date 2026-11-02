import { Stage, Window } from '../../kit'
import { AgentMark, Sidebar } from '../_motion/shared'
import '../_motion/motion.css'
import './vision.css'

// The Vision plan as one page: the company's long view on the left, this
// year's plan on the right. A still. The goal the Notes Agent proposed (and
// Oscar approved, in the Agents mockup) sits in the 1-year plan with its
// provenance: new, who proposed it and who approved it.
//
// Real strings: it is a document, so its content is the subject.

export default function MotionVision() {
  return (
    <Stage width={1000} height={600} fidelity="realistic" className="motion kv">
      {() => (
        <Window
          className="k-window kv-window"
          sidebar={<Sidebar active="vision" />}
          sidebarWidth={204}
          lead={
            <div className="kv-head">
              <span className="kv-head__title">Vision plan</span>
              <span className="kv-ver">Published v4 · Nov 3</span>
            </div>
          }
          toolbar={<div className="kv-tools"><span className="k-btn">Export PDF</span><span className="k-btn">Edit draft</span></div>}
          body={{ className: 'kv-body', 'data-crop': true }}
        >
          <div className="kv-doc">
            <div className="kv-col">
              <div className="kv-colhead">Where we're going</div>
              <section className="kv-sec">
                <div className="kv-sec__t">Core values</div>
                <div className="kv-values">
                  <span>Own the outcome</span><span>Clients first</span><span>Leave it better</span>
                </div>
              </section>
              <section className="kv-sec">
                <div className="kv-sec__t">Core focus</div>
                <div className="kv-kv"><span>Purpose</span><b>Help growing companies run with clarity</b></div>
                <div className="kv-kv"><span>Niche</span><b>Operating rhythm for 20–250 person firms</b></div>
              </section>
              <section className="kv-sec">
                <div className="kv-sec__t">10-year goal · 2036</div>
                <div className="kv-big">1,000 companies running on our rhythm</div>
              </section>
              <section className="kv-sec">
                <div className="kv-sec__t">3-year picture · Dec 2029</div>
                <div className="kv-figs">
                  <div><span>Revenue</span><b>$12M</b></div>
                  <div><span>Profit</span><b>20%</b></div>
                  <div><span>Clients</span><b>240</b></div>
                </div>
              </section>
            </div>

            <div className="kv-col">
              <div className="kv-colhead">This year</div>
              <section className="kv-sec">
                <div className="kv-sec__t">1-year plan · Dec 2027</div>
                <div className="kv-figs">
                  <div><span>Revenue</span><b>$4.2M</b></div>
                  <div><span>Profit</span><b>14%</b></div>
                </div>
                <ol className="kv-goals">
                  <li>Launch Motion Cloud for 50 paying teams</li>
                  <li>Two certified implementation partners</li>
                  <li>Net revenue retention above 110%</li>
                  <li className="kv-new">
                    <span>Win three partner referrals a quarter</span>
                    <span className="kv-prov"><AgentMark size={14} />Notes Agent · approved by Oscar</span>
                  </li>
                </ol>
              </section>
              <section className="kv-sec">
                <div className="kv-sec__t">Q4 2026 priorities</div>
                <div className="kv-pri"><span className="kv-dot" data-s="on" />Ship the agent MCP server v1</div>
                <div className="kv-pri"><span className="kv-dot" data-s="on" />Launch the partner portal</div>
                <div className="kv-pri"><span className="kv-dot" data-s="off" />Close four enterprise pilots</div>
              </section>
              <section className="kv-sec">
                <div className="kv-sec__t">Long-term issues · 2</div>
                <div className="kv-pri">Enter the UK market in 2028 or 2029?</div>
                <div className="kv-pri">Build or partner for payroll features</div>
              </section>
            </div>
          </div>
        </Window>
      )}
    </Stage>
  )
}
