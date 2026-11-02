import { hasRole, terminologyHistoryOf } from '@motion/core'
import { previewImport, TERM_KEYS, STANDARD_PACK, resolveTerm } from '@motion/terminology'
import { Page } from '@/components/shell/page'
import { SettingsBody } from '@/components/settings/ui'
import { TerminologyPanel, type Preinstalled, type TermRow } from '@/components/settings/terminology-panel'
import { getOrgContext } from '@/lib/ctx'
import { loadPreinstalledPacks } from '@/lib/terminology-import'

const humanize = (k: string) => k.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase())

export default async function TerminologyPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params
  const { ctx, terms, org } = await getOrgContext(slug)
  const pack = org.terminologyPack ?? undefined
  const overrides = org.terminologyOverrides ?? {}

  const rows: TermRow[] = TERM_KEYS.map((key) => {
    const base = resolveTerm(key, pack)
    const effective = terms.term(key)
    return {
      key,
      label: humanize(key),
      base: { singular: base.singular, plural: base.plural, short: base.short },
      effective: { singular: effective.singular, plural: effective.plural, short: effective.short },
      override: overrides[key],
    }
  })

  const pre = await loadPreinstalledPacks()
  const preinstalled: Preinstalled[] = pre.map((p) => {
    if (p.error || !p.pack) return { spec: p.spec, error: p.error }
    const r = previewImport(p.pack, pack)
    if (!r.ok) return { spec: p.spec, error: 'Invalid pack: ' + (r.errors[0]?.message ?? 'unknown') }
    return {
      spec: p.spec,
      preview: { pack: r.pack, changes: r.changes, termCount: Object.keys(r.pack.terms).length, templates: (r.pack.meetingTemplates ?? []).map((t) => ({ key: t.key, name: t.name, items: t.agenda.length })) },
    }
  })

  const history = terminologyHistoryOf(org)
  const prev = history[history.length - 1]
  const previousName = history.length ? (prev ? prev.name : STANDARD_PACK.name) : null

  return (
    <Page title="Terminology" meta="The words your company uses">
      <SettingsBody wide>
        <TerminologyPanel
          slug={slug}
          orgName={org.name}
          canEdit={hasRole(ctx, 'admin')}
          active={pack ? { id: pack.id, name: pack.name, version: pack.version, author: pack.author, attribution: pack.attribution } : null}
          previousName={previousName}
          historyDepth={history.length}
          rows={rows}
          overrides={overrides}
          templates={pack?.meetingTemplates ?? null}
          statuses={pack?.statuses}
          preinstalled={preinstalled}
        />
      </SettingsBody>
    </Page>
  )
}
