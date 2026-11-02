import { StubPage } from '@/components/shell/stub-page'
import { requireModule } from '@/lib/ctx'

// STUB: meeting detail / live meeting mode. A feature agent replaces this page.
export default async function Page({ params }: { params: Promise<{ org: string; id: string }> }) {
  const { org, id } = await params
  const { terms } = await requireModule(org, 'meetings')
  return <StubPage title={terms.t('weekly_meeting', 'short')} meta={id.slice(0, 8)} icon="meeting" description={terms.term('weekly_meeting').description} />
}
