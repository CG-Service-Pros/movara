import { StubPage } from '@/components/shell/stub-page'
import { requireModule } from '@/lib/ctx'

// STUB: a feature agent replaces this page. Keep: params handling, requireModule, terminology for every label.
export default async function Page({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params
  const { terms } = await requireModule(org, 'scorecard')
  return <StubPage title={terms.t('scorecard')} icon="scorecard" description={terms.term('scorecard').description} />
}
