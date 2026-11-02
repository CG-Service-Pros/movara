import { StubPage } from '@/components/shell/stub-page'
import { getOrgContext } from '@/lib/ctx'

// STUB: a feature agent replaces this page.
export default async function Page({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params
  await getOrgContext(org)
  return <StubPage title="Approvals" icon="approvals" description="Consequential changes proposed by agents wait here for a person." />
}
