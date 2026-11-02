import { StubPage } from '@/components/shell/stub-page'
import { requireModule } from '@/lib/ctx'

// STUB: a feature agent replaces this page.
export default async function Page({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params
  await requireModule(org, 'agents')
  return <StubPage title="MCP & API keys" icon="keys" description="Issue API keys for server-to-server agents and find the MCP endpoint." />
}
