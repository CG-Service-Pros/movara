import { StubPage } from '@/components/shell/stub-page'
import { requireModule } from '@/lib/ctx'

// STUB: a feature agent replaces this page. Keep: params handling, requireModule, terminology for every label.
export default async function Page({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params
  const { terms } = await requireModule(org, 'issues')
  return <StubPage title={terms.t('issues_list', 'short')} icon="issues" description={terms.term('issue').description} />
}
