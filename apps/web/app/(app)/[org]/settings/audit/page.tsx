import { StubPage } from '@/components/shell/stub-page'
import { getOrgContext } from '@/lib/ctx'

// STUB: a feature agent replaces this page.
export default async function Page({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params
  await getOrgContext(org)
  return <StubPage title="Audit log" icon="audit" description="Every change, with who did it and on whose behalf." />
}
