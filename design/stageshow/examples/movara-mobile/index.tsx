import { Avatar, Check, Phone, Stage } from '../../kit'
import { AgentMark } from '../_movara/shared'
import '../_movara/movara.css'
import './mobile.css'

// Movara on a phone: "My week" is what a person needs between meetings. Report
// my numbers before the meeting, tick my to-dos, see my priorities. A still,
// pinned from the top and running off the bottom.

export default function MovaraMobile() {
  return (
    <Stage width={460} height={620} fidelity="realistic" className="movara kmo">
      {() => (
        <Phone width={360} className="kmo-phone">
          <div className="kmo-app">
            <div className="kmo-top">
              <div>
                <div className="kmo-eyebrow">Week 9 of 13 · Q4</div>
                <div className="kmo-title">My week</div>
              </div>
              <Avatar name="Oscar Hidalgo" size={32} style={{ fontSize: 13 }} />
            </div>

            <div className="kmo-next">
              <div>
                <div className="kmo-next__label">Next meeting</div>
                <div className="kmo-next__name">Leadership weekly · Tue 9:00</div>
              </div>
              <span className="kmo-next__btn">Join</span>
            </div>

            <div className="kmo-section">Report your numbers</div>
            <div className="kmo-card">
              <div className="kmo-metric">
                <span className="kmo-metric__name">Client NPS<small>Goal ≥ 50</small></span>
                <span className="kmo-metric__val" data-ok>59</span>
              </div>
              <div className="kmo-metric">
                <span className="kmo-metric__name">Qualified leads<small>Goal ≥ 10</small></span>
                <span className="kmo-metric__val" data-ok data-agent><AgentMark size={14} />13</span>
              </div>
              <div className="kmo-metric">
                <span className="kmo-metric__name">Days to onboard<small>Goal ≤ 7</small></span>
                <span className="kmo-metric__input">Enter value</span>
              </div>
            </div>

            <div className="kmo-section">To-dos <span>2 of 4 done</span></div>
            <div className="kmo-card">
              {[
                ['Draft the MCP tool list', true],
                ['Review partner contract', true],
                ['Send pilot pricing to Theo', false],
                ['Prep Q1 planning agenda', false],
              ].map(([t, d]) => (
                <div key={t as string} className="kmo-todo" data-done={d || undefined}>
                  <Check on={d as boolean} size={20} />
                  <span>{t}</span>
                </div>
              ))}
            </div>
          </div>
        </Phone>
      )}
    </Stage>
  )
}
