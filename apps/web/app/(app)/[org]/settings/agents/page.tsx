import { StubPage } from '@/components/shell/stub-page'
import { requireModule } from '@/lib/ctx'

// STUB: a feature agent replaces this page.
export default async function Page({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params
  await requireModule(org, 'agents')
  return <StubPage title="Connected agents" icon="agents" description="Agents act in Motion with their own scopes. Everything they do is attributed and audited." />
}
