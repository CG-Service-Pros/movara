import { ArrowRight, Bot, Building2, KeyRound, ScrollText, CalendarDays, LayoutGrid, Palette, Type, Users } from 'lucide-react'
import { Check, Collapse, Field, Segmented, Spinner, Stage, States, Window, type Act } from '../../kit'
import { I } from '../_movara/shared'
import '../_movara/movara.css'
import './import.css'

// Importing a terminology pack. Settings → Terminology, the Import dialog
// open over it. The admin types the community EOS pack's npm name; Movara
// fetches only its pack.json, validates it, and previews exactly what will
// change before anything is applied. Apply confirms on the button itself.
//
// Real strings: the settings nav, the dialog, the package name being typed,
// the pack's identity, the term changes, the attribution, the actions.

type S = { typed: string; loading: boolean; preview: boolean; applied: boolean; press: boolean }
const NAME = '@movara-community/pack-eos'
const initial: S = { typed: '', loading: false, preview: false, applied: false, press: false }
const poster: S = { typed: NAME, loading: false, preview: true, applied: true, press: false }

const CHANGES = [
  ['Priorities', 'Rocks'],
  ['Weekly meeting', 'Level 10 Meeting'],
  ['Vision plan', 'V/TO'],
]

async function script(a: Act<S>) {
  await a.wait(900)
  a.mark('type')
  await a.type('typed', NAME, { interval: 45 })
  await a.wait(250)
  a.mark('fetch')
  await a.set({ loading: true })
  await a.wait(900)
  a.mark('preview')
  await a.set({ loading: false, preview: true })
  await a.wait(1800)
  a.mark('apply')
  await a.move({ at: 'apply', x: 0.5, y: 0.55 })
  await a.set({ press: true })
  await a.click()
  await a.set({ press: false, applied: true })
  await a.wait(2600)
}

function SettingsNav() {
  const item = (icon: React.ReactNode, label: string, active?: boolean) => (
    <div className="k-nav" data-active={active || undefined}>{icon}<span>{label}</span></div>
  )
  return (
    <div className="k-side">
      <div className="k-brand"><span className="k-brand__word">Settings</span></div>
      <div className="k-group">
        <div className="k-section">Organization</div>
        {item(<Building2 {...I} />, 'General')}
        {item(<Palette {...I} />, 'Brand')}
        {item(<Type {...I} />, 'Terminology', true)}
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

export default function MovaraPackImport() {
  return (
    <Stage width={920} height={560} initial={initial} poster={poster} script={script} play="once" fidelity="realistic" cursor={{ at: { x: 860, y: 500 } }} className="movara ki">
      {(s) => (
        <Window className="k-window ki-window" sidebar={<SettingsNav />} sidebarWidth={196} lead={<span className="ki-crumb">Terminology</span>} body={{ className: 'ki-body', 'data-crop': true }}>
          <div className="ki-page">
            <div className="ki-active">
              <div>
                <div className="ki-active__label">Active pack</div>
                <div className="ki-active__name">Standard <span>· built in</span></div>
              </div>
              <span className="k-btn">Import pack</span>
            </div>
            {[['Priority', 'Quarterly goals'], ['Metric', 'Scorecard numbers'], ['Weekly meeting', 'Team meeting'], ['Vision plan', 'Vision'], ['Issue', 'Problems to solve']].map(([t, c]) => (
              <div key={t} className="ki-term"><span className="ki-term__t">{t}</span><span className="ki-term__c">{c}</span></div>
            ))}
          </div>

          <div className="ki-scrim" />
          <section className="ki-dialog">
            <div className="ki-dialog__title">Import terminology pack</div>
            <Segmented items={['npm package', 'URL', 'File']} value={0} className="ki-seg" />
            <Field value={s.typed} placeholder="@scope/pack-name" focused={!s.preview} trailing={s.loading ? <Spinner size={14} /> : s.preview ? <Check on size={16} /> : null} className="ki-field" />
            <Collapse open={s.preview}>
              <div className="ki-preview">
                <div className="ki-pack">
                  <div className="ki-pack__name">EOS <span>v1.0.0 · Movara community</span></div>
                  <div className="ki-pack__meta">12 terms · 1 meeting template · data only, no code runs</div>
                </div>
                <div className="ki-changes">
                  {CHANGES.map(([from, to]) => (
                    <div key={from} className="ki-change">
                      <span className="ki-change__from">{from}</span>
                      <ArrowRight size={13} strokeWidth={1.8} />
                      <span className="ki-change__to">{to}</span>
                    </div>
                  ))}
                  <div className="ki-change ki-change--more">and 9 more</div>
                </div>
                <div className="ki-attrib">EOS® and related terms are trademarks of EOS Worldwide, LLC. Community pack, not affiliated or endorsed.</div>
              </div>
            </Collapse>
            <div className="ki-actions">
              <span className="k-btn">Cancel</span>
              <span className="k-btn ki-apply" data-primary data-target="apply" data-cursor="pointer" data-pressed={s.press || undefined} data-done={s.applied || undefined}>
                <States value={s.applied ? 'done' : 'idle'} states={{ idle: 'Apply pack', done: <span className="ki-done"><Check on size={14} />Applied</span> }} />
              </span>
            </div>
          </section>
        </Window>
      )}
    </Stage>
  )
}
