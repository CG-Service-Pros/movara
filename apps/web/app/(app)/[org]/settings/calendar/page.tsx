import { hasRole } from '@movara/core'
import { Page } from '@/components/shell/page'
import { CalendarForm } from '@/components/settings/calendar-form'
import { SettingsBody } from '@/components/settings/ui'
import { getOrgContext } from '@/lib/ctx'

export default async function CalendarPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params
  const { ctx, org } = await getOrgContext(slug)
  return (
    <Page title="Calendar" meta="Fiscal year and week">
      <SettingsBody>
        <CalendarForm slug={slug} canEdit={hasRole(ctx, 'admin')} init={{ fiscalYearStartMonth: org.fiscalYearStartMonth, weekStartDay: org.weekStartDay, timezone: org.timezone }} />
      </SettingsBody>
    </Page>
  )
}
