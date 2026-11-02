import { hasRole, listPeople } from '@motion/core'
import { Page } from '@/components/shell/page'
import { MembersPanel } from '@/components/settings/members-panel'
import { SettingsBody } from '@/components/settings/ui'
import { getOrgContext } from '@/lib/ctx'

export default async function MembersPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params
  const { ctx } = await getOrgContext(slug)
  const people = await listPeople(ctx)
  const me = ctx.actor.type === 'person' ? ctx.actor.id : ctx.actor.onBehalfOf
  return (
    <Page title="Members" meta={`${people.length} people`}>
      <SettingsBody>
        <MembersPanel
          slug={slug}
          canEdit={hasRole(ctx, 'admin')}
          isOwner={hasRole(ctx, 'owner')}
          members={people.map((p) => ({ id: p.id, name: p.name, email: p.email, role: p.role, joined: !!p.userId, isMe: p.id === me }))}
        />
      </SettingsBody>
    </Page>
  )
}
