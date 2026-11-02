import { StubPage } from '@/components/shell/stub-page'
import { getOrgContext } from '@/lib/ctx'

// STUB: a feature agent replaces this page. Keep: params handling, requireModule, terminology for every label.
export default async function Page({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params
  const { terms } = await getOrgContext(org)
  return <StubPage title={`Home`} icon="home" description={'Your week: priorities, numbers, to-dos and your next meeting land here.'} />
}
