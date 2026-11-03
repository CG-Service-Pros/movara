import { hasRole } from '@movara/core'
import { Page } from '@/components/shell/page'
import { GeneralForm } from '@/components/settings/general-form'
import { SettingsBody } from '@/components/settings/ui'
import { getOrgContext } from '@/lib/ctx'

export default async function GeneralPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params
  const { ctx, org } = await getOrgContext(slug)
  return (
    <Page title="General" meta="Organization">
      <SettingsBody>
        <GeneralForm slug={slug} name={org.name} timezone={org.timezone} canEdit={hasRole(ctx, 'admin')} />
      </SettingsBody>
    </Page>
  )
}
