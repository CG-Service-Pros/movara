import { StubPage } from '@/components/shell/stub-page'
import { getOrgContext } from '@/lib/ctx'

// STUB: a feature agent replaces this page.
export default async function Page({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params
  await getOrgContext(org)
  return <StubPage title="Terminology" icon="terminology" description="Choose a terminology pack, import one, or rename individual terms." />
}
