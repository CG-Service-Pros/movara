import { hasRole } from '@movara/core'
import { Page } from '@/components/shell/page'
import { BrandForm } from '@/components/settings/brand-form'
import { SettingsBody } from '@/components/settings/ui'
import { getOrgContext } from '@/lib/ctx'

export default async function BrandPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params
  const { ctx, org } = await getOrgContext(slug)
  const b = org.branding
  return (
    <Page title="Brand" meta="Wordmark, logo and accent color">
      <SettingsBody>
        <BrandForm slug={slug} orgName={org.name} canEdit={hasRole(ctx, 'admin')} init={{ wordmark: b.wordmark ?? '', logoLight: b.logoLight, logoDark: b.logoDark, accent: b.accent ?? '#2f5bea' }} />
      </SettingsBody>
    </Page>
  )
}
