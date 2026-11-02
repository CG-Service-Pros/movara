import { Bar, Segmented, Stage, Swap, Text, Window, type Act } from '../../kit'
import { EOS, STANDARD, Sidebar, StatusGlyph, type Terms } from '../_motion/shared'
import '../_motion/motion.css'
import './terms.css'

// Terminology packs, the white-label setting that renames the product.
// The product (a team's priorities page) sits behind; the Terminology panel
// straddles its right edge over the page's empty margin. The cursor picks the
// EOS pack: the panel's values, the sidebar and the page title all swap
// together, so the cause is plain without a leader line.
//
// Real strings: the sidebar labels and page title (they are what changes),
// the panel's title, pack names and its four mappings. Rows are filler.

type S = { pack: number }
const PACKS: Terms[] = [STANDARD, EOS]
const initial: S = { pack: 0 }
const poster: S = { pack: 1 }

const MAP: { concept: string; key: keyof Terms }[] = [
  { concept: 'Quarterly goals', key: 'priorities' },
  { concept: 'Team meeting', key: 'meeting' },
  { concept: 'Vision', key: 'vision' },
  { concept: 'Org chart', key: 'chart' },
]

async function script(a: Act<S>) {
  await a.wait(1200)
  a.mark('pick')
  await a.click({ at: 'pack-1', x: 0.5, y: 0.55 })
  a.put({ pack: 1 })
  await a.wait(600)
  await a.move({ at: 'panel', x: 0.82, y: 1.25 })
  await a.wait(2600)
}

const ROWS = [
  { s: 'on' as const, w: 150 },
  { s: 'off' as const, w: 120 },
  { s: 'on' as const, w: 168 },
  { s: 'on' as const, w: 104 },
  { s: 'done' as const, w: 136 },
  { s: 'on' as const, w: 124 },
  { s: 'off' as const, w: 142 },
  { s: 'on' as const, w: 98 },
]

export default function MotionTerms() {
  return (
    <Stage width={760} height={470} initial={initial} poster={poster} script={script} play="once" cursor={{ at: { x: 700, y: 430 } }} className="motion kt">
      {(s) => {
        const terms = PACKS[s.pack]!
        return (
          <>
            <Window className="k-window kt-window ss-fade-b" lead={<div className="kt-title"><Swap id={terms.priorities}>{terms.priorities}</Swap><span className="kt-title__q">Q4 2026</span></div>} sidebar={<Sidebar active="priorities" terms={terms} label={(_k, t) => <Swap id={t}>{t}</Swap>} />} sidebarWidth={188}>
              <div className="kt-page">
                <div className="kt-rows">
                  {ROWS.map((r, i) => (
                    <div key={i} className="kt-row">
                      <StatusGlyph s={r.s} />
                      <Bar w={r.w} h={6} tone={3} />
                    </div>
                  ))}
                </div>
              </div>
            </Window>

            <section className="kt-panel" data-target="panel">
              <Text className="kt-panel__title">Terminology</Text>
              <Text className="kt-panel__hint">The words your company uses, everywhere in the app and in agent tools.</Text>
              <Segmented items={['Standard', 'EOS', 'Custom']} value={s.pack} targets={['pack-0', 'pack-1', 'pack-2']} className="kt-seg" />
              <div className="kt-map">
                {MAP.map((m) => (
                  <div key={m.key} className="kt-map__row">
                    <span className="kt-map__concept">{m.concept}</span>
                    <span className="kt-map__term"><Swap id={terms[m.key]}>{terms[m.key]}</Swap></span>
                  </div>
                ))}
              </div>
            </section>
          </>
        )
      }}
    </Stage>
  )
}
